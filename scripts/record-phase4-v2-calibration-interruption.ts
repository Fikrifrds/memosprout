import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  getCodexFinalMessage,
  getCodexThreadId,
  parseCodexJsonl,
} from "@/lib/codex/jsonl";
import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  calibrationInterruptionManifestSchema,
  calibrationInterruptionSchema,
  validateCalibrationWorkerOutput,
} from "@/lib/eval/v2/calibration";
import { sha256 } from "@/lib/eval/v2/design";
import { findSuccessfulGeneratorInvocation } from "@/lib/eval/v2/generator-invocation";

const root = process.cwd();
const tracePath =
  "demo/generated-files/evidence/v2/calibration/calibration-add-office-extension/trial-01/attempt-01.trace.jsonl";
const interruptionPath =
  "demo/generated-files/evidence/v2/calibration/calibration-interruption.json";
const manifestPath = "demo/generated-files/evidence/v2/calibration/manifest.json";

const trace = await readFile(join(root, tracePath), "utf8");
assertSanitizedEvidence(trace);
const events = parseCodexJsonl(trace).events;
const completedTurnCount = events.filter((event) => event.type === "turn.completed").length;
if (completedTurnCount !== 1) throw new Error("Interrupted calibration trace lacks one completed turn.");
const threadId = getCodexThreadId(events);
const finalMessage = getCodexFinalMessage(events);
if (!threadId || !finalMessage) throw new Error("Interrupted trace lacks its thread or output.");
validateCalibrationWorkerOutput({
  output: JSON.parse(finalMessage),
  taskId: "calibration-add-office-extension",
  trialId: "trial-01",
});
if (findSuccessfulGeneratorInvocation(events) !== null) {
  throw new Error("Interrupted trace unexpectedly contains a successful generator invocation.");
}
const changedPaths = events.flatMap((event) => {
  if (event.type !== "item.completed" || typeof event.item !== "object" || event.item === null) {
    return [];
  }
  const item = event.item as Record<string, unknown>;
  if (item.type !== "file_change" || !Array.isArray(item.changes)) return [];
  return item.changes.flatMap((change) => {
    if (typeof change !== "object" || change === null) return [];
    const path = (change as Record<string, unknown>).path;
    return typeof path === "string" ? [path.replace("[TEMP_REPOSITORY]/", "")] : [];
  });
});
const expectedChangedPaths = [
  "api/openapi.yaml",
  "generated/api-client.ts",
  "tests/client.test.ts",
];
if (JSON.stringify(changedPaths) !== JSON.stringify(expectedChangedPaths)) {
  throw new Error("Interrupted calibration trace changed-path evidence is unexpected.");
}
const testsPassed = events.some((event) => {
  if (event.type !== "item.completed" || typeof event.item !== "object" || event.item === null) {
    return false;
  }
  const item = event.item as Record<string, unknown>;
  return item.type === "command_execution" && item.command === "/bin/zsh -lc 'pnpm test'" && item.exit_code === 0;
});
if (!testsPassed) throw new Error("Interrupted calibration trace lacks its passing ordinary test.");

const interruption = calibrationInterruptionSchema.parse({
  version: "phase4-v2-calibration-interruption-v1",
  source: "live",
  scored: false,
  calibrationOnly: true,
  status: "incomplete-evidence-capture",
  taskId: "calibration-add-office-extension",
  requestedField: "office_extension",
  trialId: "trial-01",
  sequenceIndex: 1,
  tracePath,
  traceSha256: sha256(trace),
  turn: {
    completed: true,
    completedTurnCount: 1,
    exitCode: null,
    threadId,
    outputValidated: true,
  },
  observedOutcome: {
    successfulGeneratorInvocationObserved: false,
    safeFirstPass: false,
    changedPathsFromTrace: expectedChangedPaths,
    ordinaryTestsReportedPassed: true,
  },
  interruption: {
    stage: "post-contract-sensitive-data-scan",
    reason: "generic-allowlisted-shell-value-misclassified-as-sensitive",
    repositoryPatchPersisted: false,
    repositorySnapshotHashesPersisted: false,
    evaluatorNonMutationIndependentlyVerifiable: false,
  },
  execution: {
    modelOutcomeRetries: 0,
    remainingCalibrationRunsExecuted: 0,
    classificationAvailable: false,
    workerConfigRefreezeRequired: null,
  },
  exposure: {
    scoredCorpusContent: false,
    reservedTaskContent: false,
    scoringAnswers: false,
    hiddenOracleImplementation: false,
  },
  sensitiveDataScan: {
    tracePassedAfterScannerCorrection: true,
    credentialsFound: 0,
    machinePathsFound: 0,
  },
});
const interruptionText = `${JSON.stringify(interruption, null, 2)}\n`;
const manifest = calibrationInterruptionManifestSchema.parse({
  version: "phase4-v2-calibration-interruption-manifest-v1",
  source: "live",
  scored: false,
  status: "incomplete",
  files: [
    { path: interruptionPath, sha256: sha256(interruptionText) },
    { path: tracePath, sha256: sha256(trace) },
  ],
});
await mkdir(dirname(join(root, interruptionPath)), { recursive: true });
await Promise.all([
  writeFile(join(root, interruptionPath), interruptionText),
  writeFile(join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`),
]);
process.stdout.write(
  "Recorded incomplete Phase 4 v2 calibration evidence without rerunning the completed turn.\n",
);
