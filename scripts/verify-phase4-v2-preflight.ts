import { readFile, readdir } from "node:fs/promises";
import { hostname, userInfo } from "node:os";
import { join, relative } from "node:path";

import { didCodexTurnComplete, parseCodexJsonl } from "@/lib/codex/jsonl";
import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import { assertPhase4V2Design, phase4V2Paths } from "@/lib/eval/v2/design";
import { assertPhase4V2FrozenInputs } from "@/lib/eval/v2/freeze";
import {
  countPreflightToolEvents,
  phase4V2PreflightManifestSchema,
  phase4V2PreflightRunSchema,
  sha256,
} from "@/lib/eval/v2/preflight";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "generated-files", "evidence", "v2", "preflight");

const [design] = await Promise.all([
  assertPhase4V2Design(),
  assertPhase4V2FrozenInputs(),
]);
const manifest = phase4V2PreflightManifestSchema.parse(
  JSON.parse(await readFile(join(evidenceRoot, "manifest.json"), "utf8")),
);
const expectedEntries = [
  "manifest.json",
  ...manifest.files.map((file) => relative(evidenceRoot, join(root, file.path))),
].sort();
const actualEntries = (await readdir(evidenceRoot)).sort();
if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
  throw new Error("Preflight evidence directory contains unmanifested files.");
}
for (const file of manifest.files) {
  const content = await readFile(join(root, file.path));
  if (sha256(content) !== file.sha256) throw new Error(`Preflight evidence hash mismatch: ${file.path}.`);
  assertSanitizedEvidence(content.toString("utf8"));
}

const run = phase4V2PreflightRunSchema.parse(
  JSON.parse(await readFile(join(evidenceRoot, "preflight-run.json"), "utf8")),
);
const [preflightText, workerText, isolationText] = await Promise.all([
  readFile(join(root, phase4V2Paths.preflight), "utf8"),
  readFile(join(root, phase4V2Paths.workerConfig), "utf8"),
  readFile(join(root, phase4V2Paths.isolation), "utf8"),
]);
if (
  run.preflightContractSha256 !== sha256(preflightText) ||
  run.workerConfigSha256 !== sha256(workerText) ||
  run.isolatedRuntimeContractSha256 !== sha256(isolationText) ||
  run.exposure.promptSha256 !== sha256(design.preflight.prompt)
) {
  throw new Error("Preflight evidence is not bound to the frozen contracts.");
}

let totalCompletedTurns = 0;
for (const attempt of run.attempts) {
  const trace = await readFile(join(root, attempt.tracePath), "utf8");
  const events = parseCodexJsonl(trace, { allowPartial: !attempt.turnCompleted }).events;
  const completedTurns = events.filter((event) => event.type === "turn.completed").length;
  totalCompletedTurns += completedTurns;
  if (didCodexTurnComplete(events) !== attempt.turnCompleted) {
    throw new Error(`Preflight turn-completion mismatch for attempt ${attempt.attempt}.`);
  }
  if (attempt.turnCompleted && countPreflightToolEvents(events) !== 0) {
    throw new Error("Preflight trace contains tool activity.");
  }
}
if (totalCompletedTurns !== 1) throw new Error("Preflight evidence must contain exactly one completed turn.");

const combinedEvidence = await Promise.all(
  ["manifest.json", ...manifest.files.map((file) => relative(evidenceRoot, join(root, file.path)))].map(
    (path) => readFile(join(evidenceRoot, path), "utf8"),
  ),
).then((parts) => parts.join("\n"));
for (const value of [hostname(), userInfo().username]) {
  if (value.length >= 3 && combinedEvidence.includes(value)) {
    throw new Error("Preflight evidence contains a machine-specific value.");
  }
}
for (const [key, value] of Object.entries(process.env)) {
  if (value && value.length >= 8 && combinedEvidence.includes(value)) {
    throw new Error(`Preflight evidence contains an environment value from ${key}.`);
  }
}

process.stdout.write(
  `Phase 4 v2 non-scored preflight verified: ${run.worker.resolvedModel}, ${run.worker.reasoningEffort} reasoning, exit ${run.attempts.at(-1)?.exitCode}, repository byte-identical.\n`,
);
