import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluationCases } from "@/lib/eval/cases";
import {
  assertPhase4EvidenceRecords,
  assertPhase4OutcomeGate,
  assertPhase4ReportIntegrity,
  Phase4OutcomeGateError,
  verifyCommittedPhase4Evidence,
} from "@/lib/eval/verification";

async function loadCeilingBundle() {
  const root = process.cwd();
  const liveRoot = join(root, "demo", "generated-files", "evidence", "live", "evaluation");
  const [liveText, seededText, manifestText, rubricText, controlsText, baselinePrompt, protectedPrompt] =
    await Promise.all([
      readFile(join(liveRoot, "evaluation-report.json"), "utf8"),
      readFile(join(root, "demo", "generated-files", "evidence", "seeded", "evaluation-report.json"), "utf8"),
      readFile(join(liveRoot, "manifest.json"), "utf8"),
      readFile(join(liveRoot, "rubric.json"), "utf8"),
      readFile(join(liveRoot, "controls.json"), "utf8"),
      readFile(join(root, "demo", "generated-files", "prompts", "baseline.md"), "utf8"),
      readFile(join(root, "demo", "generated-files", "prompts", "protected.md"), "utf8"),
    ]);
  const runs = await Promise.all(
    evaluationCases.flatMap((testCase) =>
      (["baseline", "protected"] as const).map(async (condition) =>
        JSON.parse(
          await readFile(join(liveRoot, "cases", testCase.id, condition, "run.json"), "utf8"),
        ),
      ),
    ),
  );
  return {
    liveReport: JSON.parse(liveText),
    seededReport: JSON.parse(seededText),
    manifest: JSON.parse(manifestText),
    manifestText,
    rubric: JSON.parse(rubricText),
    controls: JSON.parse(controlsText),
    runs,
    baselinePrompt,
    protectedPrompt,
  };
}

function makePositiveBundle(ceiling: Awaited<ReturnType<typeof loadCeilingBundle>>) {
  const bundle = structuredClone(ceiling);
  const reports = [bundle.liveReport, bundle.seededReport] as Array<{
    pairs: Array<{ baselineSuccess: boolean }>;
    metrics: {
      baselineCorrectWorkflowRate: number;
      protectedCorrectWorkflowRate: number;
      improvementDelta: number;
      policyViolations: { baseline: number };
    };
  }>;
  for (const report of reports) {
    report.pairs[0]!.baselineSuccess = false;
    report.metrics.baselineCorrectWorkflowRate = 0.8;
    report.metrics.protectedCorrectWorkflowRate = 1;
    report.metrics.improvementDelta = 1 - 0.8;
    report.metrics.policyViolations.baseline = 1;
  }
  const baselineRun = bundle.runs.find(
    (run) => run.condition === "baseline" && run.case.id === evaluationCases[0]!.id,
  ) as {
    evidence: { schemaContainsField: boolean };
    outcome: { taskSuccess: boolean; policyViolation: boolean; firstPass: boolean };
  };
  baselineRun.evidence.schemaContainsField = false;
  baselineRun.outcome = { taskSuccess: false, policyViolation: true, firstPass: false };
  return bundle;
}

describe("Phase 4 evidence integrity and outcome gate semantics", () => {
  it("accepts valid positive evidence in both verification and the gate", async () => {
    const positive = makePositiveBundle(await loadCeilingBundle());
    const verified = assertPhase4EvidenceRecords(positive);
    expect(verified.liveReport.metrics.improvementDelta).toBeCloseTo(0.2);
    expect(assertPhase4OutcomeGate(verified.liveReport).metrics.improvementDelta).toBeCloseTo(0.2);
  });

  it("accepts valid zero-delta evidence in verification but rejects it at the gate", async () => {
    const ceiling = assertPhase4EvidenceRecords(await loadCeilingBundle()).liveReport;
    expect(ceiling.metrics.improvementDelta).toBe(0);
    expect(() => assertPhase4OutcomeGate(ceiling)).toThrow(Phase4OutcomeGateError);
    expect(() => assertPhase4OutcomeGate(ceiling)).toThrow(
      "evidence is valid, but the positive-improvement gate failed",
    );
  });

  it("rejects corrupted evidence during integrity verification", async () => {
    const corrupted = await loadCeilingBundle();
    corrupted.liveReport.metrics.improvementDelta = 0.5;
    expect(() => assertPhase4EvidenceRecords(corrupted)).toThrow(
      "Improvement delta is not derived from case evidence",
    );
  });

  it("distinguishes a valid gate miss from an evidence-integrity failure", async () => {
    const ceiling = (await loadCeilingBundle()).liveReport;
    expect(() => assertPhase4ReportIntegrity(ceiling)).not.toThrow();
    try {
      assertPhase4OutcomeGate(ceiling);
      throw new Error("Expected the ceiling result to miss the outcome gate.");
    } catch (error) {
      expect(error).toBeInstanceOf(Phase4OutcomeGateError);
      expect(error).not.toBeInstanceOf(SyntaxError);
    }
  });

  it("verifies the complete committed v1 evidence bundle as a valid ceiling result", async () => {
    const verified = await verifyCommittedPhase4Evidence();
    expect(verified.runs).toHaveLength(10);
    expect(verified.liveReport.metrics.improvementDelta).toBe(0);
  });
});
