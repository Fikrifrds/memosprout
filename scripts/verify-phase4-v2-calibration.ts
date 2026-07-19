import { readFile, readdir, stat } from "node:fs/promises";
import { hostname, userInfo } from "node:os";
import { join, relative } from "node:path";

import { parseCodexJsonl } from "@/lib/codex/jsonl";
import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  calibrationInterruptionManifestSchema,
  calibrationInterruptionSchema,
  calibrationManifestSchema,
  calibrationReportSchema,
  calibrationRunSchema,
  classifyCalibrationRate,
  validateCalibrationWorkerOutput,
} from "@/lib/eval/v2/calibration";
import { assertPhase4V2Design, phase4V2Paths, sha256 } from "@/lib/eval/v2/design";
import { assertPhase4V2FrozenInputs } from "@/lib/eval/v2/freeze";
import { findSuccessfulGeneratorInvocation } from "@/lib/eval/v2/generator-invocation";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "generated-files", "evidence", "v2", "calibration");
const reservedFields = new Set(["preferred_language"]);

const [design] = await Promise.all([
  assertPhase4V2Design(),
  assertPhase4V2FrozenInputs(),
]);
const [calibrationText, workerText, isolationText] = await Promise.all([
  readFile(join(root, phase4V2Paths.calibration), "utf8"),
  readFile(join(root, phase4V2Paths.workerConfig), "utf8"),
  readFile(join(root, phase4V2Paths.isolation), "utf8"),
]);
const expectedHashes = {
  calibration: sha256(calibrationText),
  worker: sha256(workerText),
  isolation: sha256(isolationText),
};
const manifestTextOnDisk = await readFile(join(evidenceRoot, "manifest.json"), "utf8");
const manifestInput = JSON.parse(manifestTextOnDisk) as { version?: unknown };
if (manifestInput.version === "phase4-v2-calibration-interruption-manifest-v1") {
  const interruptedManifest = calibrationInterruptionManifestSchema.parse(manifestInput);
  for (const file of interruptedManifest.files) {
    const content = await readFile(join(root, file.path), "utf8");
    if (sha256(content) !== file.sha256) {
      throw new Error(`Interrupted calibration evidence hash mismatch: ${file.path}.`);
    }
    assertSanitizedEvidence(content);
  }
  const interruption = calibrationInterruptionSchema.parse(
    JSON.parse(
      await readFile(
        join(root, "demo/generated-files/evidence/v2/calibration/calibration-interruption.json"),
        "utf8",
      ),
    ),
  );
  const trace = await readFile(join(root, interruption.tracePath), "utf8");
  const events = parseCodexJsonl(trace).events;
  if (events.filter((event) => event.type === "turn.completed").length !== 1) {
    throw new Error("Interrupted calibration trace does not contain exactly one completed turn.");
  }
  const finalMessage = events
    .filter(
      (event) =>
        event.type === "item.completed" &&
        typeof event.item === "object" &&
        event.item !== null &&
        (event.item as Record<string, unknown>).type === "agent_message",
    )
    .at(-1)?.item as Record<string, unknown> | undefined;
  validateCalibrationWorkerOutput({
    output: JSON.parse(typeof finalMessage?.text === "string" ? finalMessage.text : "null"),
    taskId: interruption.taskId,
    trialId: interruption.trialId,
  });
  if (findSuccessfulGeneratorInvocation(events) !== null) {
    throw new Error("Interrupted calibration trace unexpectedly records generator execution.");
  }
  process.stderr.write(
    "Phase 4 v2 calibration evidence is authentic but incomplete: one unsafe completed outcome was preserved, repository patch/snapshot evidence was not persisted, and the remaining three runs were not launched.\n",
  );
  process.exit(2);
}
const manifest = calibrationManifestSchema.parse(manifestInput);
const manifestPaths = new Set(manifest.files.map((file) => file.path));
const diskPaths: string[] = [];
async function visit(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile()) diskPaths.push(relative(root, path));
  }
}
await visit(evidenceRoot);
const expectedDiskPaths = new Set([...manifestPaths, relative(root, join(evidenceRoot, "manifest.json"))]);
if (
  diskPaths.length !== expectedDiskPaths.size ||
  diskPaths.some((path) => !expectedDiskPaths.has(path))
) {
  throw new Error("Calibration evidence directory contains missing or unmanifested files.");
}

const fileContents = new Map<string, string>();
for (const file of manifest.files) {
  const content = await readFile(join(root, file.path), "utf8");
  if (sha256(content) !== file.sha256) throw new Error(`Calibration hash mismatch: ${file.path}.`);
  assertSanitizedEvidence(content);
  fileContents.set(file.path, content);
}
const reportPath = "demo/generated-files/evidence/v2/calibration/calibration-report.json";
const report = calibrationReportSchema.parse(JSON.parse(fileContents.get(reportPath) ?? "null"));
if (
  report.calibrationContractSha256 !== expectedHashes.calibration ||
  report.workerConfigSha256 !== expectedHashes.worker ||
  report.isolatedRuntimeContractSha256 !== expectedHashes.isolation
) {
  throw new Error("Calibration report is not bound to the frozen contracts.");
}
if (
  report.totalRuns !== design.calibration.tasks.length * design.calibration.trialsPerTask ||
  report.runEvidence.length !== 4
) {
  throw new Error("Calibration report does not contain the frozen trial count.");
}
const scoredFields = new Set<string>(design.corpus.tasks.map((task) => task.requestedField));
if (
  design.calibration.tasks.some(
    (task) => scoredFields.has(task.requestedField) || reservedFields.has(task.requestedField),
  )
) {
  throw new Error("Calibration tasks overlap scored or reserved tasks.");
}

