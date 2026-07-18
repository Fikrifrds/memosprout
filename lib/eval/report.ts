import { createHash } from "node:crypto";

import { z } from "zod";

import { evaluationCaseSchema, evaluationConditionSchema } from "@/lib/eval/cases";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const codexEvalOutputSchema = z
  .object({
    version: z.literal("1"),
    taskId: evaluationCaseSchema.shape.id,
    requestedField: evaluationCaseSchema.shape.requestedField,
    summary: z.string().min(1),
    commandsRun: z.array(z.string().min(1)),
  })
  .strict();

export type CodexEvalOutput = z.infer<typeof codexEvalOutputSchema>;

const commandResultSchema = z
  .object({
    command: z.string().min(1),
    exitCode: z.number().int(),
    passed: z.boolean(),
  })
  .strict();

export const evaluationRunSchema = z
  .object({
    version: z.literal("1"),
    source: z.literal("live"),
    runId: z.string().regex(/^evalrun_[a-f0-9]{16}$/),
    case: evaluationCaseSchema,
    condition: evaluationConditionSchema,
    rubricSha256: sha256Schema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    codex: z
      .object({
        command: z.string().min(1),
        version: z.string().min(1),
        exitCode: z.number().int(),
        turnCompleted: z.boolean(),
        threadId: z.string().min(1).nullable(),
        finalOutput: codexEvalOutputSchema.nullable(),
        tokenUsage: z
          .object({
            inputTokens: z.number().int().nonnegative().nullable(),
            cachedInputTokens: z.number().int().nonnegative().nullable(),
            outputTokens: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      })
      .strict(),
    exposure: z
      .object({
        candidateSprout: z.boolean(),
        okfArtifact: z.boolean(),
        durableGuidance: z.boolean(),
        executableProtection: z.boolean(),
        acceptanceOracle: z.literal(false),
      })
      .strict(),
    evidence: z
      .object({
        changedPaths: z.array(z.string().min(1)).refine((paths) => new Set(paths).size === paths.length),
        repositoryMutated: z.boolean(),
        patchSha256: sha256Schema,
        schemaContainsField: z.boolean(),
        generatedClientContainsField: z.boolean(),
        oracle: z
          .object({
            passed: z.boolean(),
            reason: z.enum(["generated-client-consistent", "generated-client-diverged"]),
            expectedSha256: sha256Schema,
            actualSha256: sha256Schema,
          })
          .strict(),
        tests: commandResultSchema,
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
    const shouldSucceed =
      run.evidence.schemaContainsField &&
      run.evidence.generatedClientContainsField &&
      run.evidence.oracle.passed &&
      run.evidence.tests.passed;
    if (run.outcome.taskSuccess !== shouldSucceed) {
      context.addIssue({ code: "custom", message: "taskSuccess does not match deterministic evidence." });
    }
    if (run.outcome.firstPass !== (run.codex.turnCompleted && shouldSucceed)) {
      context.addIssue({ code: "custom", message: "firstPass does not match turn and task evidence." });
    }
    if (run.condition === "baseline") {
      if (Object.values(run.exposure).some(Boolean)) {
        context.addIssue({ code: "custom", message: "Baseline run contains protected artifact exposure." });
      }
    } else if (!run.exposure.durableGuidance || !run.exposure.executableProtection) {
      context.addIssue({ code: "custom", message: "Protected run is missing promoted protection exposure." });
    }
  });

export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

const pairedCaseSchema = z
  .object({
    caseId: evaluationCaseSchema.shape.id,
    baselineRunId: z.string().regex(/^evalrun_[a-f0-9]{16}$/),
    protectedRunId: z.string().regex(/^evalrun_[a-f0-9]{16}$/),
    baselineSuccess: z.boolean(),
    protectedSuccess: z.boolean(),
  })
  .strict();

const controlResultSchema = z
  .object({
    id: z.string().min(1),
    expected: z.literal("allow"),
    observed: z.enum(["allow", "reject"]),
    passed: z.boolean(),
  })
  .strict();

export const evaluationReportSchema = z
  .object({
    version: z.literal("1"),
    source: z.enum(["live", "seeded"]),
    reportId: z.string().regex(/^evalreport_[a-f0-9]{16}$/),
    createdAt: z.string().datetime(),
    rubricSha256: sha256Schema,
    rubricPath: z.string().min(1),
    pairs: z.array(pairedCaseSchema).length(5),
    controls: z.array(controlResultSchema).length(8),
    metrics: z
      .object({
        baselineCorrectWorkflowRate: z.number().min(0).max(1),
        protectedCorrectWorkflowRate: z.number().min(0).max(1),
        policyViolations: z
          .object({ baseline: z.number().int().nonnegative(), protected: z.number().int().nonnegative() })
          .strict(),
        improvementDelta: z.number().min(-1).max(1),
        falseBlockRate: z.number().min(0).max(1),
      })
      .strict(),
    evidenceManifestPath: z.string().min(1),
    evidenceManifestSha256: sha256Schema.nullable(),
  })
  .strict()
  .superRefine((report, context) => {
    const ids = report.pairs.map((pair) => pair.caseId);
    if (new Set(ids).size !== 5) {
      context.addIssue({ code: "custom", message: "Report contains duplicate or missing paired case IDs." });
    }
    const baselineRate = report.pairs.filter((pair) => pair.baselineSuccess).length / report.pairs.length;
    const protectedRate = report.pairs.filter((pair) => pair.protectedSuccess).length / report.pairs.length;
    const falseBlockRate = report.controls.filter((control) => !control.passed).length / report.controls.length;
    if (report.metrics.baselineCorrectWorkflowRate !== baselineRate) {
      context.addIssue({ code: "custom", message: "Baseline metric is not derived from case evidence." });
    }
    if (report.metrics.protectedCorrectWorkflowRate !== protectedRate) {
      context.addIssue({ code: "custom", message: "Protected metric is not derived from case evidence." });
    }
    if (report.metrics.improvementDelta !== protectedRate - baselineRate) {
      context.addIssue({ code: "custom", message: "Improvement delta is not derived from case evidence." });
    }
    if (report.metrics.falseBlockRate !== falseBlockRate) {
      context.addIssue({ code: "custom", message: "False-block metric is not derived from control evidence." });
    }
  });

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

export function buildEvaluationReport(options: {
  source: "live" | "seeded";
  createdAt: string;
  rubricSha256: string;
  rubricPath: string;
  runs: EvaluationRun[];
  controls: Array<{ id: string; expected: "allow"; observed: "allow" | "reject"; passed: boolean }>;
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
}): EvaluationReport {
  const baselines = new Map(
    options.runs.filter((run) => run.condition === "baseline").map((run) => [run.case.id, run]),
  );
  const protectedRuns = new Map(
    options.runs.filter((run) => run.condition === "protected").map((run) => [run.case.id, run]),
  );
  if (baselines.size !== 5 || protectedRuns.size !== 5) {
    throw new Error("Evaluation report requires exactly five baseline and five protected runs.");
  }
  const pairs = [...baselines.entries()].map(([caseId, baseline]) => {
    const protectedRun = protectedRuns.get(caseId);
    if (!protectedRun) throw new Error(`Protected evaluation evidence is missing for ${caseId}.`);
    return {
      caseId,
      baselineRunId: baseline.runId,
      protectedRunId: protectedRun.runId,
      baselineSuccess: baseline.outcome.taskSuccess,
      protectedSuccess: protectedRun.outcome.taskSuccess,
    };
  });
  const baselineCorrect = pairs.filter((pair) => pair.baselineSuccess).length;
  const protectedCorrect = pairs.filter((pair) => pair.protectedSuccess).length;
  const reportBody = {
    version: "1" as const,
    source: options.source,
    createdAt: options.createdAt,
    rubricSha256: options.rubricSha256,
    rubricPath: options.rubricPath,
    pairs,
    controls: options.controls,
    metrics: {
      baselineCorrectWorkflowRate: baselineCorrect / 5,
      protectedCorrectWorkflowRate: protectedCorrect / 5,
      policyViolations: {
        baseline: [...baselines.values()].filter((run) => run.outcome.policyViolation).length,
        protected: [...protectedRuns.values()].filter((run) => run.outcome.policyViolation).length,
      },
      improvementDelta: protectedCorrect / 5 - baselineCorrect / 5,
      falseBlockRate: options.controls.filter((control) => !control.passed).length / 8,
    },
    evidenceManifestPath: options.evidenceManifestPath,
    evidenceManifestSha256: options.evidenceManifestSha256,
  };
  const reportId = `evalreport_${createHash("sha256")
    .update(JSON.stringify(reportBody))
    .digest("hex")
    .slice(0, 16)}`;
  return evaluationReportSchema.parse({ ...reportBody, reportId });
}

export const evaluationManifestSchema = z
  .object({
    version: z.literal("1"),
    generatedAt: z.string().datetime(),
    rubricSha256: sha256Schema,
    entries: z
      .array(
        z
          .object({ path: z.string().min(1), sha256: sha256Schema })
          .strict(),
      )
      .min(1)
      .refine((entries) => new Set(entries.map((entry) => entry.path)).size === entries.length),
  })
  .strict();

export async function assertEvidenceManifest(
  manifest: z.infer<typeof evaluationManifestSchema>,
  read: (path: string) => Promise<string | Buffer>,
): Promise<void> {
  for (const entry of manifest.entries) {
    const actual = createHash("sha256").update(await read(entry.path)).digest("hex");
    if (actual !== entry.sha256) throw new Error(`Evidence hash mismatch: ${entry.path}.`);
  }
}
