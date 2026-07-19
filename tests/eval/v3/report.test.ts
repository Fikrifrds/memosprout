import { describe, expect, it } from "vitest";

import {
  type ConvergenceCondition,
  frozenConvergenceRubricSha256,
} from "@/lib/eval/v3/cases";
import {
  assertConvergenceGate,
  buildConvergenceReport,
  ConvergenceGateError,
  convergenceReportSchema,
  convergenceRunSchema,
  type ConvergenceRun,
} from "@/lib/eval/v3/report";

let runCounter = 0;

function makeRun(options: {
  condition: ConvergenceCondition;
  trialId: string;
  success: boolean;
  policyViolation?: boolean;
  turnCompleted?: boolean;
}): ConvergenceRun {
  const policyViolation = options.policyViolation ?? false;
  const turnCompleted = options.turnCompleted ?? true;
  const taskSuccess = options.success;
  const firstPass = turnCompleted && taskSuccess && !policyViolation;
  runCounter += 1;
  const runId = `convrun_${runCounter.toString(16).padStart(16, "0")}`;
  return convergenceRunSchema.parse({
    version: "1",
    source: "live",
    runId,
    case: { id: "idempotency-implement-handler", task: "Implement the payment webhook handler." },
    trialId: options.trialId,
    condition: options.condition,
    rubricSha256: frozenConvergenceRubricSha256,
    startedAt: "2026-07-19T00:00:00.000Z",
    completedAt: "2026-07-19T00:01:00.000Z",
    durationMs: 60000,
    worker: {
      adapterId: `mock:${options.condition}`,
      model: "mock-model",
      command: "codex exec --json --sandbox workspace-write --ephemeral",
      exitCode: 0,
      turnCompleted,
      threadId: null,
      finalOutput: null,
    },
    exposure: {
      durableGuidance: options.condition === "cheap-protected",
      executableProtection: options.condition === "cheap-protected",
    },
    evidence: {
      changedPaths: ["src/webhook-handler.ts"],
      repositoryMutated: true,
      patchSha256: "a".repeat(64),
      oracle: {
        passed: taskSuccess,
        reason: taskSuccess ? "acceptance-suite-passed" : "acceptance-suite-failed",
        acceptanceExitCode: taskSuccess ? 0 : 1,
      },
      ordinaryTests: {
        command: "pnpm exec vitest run tests/handler.test.ts",
        exitCode: 0,
        passed: true,
      },
      policyViolation,
    },
    outcome: { taskSuccess, policyViolation, firstPass },
    artifacts: { trace: "worker-trace.jsonl", patch: "repository.patch" },
  });
}

function makeScenarioRuns(options: {
  trials: number;
  cheapBaselineSuccess: number;
  cheapProtectedSuccess: number;
  frontierBaselineSuccess: number;
}): ConvergenceRun[] {
  const runs: ConvergenceRun[] = [];
  const conditions: Array<[ConvergenceCondition, number]> = [
    ["cheap-baseline", options.cheapBaselineSuccess],
    ["cheap-protected", options.cheapProtectedSuccess],
    ["frontier-baseline", options.frontierBaselineSuccess],
  ];
  for (const [condition, successCount] of conditions) {
    for (let trial = 1; trial <= options.trials; trial += 1) {
      runs.push(
        makeRun({
          condition,
          trialId: `trial-${trial.toString().padStart(2, "0")}`,
          success: trial <= successCount,
        }),
      );
    }
  }
  return runs;
}

const passingControls = [
  { id: "correct-idempotent-handler", expected: "allow" as const, observed: "allow" as const, passed: true },
  { id: "correct-terminal-state-handler", expected: "allow" as const, observed: "allow" as const, passed: true },
];

function buildReport(
  runs: ConvergenceRun[],
  controls: Array<{
    id: string;
    expected: "allow";
    observed: "allow" | "reject";
    passed: boolean;
  }> = passingControls,
) {
  return buildConvergenceReport({
    source: "live",
    createdAt: "2026-07-19T00:00:00.000Z",
    rubricSha256: frozenConvergenceRubricSha256,
    rubricPath: "demo/idempotency/evaluation/rubric.json",
    runs,
    controls,
    evidenceManifestPath: "demo/idempotency/evidence/convergence/live/manifest.json",
    evidenceManifestSha256: "b".repeat(64),
  });
}

describe("convergence report", () => {
  it("derives thesis metrics from trial evidence", () => {
    const runs = makeScenarioRuns({
      trials: 2,
      cheapBaselineSuccess: 0,
      cheapProtectedSuccess: 2,
      frontierBaselineSuccess: 2,
    });
    const report = buildReport(runs);

    expect(report.metrics.cheapBaselineRate).toBe(0);
    expect(report.metrics.cheapProtectedRate).toBe(1);
    expect(report.metrics.frontierBaselineRate).toBe(1);
    expect(report.metrics.gapDelta).toBe(1);
    expect(report.metrics.sproutLift).toBe(1);
    expect(report.metrics.convergenceDelta).toBe(0);
    expect(report.metrics.falseBlockRate).toBe(0);
  });

  it("passes the convergence gate when the thesis holds", () => {
    const runs = makeScenarioRuns({
      trials: 3,
      cheapBaselineSuccess: 0,
      cheapProtectedSuccess: 3,
      frontierBaselineSuccess: 3,
    });
    const report = buildReport(runs);
    expect(() => assertConvergenceGate(report)).not.toThrow();
  });

  it("fails the gate when the sprout does not lift the cheap model", () => {
    const runs = makeScenarioRuns({
      trials: 2,
      cheapBaselineSuccess: 2,
      cheapProtectedSuccess: 2,
      frontierBaselineSuccess: 2,
    });
    const report = buildReport(runs);
    expect(report.metrics.sproutLift).toBe(0);
    expect(() => assertConvergenceGate(report)).toThrow(ConvergenceGateError);
  });

  it("fails the gate when the cheap model is not reliable even with the sprout", () => {
    const runs = makeScenarioRuns({
      trials: 2,
      cheapBaselineSuccess: 0,
      cheapProtectedSuccess: 0,
      frontierBaselineSuccess: 2,
    });
    const report = buildReport(runs);
    expect(report.metrics.cheapProtectedRate).toBe(0);
    expect(() => assertConvergenceGate(report)).toThrow(ConvergenceGateError);
  });

  it("fails the gate when a valid control is false-blocked", () => {
    const runs = makeScenarioRuns({
      trials: 2,
      cheapBaselineSuccess: 0,
      cheapProtectedSuccess: 2,
      frontierBaselineSuccess: 2,
    });
    const blockedControls = [
      passingControls[0],
      { id: "correct-terminal-state-handler", expected: "allow" as const, observed: "reject" as const, passed: false },
    ];
    const report = buildReport(runs, blockedControls);
    expect(report.metrics.falseBlockRate).toBe(0.5);
    expect(() => assertConvergenceGate(report)).toThrow(ConvergenceGateError);
  });

  it("rejects a report whose metrics are not derived from evidence", () => {
    const runs = makeScenarioRuns({
      trials: 2,
      cheapBaselineSuccess: 0,
      cheapProtectedSuccess: 2,
      frontierBaselineSuccess: 2,
    });
    const report = buildReport(runs);
    const tampered = { ...report, metrics: { ...report.metrics, gapDelta: 0 } };
    expect(() => convergenceReportSchema.parse(tampered)).toThrow();
  });
});
