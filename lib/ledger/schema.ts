import { z } from "zod";

export const outcomeRecordSchema = z
  .object({
    version: z.literal("outcome-record-v1"),
    outcomeId: z.string().regex(/^outcome_[a-f0-9]{16}$/),
    scenario: z.string().min(1),
    domain: z.string().min(1).optional(),
    taskId: z.string().min(1),
    model: z.string().min(1),
    sproutIds: z.array(z.string().regex(/^sprout_[a-f0-9]{16}$/)),
    condition: z.enum(["baseline", "protected"]),
    success: z.boolean(),
    metrics: z.record(z.string(), z.number()).optional(),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OutcomeRecord = z.infer<typeof outcomeRecordSchema>;

// Total tokens consumed from task start until the task passes its oracle, including all
// retries and corrections. Compared baseline vs protected to measure token savings.
export const TOKENS_TO_SUCCESS = "tokens_to_success";

export const domainOutcomeDefinitions = {
  coding: ["tests_passed", "regression", "review_comments", TOKENS_TO_SUCCESS],
  support: ["resolution", "escalation", "csat"],
  sales: ["reply", "conversion", "spam_complaint"],
  operations: ["completion", "override", "sla_violation"],
} as const;

export type OutcomeDomain = keyof typeof domainOutcomeDefinitions;

export function outcomeMetricsForDomain(domain: OutcomeDomain): readonly string[] {
  return domainOutcomeDefinitions[domain];
}
