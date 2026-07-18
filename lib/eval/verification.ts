import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  evaluationCases,
  frozenEvaluationRubric,
  frozenRubricSha256,
  sha256Json,
  validControlIds,
} from "@/lib/eval/cases";
import {
  assertEvidenceManifest,
  evaluationControlsSchema,
  evaluationManifestSchema,
  evaluationReportSchema,
  evaluationRunSchema,
  type EvaluationReport,
  type EvaluationRun,
} from "@/lib/eval/report";
import { assertEvaluationRepositoryIsolation } from "@/lib/eval/runner";

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export class Phase4OutcomeGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Phase4OutcomeGateError";
  }
}

export function assertPhase4ReportIntegrity(reportInput: unknown): EvaluationReport {
  return evaluationReportSchema.parse(reportInput);
}

export function assertPhase4OutcomeGate(reportInput: unknown): EvaluationReport {
  const report = assertPhase4ReportIntegrity(reportInput);

  if (report.metrics.improvementDelta <= 0) {
    const ceiling = report.metrics.baselineCorrectWorkflowRate === 1;
    throw new Phase4OutcomeGateError(
      ceiling
        ? "Phase 4 evidence is valid, but the positive-improvement gate failed because the baseline ceiling left no measurable headroom (baseline 5/5, protected 5/5, improvementDelta 0)."
        : `Phase 4 evidence is valid, but the positive-improvement gate failed because improvementDelta must be greater than 0 (observed ${report.metrics.improvementDelta}).`,
    );
  }
  if (report.metrics.falseBlockRate !== 0 || report.controls.some((control) => !control.passed)) {
    throw new Phase4OutcomeGateError(
      "Phase 4 evidence is valid, but the outcome gate failed because at least one valid control was blocked.",
    );
  }
  return report;
}

export function assertPhase4EvidenceRecords(options: {
  liveReport: unknown;
  seededReport: unknown;
  manifest: unknown;
  manifestText: string;
  rubric: unknown;
  runs: unknown[];
  baselinePrompt: string;
  protectedPrompt: string;
  controls: unknown;
}): { liveReport: EvaluationReport; seededReport: EvaluationReport; runs: EvaluationRun[] } {
  const liveReport = evaluationReportSchema.parse(options.liveReport);
  const seededReport = evaluationReportSchema.parse(options.seededReport);
  const manifest = evaluationManifestSchema.parse(options.manifest);
  const runs = options.runs.map((run) => evaluationRunSchema.parse(run));
  const controls = evaluationControlsSchema.parse(options.controls);
  const rubric = options.rubric as Record<string, unknown>;
  const { sha256: persistedRubricHash, ...persistedRubric } = rubric;

  if (
    persistedRubricHash !== frozenRubricSha256 ||
    sha256Json(persistedRubric) !== frozenRubricSha256 ||
    JSON.stringify(persistedRubric) !== JSON.stringify(frozenEvaluationRubric)
  ) {
    throw new Error("Evaluation evidence does not use the complete frozen rubric.");
  }
  if (options.baselinePrompt !== options.protectedPrompt) {
    throw new Error("Baseline and protected prompts are not comparable.");
  }
  if (!options.baselinePrompt.includes("{{TASK}}")) {
    throw new Error("Evaluation prompt template omits the frozen task placeholder.");
  }
  if (liveReport.source !== "live" || seededReport.source !== "seeded") {
    throw new Error("Live and seeded evidence sources are not separated.");
  }
  if (
    liveReport.rubricSha256 !== frozenRubricSha256 ||
    seededReport.rubricSha256 !== frozenRubricSha256 ||
    manifest.rubricSha256 !== frozenRubricSha256
  ) {
    throw new Error("Evaluation report or manifest does not reference the frozen rubric.");
  }
  const manifestHash = sha256(options.manifestText);
  if (
    liveReport.evidenceManifestSha256 !== manifestHash ||
    seededReport.evidenceManifestSha256 !== manifestHash
  ) {
    throw new Error("Evaluation reports do not verify against the evidence manifest.");
  }
  if (runs.length !== 10 || new Set(runs.map((run) => run.runId)).size !== 10) {
    throw new Error("Evaluation evidence must contain ten complete, unique run records.");
  }

  const expectedCases = new Map(evaluationCases.map((testCase) => [testCase.id, testCase]));
  const manifestPaths = new Set(manifest.entries.map((entry) => entry.path));
  for (const testCase of evaluationCases) {
    for (const condition of ["baseline", "protected"] as const) {
      const matches = runs.filter(
        (run) => run.case.id === testCase.id && run.condition === condition,
      );
      if (matches.length !== 1 || JSON.stringify(matches[0]!.case) !== JSON.stringify(testCase)) {
        throw new Error(`Evaluation corpus integrity failed for ${testCase.id}/${condition}.`);
      }
      const run = matches[0]!;
      if (run.rubricSha256 !== frozenRubricSha256) {
        throw new Error(`Run does not reference the frozen rubric: ${run.runId}.`);
      }
      const expectedExposure =
        condition === "baseline"
          ? {
              candidateSprout: false,
              okfArtifact: false,
              durableGuidance: false,
              executableProtection: false,
              acceptanceOracle: false,
            }
          : {
              candidateSprout: false,
              okfArtifact: false,
              durableGuidance: true,
              executableProtection: true,
              acceptanceOracle: false,
            };
      if (JSON.stringify(run.exposure) !== JSON.stringify(expectedExposure)) {
        throw new Error(`Artifact exposure rules failed for ${run.runId}.`);
      }
      for (const path of [run.artifacts.trace, run.artifacts.patch]) {
        if (!manifestPaths.has(path)) throw new Error(`Manifest omits run artifact: ${path}.`);
      }
      const pair = liveReport.pairs.find((candidate) => candidate.caseId === testCase.id);
      if (
        !pair ||
        pair[`${condition}RunId`] !== run.runId ||
        pair[`${condition}Success`] !== run.outcome.taskSuccess
      ) {
        throw new Error(`Report does not link to run evidence for ${testCase.id}/${condition}.`);
      }
    }
  }
  if (expectedCases.size !== liveReport.pairs.length) {
    throw new Error("Report corpus differs from the frozen evaluation corpus.");
  }
  const baselineViolations = runs.filter(
    (run) => run.condition === "baseline" && run.outcome.policyViolation,
  ).length;
  const protectedViolations = runs.filter(
    (run) => run.condition === "protected" && run.outcome.policyViolation,
  ).length;
  if (
    liveReport.metrics.policyViolations.baseline !== baselineViolations ||
    liveReport.metrics.policyViolations.protected !== protectedViolations
  ) {
    throw new Error("Policy-violation metrics are not derived from run evidence.");
  }
  if (
    JSON.stringify(liveReport.controls.map((control) => control.id)) !==
      JSON.stringify(validControlIds) ||
    JSON.stringify(liveReport.controls) !== JSON.stringify(controls) ||
    JSON.stringify(liveReport.pairs) !== JSON.stringify(seededReport.pairs) ||
    JSON.stringify(liveReport.controls) !== JSON.stringify(seededReport.controls) ||
    JSON.stringify(liveReport.metrics) !== JSON.stringify(seededReport.metrics)
  ) {
    throw new Error("Seeded evidence does not reproduce the live corpus, controls, and metrics.");
  }
  return { liveReport, seededReport, runs };
}

