import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import { evaluationCases, frozenRubricSha256, validControlIds } from "@/lib/eval/cases";
import {
  assertEvidenceManifest,
  evaluationManifestSchema,
  evaluationReportSchema,
  evaluationRunSchema,
} from "@/lib/eval/report";

const root = process.cwd();
const liveRoot = join(root, "demo", "generated-files", "evidence", "live", "evaluation");
const manifestPath = join(liveRoot, "manifest.json");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const [liveText, seededText, manifestText, rubricText] = await Promise.all([
  readFile(join(liveRoot, "evaluation-report.json"), "utf8"),
  readFile(join(root, "demo", "generated-files", "evidence", "seeded", "evaluation-report.json"), "utf8"),
  readFile(manifestPath, "utf8"),
  readFile(join(liveRoot, "rubric.json"), "utf8"),
]);
assertSanitizedEvidence([liveText, seededText, manifestText, rubricText].join("\n"));
const live = evaluationReportSchema.parse(JSON.parse(liveText));
const seeded = evaluationReportSchema.parse(JSON.parse(seededText));
const manifest = evaluationManifestSchema.parse(JSON.parse(manifestText));
if (live.source !== "live" || seeded.source !== "seeded") throw new Error("Evidence sources are not separated.");
if (live.rubricSha256 !== frozenRubricSha256 || manifest.rubricSha256 !== frozenRubricSha256) {
  throw new Error("Evaluation evidence does not use the frozen rubric.");
}
if (live.evidenceManifestSha256 !== sha256(manifestText) || seeded.evidenceManifestSha256 !== sha256(manifestText)) {
  throw new Error("Evaluation reports do not verify against the evidence manifest.");
}
await assertEvidenceManifest(manifest, (path) => readFile(join(root, path)));
for (const entry of manifest.entries) {
  assertSanitizedEvidence((await readFile(join(root, entry.path))).toString("utf8"));
}
const runs = [];
for (const testCase of evaluationCases) {
  for (const condition of ["baseline", "protected"] as const) {
    const run = evaluationRunSchema.parse(
      JSON.parse(await readFile(join(liveRoot, "cases", testCase.id, condition, "run.json"), "utf8")),
    );
    runs.push(run);
    if (condition === "baseline" && Object.values(run.exposure).some(Boolean)) {
      throw new Error(`Baseline artifact isolation failed: ${testCase.id}.`);
    }
  }
}
if (new Set(runs.map((run) => run.runId)).size !== 10) throw new Error("Evaluation run IDs are not unique.");
const baselineViolations = runs.filter(
  (run) => run.condition === "baseline" && run.outcome.policyViolation,
).length;
const protectedViolations = runs.filter(
  (run) => run.condition === "protected" && run.outcome.policyViolation,
).length;
if (
  live.metrics.policyViolations.baseline !== baselineViolations ||
  live.metrics.policyViolations.protected !== protectedViolations
) {
  throw new Error("Policy-violation metrics are not derived from run evidence.");
}
if (live.metrics.improvementDelta <= 0) throw new Error("Protected outcomes did not improve over baseline.");
if (live.metrics.falseBlockRate !== 0) throw new Error("A valid control was blocked.");
if (JSON.stringify(live.controls.map((control) => control.id)) !== JSON.stringify(validControlIds)) {
  throw new Error("Evaluation report does not contain the frozen valid controls.");
}
if (JSON.stringify(live.pairs) !== JSON.stringify(seeded.pairs) || JSON.stringify(live.metrics) !== JSON.stringify(seeded.metrics)) {
  throw new Error("Seeded judge evidence does not reproduce live report results.");
}
process.stdout.write("Phase 4 live and seeded evaluation evidence verified.\n");
