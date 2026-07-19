import { createHash } from "node:crypto";

import { z } from "zod";

import {
  convergenceCaseSchema,
  convergenceConditionSchema,
  frozenConvergenceRubric,
  type ConvergenceCondition,
} from "@/lib/eval/v3/cases";
import { convergenceWorkerOutputSchema } from "@/lib/eval/v3/worker";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const runIdSchema = z.string().regex(/^convrun_[a-f0-9]{16}$/);
const trialIdSchema = z.string().regex(/^trial-\d{2}$/);

export const convergenceRunSchema = z
  .object({
    version: z.literal("1"),
    source: z.literal("live"),
    runId: runIdSchema,
    case: convergenceCaseSchema,
    trialId: trialIdSchema,
    condition: convergenceConditionSchema,
    rubricSha256: sha256Schema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    worker: z
      .object({
        adapterId: z.string().min(1),
        model: z.string().min(1),
        command: z.string().min(1),
        exitCode: z.number().int(),
        turnCompleted: z.boolean(),
        threadId: z.string().min(1).nullable(),
        finalOutput: convergenceWorkerOutputSchema.nullable(),
      })
      .strict(),
    exposure: z
      .object({
        durableGuidance: z.boolean(),
        executableProtection: z.boolean(),
      })
      .strict(),
    evidence: z
      .object({
        changedPaths: z
          .array(z.string().min(1))
          .refine((paths) => new Set(paths).size === paths.length),
        repositoryMutated: z.boolean(),
        patchSha256: sha256Schema,
        oracle: z
          .object({
            passed: z.boolean(),
            reason: z.enum(["acceptance-suite-passed", "acceptance-suite-failed"]),
            acceptanceExitCode: z.number().int(),
          })
          .strict(),
        ordinaryTests: z
          .object({
            command: z.string().min(1),
            exitCode: z.number().int(),
            passed: z.boolean(),
          })
          .strict(),
        policyViolation: z.boolean(),
      })
      .strict(),
    outcome: z
      .object({
        taskSuccess: z.boolean(),
        policyViolation: z.boolean(),
        firstPass: z.boolean(),
      })
      .strict(),
    artifacts: z
      .object({
        trace: z.string().min(1),
        patch: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((run, context) => {
    const shouldSucceed = run.evidence.oracle.passed && run.evidence.ordinaryTests.passed;
    if (run.outcome.taskSuccess !== shouldSucceed) {
      context.addIssue({
        code: "custom",
        message: "taskSuccess does not match deterministic evidence.",
      });
    }
    if (run.outcome.policyViolation !== run.evidence.policyViolation) {
      context.addIssue({
        code: "custom",
        message: "policyViolation is inconsistent with evidence.",
      });
    }
    if (
      run.outcome.firstPass !==
      (run.worker.turnCompleted && shouldSucceed && !run.evidence.policyViolation)
    ) {
      context.addIssue({
        code: "custom",
        message: "firstPass does not match turn, task, and policy evidence.",
      });
    }
    const shouldExpose = run.condition === "cheap-protected";
    if (
      run.exposure.durableGuidance !== shouldExpose ||
      run.exposure.executableProtection !== shouldExpose
    ) {
      context.addIssue({
        code: "custom",
        message: "Exposure does not match the run condition.",
      });
    }
  });

export type ConvergenceRun = z.infer<typeof convergenceRunSchema>;

const convergenceTrialSchema = z
  .object({
    caseId: convergenceCaseSchema.shape.id,
    trialId: trialIdSchema,
    condition: convergenceConditionSchema,
    runId: runIdSchema,
    success: z.boolean(),
  })
  .strict();

export const convergenceControlResultSchema = z
  .object({
    id: z.string().min(1),
    expected: z.literal("allow"),
    observed: z.enum(["allow", "reject"]),
    passed: z.boolean(),
  })
  .strict();

export const convergenceControlsSchema = z.array(convergenceControlResultSchema).min(1);

export function computeConditionRate(
  trials: Array<{ condition: ConvergenceCondition; success: boolean }>,
  condition: ConvergenceCondition,
): number {
  const conditionTrials = trials.filter((trial) => trial.condition === condition);
  if (conditionTrials.length === 0) return 0;
  return conditionTrials.filter((trial) => trial.success).length / conditionTrials.length;
}

export const convergenceReportSchema = z
  .object({
    version: z.literal("1"),
    source: z.enum(["live", "seeded"]),
    reportId: z.string().regex(/^convreport_[a-f0-9]{16}$/),
    createdAt: z.string().datetime(),
    rubricSha256: sha256Schema,
    rubricPath: z.string().min(1),
    trials: z.array(convergenceTrialSchema).min(3),
    controls: convergenceControlsSchema,
    metrics: z
      .object({
        cheapBaselineRate: z.number().min(0).max(1),
        cheapProtectedRate: z.number().min(0).max(1),
        frontierBaselineRate: z.number().min(0).max(1),
        gapDelta: z.number().min(-1).max(1),
        sproutLift: z.number().min(-1).max(1),
        convergenceDelta: z.number().min(-1).max(1),
        policyViolations: z
          .object({
            cheapBaseline: z.number().int().nonnegative(),
            cheapProtected: z.number().int().nonnegative(),
            frontierBaseline: z.number().int().nonnegative(),
          })
          .strict(),
        falseBlockRate: z.number().min(0).max(1),
      })
      .strict(),
    evidenceManifestPath: z.string().min(1),
    evidenceManifestSha256: sha256Schema.nullable(),
  })
  .strict()
  .superRefine((report, context) => {
    const counts = (["cheap-baseline", "cheap-protected", "frontier-baseline"] as const).map(
      (condition) => report.trials.filter((trial) => trial.condition === condition).length,
    );
    if (new Set(counts).size !== 1 || counts[0] === 0) {
      context.addIssue({
        code: "custom",
        message: "Report conditions must have equal, non-zero trial counts.",
      });
    }
    const cheapBaselineRate = computeConditionRate(report.trials, "cheap-baseline");
    const cheapProtectedRate = computeConditionRate(report.trials, "cheap-protected");
    const frontierBaselineRate = computeConditionRate(report.trials, "frontier-baseline");
    const checks: Array<[number, number, string]> = [
      [report.metrics.cheapBaselineRate, cheapBaselineRate, "cheapBaselineRate"],
      [report.metrics.cheapProtectedRate, cheapProtectedRate, "cheapProtectedRate"],
      [report.metrics.frontierBaselineRate, frontierBaselineRate, "frontierBaselineRate"],
      [
        report.metrics.gapDelta,
        frontierBaselineRate - cheapBaselineRate,
        "gapDelta",
      ],
      [
        report.metrics.sproutLift,
        cheapProtectedRate - cheapBaselineRate,
        "sproutLift",
      ],
      [
        report.metrics.convergenceDelta,
        frontierBaselineRate - cheapProtectedRate,
        "convergenceDelta",
      ],
    ];
    for (const [actual, expected, name] of checks) {
      if (actual !== expected) {
        context.addIssue({
          code: "custom",
          message: `Metric ${name} is not derived from trial evidence.`,
        });
      }
    }
    const falseBlockRate =
      report.controls.filter((control) => !control.passed).length / report.controls.length;
    if (report.metrics.falseBlockRate !== falseBlockRate) {
      context.addIssue({
        code: "custom",
        message: "falseBlockRate is not derived from control evidence.",
      });
    }
    for (const control of report.controls) {
      if (control.passed !== (control.observed === control.expected)) {
        context.addIssue({
          code: "custom",
          message: `Control result is internally inconsistent: ${control.id}.`,
        });
      }
    }
  });

export type ConvergenceReport = z.infer<typeof convergenceReportSchema>;

export function buildConvergenceReport(options: {
  source: "live" | "seeded";
  createdAt: string;
  rubricSha256: string;
  rubricPath: string;
  runs: ConvergenceRun[];
  controls: Array<{ id: string; expected: "allow"; observed: "allow" | "reject"; passed: boolean }>;
  evidenceManifestPath: string;
  evidenceManifestSha256: string | null;
}): ConvergenceReport {
  const trials = options.runs.map((run) => ({
    caseId: run.case.id,
    trialId: run.trialId,
    condition: run.condition,
    runId: run.runId,
    success: run.outcome.taskSuccess,
  }));
  const counts = (["cheap-baseline", "cheap-protected", "frontier-baseline"] as const).map(
    (condition) => trials.filter((trial) => trial.condition === condition).length,
  );
  if (new Set(counts).size !== 1 || counts[0] === 0) {
    throw new Error("Convergence report requires equal, non-zero trial counts per condition.");
  }
  const cheapBaselineRate = computeConditionRate(trials, "cheap-baseline");
  const cheapProtectedRate = computeConditionRate(trials, "cheap-protected");
  const frontierBaselineRate = computeConditionRate(trials, "frontier-baseline");
  const policyViolationCount = (condition: ConvergenceCondition) =>
    options.runs.filter((run) => run.condition === condition && run.outcome.policyViolation).length;
  const reportBody = {
    version: "1" as const,
    source: options.source,
    createdAt: options.createdAt,
    rubricSha256: options.rubricSha256,
    rubricPath: options.rubricPath,
    trials,
    controls: options.controls,
    metrics: {
      cheapBaselineRate,
      cheapProtectedRate,
      frontierBaselineRate,
      gapDelta: frontierBaselineRate - cheapBaselineRate,
      sproutLift: cheapProtectedRate - cheapBaselineRate,
      convergenceDelta: frontierBaselineRate - cheapProtectedRate,
      policyViolations: {
        cheapBaseline: policyViolationCount("cheap-baseline"),
        cheapProtected: policyViolationCount("cheap-protected"),
        frontierBaseline: policyViolationCount("frontier-baseline"),
      },
      falseBlockRate:
        options.controls.filter((control) => !control.passed).length / options.controls.length,
    },
    evidenceManifestPath: options.evidenceManifestPath,
    evidenceManifestSha256: options.evidenceManifestSha256,
  };
  const reportId = `convreport_${createHash("sha256")
    .update(JSON.stringify(reportBody))
    .digest("hex")
    .slice(0, 16)}`;
  return convergenceReportSchema.parse({ ...reportBody, reportId });
}

export class ConvergenceGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvergenceGateError";
  }
}

export function assertConvergenceGate(
  report: ConvergenceReport,
  thresholds: {
    minimumSproutLift: number;
    minimumCheapProtectedRate: number;
    maximumFalseBlockRate: number;
  } = frozenConvergenceRubric.gate,
): void {
  if (report.metrics.sproutLift < thresholds.minimumSproutLift) {
    throw new ConvergenceGateError(
      `Sprout lift ${report.metrics.sproutLift} is below the minimum ${thresholds.minimumSproutLift}; the sprout does not meaningfully improve the cheap model.`,
    );
  }
  if (report.metrics.cheapProtectedRate < thresholds.minimumCheapProtectedRate) {
    throw new ConvergenceGateError(
      `Cheap protected rate ${report.metrics.cheapProtectedRate} is below the minimum ${thresholds.minimumCheapProtectedRate}; the cheap model is not reliable even with the sprout.`,
    );
  }
  if (report.metrics.falseBlockRate > thresholds.maximumFalseBlockRate) {
    throw new ConvergenceGateError(
      `False-block rate ${report.metrics.falseBlockRate} exceeds the maximum ${thresholds.maximumFalseBlockRate}.`,
    );
  }
}