export async function verifyCommittedPhase4Evidence(
  root = process.cwd(),
): Promise<{ liveReport: EvaluationReport; seededReport: EvaluationReport; runs: EvaluationRun[] }> {
  const liveRoot = join(root, "demo", "generated-files", "evidence", "live", "evaluation");
  const [
    liveText,
    seededText,
    manifestText,
    rubricText,
    controlsText,
    baselinePrompt,
    protectedPrompt,
  ] =
    await Promise.all([
      readFile(join(liveRoot, "evaluation-report.json"), "utf8"),
      readFile(
        join(root, "demo", "generated-files", "evidence", "seeded", "evaluation-report.json"),
        "utf8",
      ),
      readFile(join(liveRoot, "manifest.json"), "utf8"),
      readFile(join(liveRoot, "rubric.json"), "utf8"),
      readFile(join(liveRoot, "controls.json"), "utf8"),
      readFile(join(root, "demo", "generated-files", "prompts", "baseline.md"), "utf8"),
      readFile(join(root, "demo", "generated-files", "prompts", "protected.md"), "utf8"),
    ]);
  assertSanitizedEvidence([liveText, seededText, manifestText, rubricText, controlsText].join("\n"));
  const manifest = evaluationManifestSchema.parse(JSON.parse(manifestText));
  await assertEvidenceManifest(manifest, (path) => readFile(join(root, path)));
  for (const entry of manifest.entries) {
    assertSanitizedEvidence((await readFile(join(root, entry.path))).toString("utf8"));
  }
  const runs = await Promise.all(
    evaluationCases.flatMap((testCase) =>
      (["baseline", "protected"] as const).map(async (condition) =>
        JSON.parse(
          await readFile(
            join(liveRoot, "cases", testCase.id, condition, "run.json"),
            "utf8",
          ),
        ),
      ),
    ),
  );
  const verified = assertPhase4EvidenceRecords({
    liveReport: JSON.parse(liveText),
    seededReport: JSON.parse(seededText),
    manifest,
    manifestText,
    rubric: JSON.parse(rubricText),
    runs,
    baselinePrompt,
    protectedPrompt,
    controls: JSON.parse(controlsText),
  });
  await assertEvaluationRepositoryIsolation();
  return verified;
}