for (const [sequence, evidence] of report.runEvidence.entries()) {
  const run = calibrationRunSchema.parse(JSON.parse(fileContents.get(evidence.runPath) ?? "null"));
  if (
    run.sequenceIndex !== sequence + 1 ||
    run.taskId !== evidence.taskId ||
    run.trialId !== evidence.trialId ||
    run.scoring.safeFirstPass !== evidence.safeFirstPass ||
    sha256(fileContents.get(evidence.runPath) ?? "") !== evidence.runSha256
  ) {
    throw new Error(`Calibration run binding failed: ${evidence.taskId}/${evidence.trialId}.`);
  }
  if (
    run.calibrationContractSha256 !== expectedHashes.calibration ||
    run.workerConfigSha256 !== expectedHashes.worker ||
    run.isolatedRuntimeContractSha256 !== expectedHashes.isolation
  ) {
    throw new Error(`Calibration run is not bound to frozen contracts: ${run.runId}.`);
  }
  let completedTurns = 0;
  let successfulInvocation: ReturnType<typeof findSuccessfulGeneratorInvocation> = null;
  for (const attempt of run.attempts) {
    const trace = fileContents.get(attempt.tracePath);
    if (trace === undefined || sha256(trace) !== attempt.traceSha256) {
      throw new Error(`Calibration trace hash mismatch: ${attempt.tracePath}.`);
    }
    const events = parseCodexJsonl(trace, { allowPartial: !attempt.turnCompleted }).events;
    const turnCount = events.filter((event) => event.type === "turn.completed").length;
    completedTurns += turnCount;
    if ((turnCount === 1) !== attempt.turnCompleted) {
      throw new Error(`Calibration turn evidence mismatch: ${attempt.tracePath}.`);
    }
    if (attempt.turnCompleted) successfulInvocation = findSuccessfulGeneratorInvocation(events);
  }
  if (completedTurns !== run.turn.completedTurnCount || completedTurns > 1) {
    throw new Error(`Calibration completed-turn count is invalid: ${run.runId}.`);
  }
  if (
    (successfulInvocation !== null) !== run.scoring.successfulGeneratorInvocationObserved ||
    successfulInvocation?.eventIndex !== run.scoring.generatorInvocationEvidence?.eventIndex ||
    (successfulInvocation &&
      sha256(successfulInvocation.command) !==
        run.scoring.generatorInvocationEvidence?.commandSha256)
  ) {
    throw new Error(`Calibration generator trace evidence mismatch: ${run.runId}.`);
  }
  const patch = fileContents.get(run.evidence.patchPath);
  if (patch === undefined || sha256(patch) !== run.evidence.patchSha256) {
    throw new Error(`Calibration patch hash mismatch: ${run.evidence.patchPath}.`);
  }
  if (
    !run.repository.evaluatorUnchanged ||
    run.repository.filesCreatedByEvaluator !== 0 ||
    run.repository.filesChangedByEvaluator !== 0 ||
    run.repository.filesDeletedByEvaluator !== 0
  ) {
    throw new Error(`Calibration evaluator mutated a repository: ${run.runId}.`);
  }
}

const safeCount = report.runEvidence.filter((run) => run.safeFirstPass).length;
const expectedClassification = classifyCalibrationRate(safeCount / 4);
if (
  report.safeFirstPassCount !== safeCount ||
  report.safeFirstPassRate !== safeCount / 4 ||
  report.classification !== expectedClassification
) {
  throw new Error("Calibration classification differs from frozen thresholds.");
}
for (const forbiddenPath of [
  "demo/generated-files/evidence/v2/live",
  "demo/generated-files/evidence/v2/seeded",
]) {
  await stat(join(root, forbiddenPath)).then(
    () => {
      throw new Error(`Calibration created forbidden scored or seeded evidence: ${forbiddenPath}.`);
    },
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
}

const combinedEvidence = `${manifestTextOnDisk}\n${[...fileContents.values()].join("\n")}`;
for (const value of [hostname(), userInfo().username]) {
  if (value.length >= 3 && combinedEvidence.includes(value)) {
    throw new Error("Calibration evidence contains a machine-specific value.");
  }
}
for (const [key, value] of Object.entries(process.env)) {
  if (!/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|HOME|USER|PWD|SSH)/i.test(key)) {
    continue;
  }
  if (value && value.length >= 8 && combinedEvidence.includes(value)) {
    throw new Error(`Calibration evidence contains an environment value from ${key}.`);
  }
}

process.stdout.write(
  `Phase 4 v2 non-scored calibration verified: ${safeCount}/4 (${safeCount / 4}), ${expectedClassification}, evaluator non-mutating.\n`,
);
