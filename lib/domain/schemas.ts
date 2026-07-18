import { z } from "zod";

const idSchema = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-z0-9][a-z0-9_-]*$`));

const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.enum(["live", "seeded"]);

export const commandResultSchema = z
  .object({
    command: z.string().min(1),
    exitCode: z.number().int(),
    summary: z.string().min(1),
  })
  .strict();

export const agentRunSchema = z
  .object({
    id: idSchema("run"),
    source: sourceSchema,
    scenario: z.literal("generated-files"),
    condition: z.literal("baseline"),
    task: z.string().min(1),
    baseHash: sha256Schema,
    codexThreadId: z.string().min(1).nullable(),
    cliVersion: z.string().min(1).nullable(),
    changedPaths: z.array(z.string().min(1)).min(1),
    patchHash: sha256Schema,
    commandResults: z.array(commandResultSchema).min(1),
    status: z.literal("failed"),
    startedAt: timestampSchema,
    completedAt: timestampSchema,
  })
  .strict();

export const humanCorrectionSchema = z
  .object({
    id: idSchema("correction"),
    source: sourceSchema,
    agentRunId: idSchema("run"),
    text: z.string().min(1),
    capturedAt: timestampSchema,
  })
  .strict();

export const correctedOutcomeSchema = z
  .object({
    id: idSchema("outcome"),
    source: sourceSchema,
    agentRunId: idSchema("run"),
    changedPaths: z.array(z.string().min(1)).min(2),
    commandResults: z.array(commandResultSchema).min(2),
    status: z.literal("passed"),
    completedAt: timestampSchema,
  })
  .strict();

export const evidenceCheckSchema = z
  .object({
    id: z.enum([
      "direct-generated-file-edit",
      "schema-edit-without-regeneration",
      "schema-edit-with-regeneration",
    ]),
    expected: z.enum(["pass", "fail"]),
    observed: z.enum(["pass", "fail"]),
    oracleReason: z.enum([
      "generated-client-consistent",
      "generated-client-diverged",
    ]),
  })
  .strict();

export const deterministicEvidenceSchema = z
  .object({
    id: idSchema("evidence"),
    source: sourceSchema,
    oracleId: z.literal("generated-files-evidence-oracle"),
    oracleVersion: z.literal("1"),
    checks: z.array(evidenceCheckSchema).length(3),
    recordedAt: timestampSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    const checkIds = new Set(evidence.checks.map((check) => check.id));
    if (checkIds.size !== evidence.checks.length) {
      context.addIssue({
        code: "custom",
        message: "Deterministic evidence checks must have unique IDs.",
        path: ["checks"],
      });
    }

    for (const [index, check] of evidence.checks.entries()) {
      if (check.expected !== check.observed) {
        context.addIssue({
          code: "custom",
          message: "Observed oracle results must match their expected result.",
          path: ["checks", index, "observed"],
        });
      }
    }
  });

export const candidateEvidenceBundleSchema = z
  .object({
    failedAgentRun: agentRunSchema,
    humanCorrection: humanCorrectionSchema,
    correctedOutcome: correctedOutcomeSchema,
    deterministicEvidence: deterministicEvidenceSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    const sourceRunId = bundle.failedAgentRun.id;
    if (bundle.humanCorrection.agentRunId !== sourceRunId) {
      context.addIssue({
        code: "custom",
        message: "Human Correction must reference the failed Agent Run.",
        path: ["humanCorrection", "agentRunId"],
      });
    }
    if (bundle.correctedOutcome.agentRunId !== sourceRunId) {
      context.addIssue({
        code: "custom",
        message: "Corrected outcome must reference the failed Agent Run.",
        path: ["correctedOutcome", "agentRunId"],
      });
    }
    const sources = [
      bundle.failedAgentRun.source,
      bundle.humanCorrection.source,
      bundle.correctedOutcome.source,
      bundle.deterministicEvidence.source,
    ];
    if (new Set(sources).size !== 1) {
      context.addIssue({
        code: "custom",
        message: "All evidence in a bundle must have the same source mode.",
        path: [],
      });
    }
  });

export const candidateSproutContentSchema = z
  .object({
    title: z.string().min(1),
    type: z.literal("Agent Experience"),
    trigger: z.string().min(1),
    procedure: z.array(z.string().min(1)).min(2),
    prohibitedActions: z.array(z.string().min(1)).min(1),
    scope: z
      .object({
        paths: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    uncertainties: z.array(z.string().min(1)),
    recommendedArtifact: z.enum(["ci_and_hook", "ci_check", "pre_tool_hook"]),
  })
  .strict();

export const candidateSproutSchema = candidateSproutContentSchema
  .extend({
    id: idSchema("sprout"),
    status: z.literal("candidate"),
    evidence: z
      .object({
        failedAgentRunId: idSchema("run"),
        humanCorrectionId: idSchema("correction"),
        correctedOutcomeId: idSchema("outcome"),
        deterministicEvidenceId: idSchema("evidence"),
      })
      .strict(),
    provenance: z
      .object({
        source: sourceSchema,
        promptVersion: z.literal("candidate-sprout-v1"),
        modelRequested: z.literal("gpt-5.6-sol"),
        modelReturned: z.string().min(1).nullable(),
        responseId: z.string().min(1).nullable(),
        generatedAt: timestampSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((candidate, context) => {
    const hasLiveProvenance =
      candidate.provenance.modelReturned !== null &&
      candidate.provenance.responseId !== null;

    if (candidate.provenance.source === "live" && !hasLiveProvenance) {
      context.addIssue({
        code: "custom",
        message: "Live Candidates require returned model and response IDs.",
        path: ["provenance"],
      });
    }
    if (candidate.provenance.source === "seeded" && hasLiveProvenance) {
      context.addIssue({
        code: "custom",
        message: "Seeded Candidates must not claim live response provenance.",
        path: ["provenance"],
      });
    }
  });

export type AgentRun = z.infer<typeof agentRunSchema>;
export type HumanCorrection = z.infer<typeof humanCorrectionSchema>;
export type CorrectedOutcome = z.infer<typeof correctedOutcomeSchema>;
export type DeterministicEvidence = z.infer<typeof deterministicEvidenceSchema>;
export type CandidateEvidenceBundle = z.infer<typeof candidateEvidenceBundleSchema>;
export type CandidateSproutContent = z.infer<typeof candidateSproutContentSchema>;
export type CandidateSprout = z.infer<typeof candidateSproutSchema>;
