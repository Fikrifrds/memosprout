import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  assertProtectionAcceptance,
  runProtectionAcceptanceSuite,
} from "@/lib/codex/acceptance";
import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import { evaluationCases, frozenRubricSha256, validControlIds } from "@/lib/eval/cases";
import {
  buildEvaluationReport,
  evaluationManifestSchema,
  evaluationRunSchema,
  type EvaluationRun,
} from "@/lib/eval/report";
import {
  readExecutableVersion,
  resolveExecutable,
  runEvaluationCase,
} from "@/lib/eval/runner";

const root = process.cwd();
const liveRoot = join(root, "demo", "generated-files", "evidence", "live", "evaluation");
const seededRoot = join(root, "demo", "generated-files", "evidence", "seeded");
const casesRoot = join(liveRoot, "cases");

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadRun(caseId: string, condition: "baseline" | "protected") {
  const path = join(casesRoot, caseId, condition, "run.json");
  return evaluationRunSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

const rubric = JSON.parse(await readFile(join(liveRoot, "rubric.json"), "utf8")) as {
  sha256?: unknown;
};
if (rubric.sha256 !== frozenRubricSha256) {
  throw new Error("The persisted rubric does not match the frozen Phase 4 rubric.");
}

const baselineRuns = await Promise.all(
  evaluationCases.map((testCase) => loadRun(testCase.id, "baseline")),
);
try {
  await stat(join(casesRoot, evaluationCases[0]!.id, "protected", "run.json"));
  throw new Error("Live protected evidence already exists; model outcomes must not be rerun.");
} catch (error) {
  if (error instanceof Error && error.message.includes("must not be rerun")) throw error;
}
const [codexExecutable, pnpmExecutable] = await Promise.all([
  resolveExecutable("codex"),
  resolveExecutable("pnpm"),
]);
const codexVersion = await readExecutableVersion(codexExecutable);
const protectedRuns: EvaluationRun[] = [];
for (const testCase of evaluationCases) {
  protectedRuns.push(
    await runEvaluationCase({
      testCase,
      condition: "protected",
      evidenceDirectory: casesRoot,
      codexExecutable,
      codexVersion,
      pnpmExecutable,
    }),
  );
  const current = protectedRuns.at(-1)!;
  process.stdout.write(
    `Protected ${testCase.id}: ${current.outcome.taskSuccess ? "success" : "failure"}; policy violation ${current.outcome.policyViolation}.\n`,
  );
}

const acceptance = await runProtectionAcceptanceSuite();
assertProtectionAcceptance(acceptance);
const controls = acceptance.valid.map((result) => ({
  id: result.id,
  expected: "allow" as const,
  observed: result.observed,
  passed: result.observed === "allow" && result.repositoryUnchanged,
}));
if (JSON.stringify(controls.map((control) => control.id)) !== JSON.stringify(validControlIds)) {
  throw new Error("Protection controls differ from the frozen Phase 4 control set.");
}
await writeFile(join(liveRoot, "controls.json"), `${JSON.stringify(controls, null, 2)}\n`, "utf8");

async function collectEvidenceFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await collectEvidenceFiles(absolute)));
    else if (entry.isFile() && entry.name !== "manifest.json" && !entry.name.endsWith("report.json")) {
      paths.push(absolute);
    }
  }
  return paths.sort();
}

const evidenceFiles = await collectEvidenceFiles(liveRoot);
const manifest = evaluationManifestSchema.parse({
  version: "1",
  generatedAt: new Date().toISOString(),
  rubricSha256: frozenRubricSha256,
  entries: await Promise.all(
    evidenceFiles.map(async (path) => ({
      path: relative(root, path),
      sha256: sha256(await readFile(path)),
    })),
  ),
});
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestPath = join(liveRoot, "manifest.json");
await writeFile(manifestPath, manifestText, "utf8");
const allRuns = [...baselineRuns, ...protectedRuns];
const reportOptions = {
  createdAt: new Date().toISOString(),
  rubricSha256: frozenRubricSha256,
  rubricPath: relative(root, join(liveRoot, "rubric.json")),
  runs: allRuns,
  controls,
  evidenceManifestPath: relative(root, manifestPath),
  evidenceManifestSha256: sha256(manifestText),
};
const liveReport = buildEvaluationReport({ source: "live", ...reportOptions });
const seededReport = buildEvaluationReport({ source: "seeded", ...reportOptions });
const serialized = [JSON.stringify(liveReport), JSON.stringify(seededReport), manifestText].join("\n");
assertSanitizedEvidence(serialized);
await mkdir(seededRoot, { recursive: true });
await Promise.all([
  writeFile(join(liveRoot, "evaluation-report.json"), `${JSON.stringify(liveReport, null, 2)}\n`, "utf8"),
  writeFile(join(seededRoot, "evaluation-report.json"), `${JSON.stringify(seededReport, null, 2)}\n`, "utf8"),
]);

if (liveReport.metrics.improvementDelta <= 0) {
  throw new Error(
    `Phase 4 stopping rule reached: improvement delta ${liveReport.metrics.improvementDelta} is not positive.`,
  );
}
if (liveReport.metrics.falseBlockRate !== 0) {
  throw new Error("Phase 4 stopping rule reached: a valid control was blocked.");
}
process.stdout.write(
  `Phase 4 live evaluation completed: baseline ${liveReport.metrics.baselineCorrectWorkflowRate}, protected ${liveReport.metrics.protectedCorrectWorkflowRate}, delta ${liveReport.metrics.improvementDelta}.\n`,
);
