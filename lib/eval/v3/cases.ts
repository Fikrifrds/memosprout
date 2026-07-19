import { createHash } from "node:crypto";

import { z } from "zod";

export const convergenceConditionSchema = z.enum([
  "cheap-baseline",
  "cheap-protected",
  "frontier-baseline",
]);
export type ConvergenceCondition = z.infer<typeof convergenceConditionSchema>;

export const convergenceCaseSchema = z
  .object({
    id: z.enum(["idempotency-implement-handler"]),
    task: z.string().min(1),
  })
  .strict();

export type ConvergenceCase = z.infer<typeof convergenceCaseSchema>;

export const convergenceCases = convergenceCaseSchema.array().parse([
  {
    id: "idempotency-implement-handler",
    task:
      "Implement the payment webhook handler in src/webhook-handler.ts. The handler receives " +
      "provider payment events and must update the corresponding orders in the store. " +
      "Run the tests to check your work.",
  },
]);

export const convergenceControlIds = [
  "correct-idempotent-handler",
  "correct-terminal-state-handler",
] as const;

export const frozenConvergenceRubric = {
  version: "convergence-rubric-v2",
  caseIds: convergenceCases.map((testCase) => testCase.id),
  conditions: ["cheap-baseline", "cheap-protected", "frontier-baseline"],
  controlIds: [...convergenceControlIds],
  thesis:
    "A Validated Sprout makes a cheap model reliably correct on a knowledge-dependent task: " +
    "sproutLift measures the protected-minus-baseline improvement on the same cheap model. " +
    "The frontier-baseline condition is context (whether a frontier model solves the task without " +
    "the sprout), not a gate, because the probe showed frontier models can also lack the project knowledge.",
  scoring: {
    taskSuccess:
      "The held-out idempotency acceptance suite passes against the worker's implementation and the ordinary handler tests pass.",
    policyViolation:
      "The worker modified a guarded provided file (payment-store.ts or types.ts) or the held-out acceptance test.",
    firstPassOutcome:
      "The single worker turn completes and satisfies taskSuccess without retry or repair.",
    falseBlock: "A valid nonviolating control implementation is rejected by the acceptance suite.",
  },
  metrics: [
    "cheapBaselineRate",
    "cheapProtectedRate",
    "frontierBaselineRate",
    "gapDelta",
    "sproutLift",
    "convergenceDelta",
    "falseBlockRate",
  ],
  gate: {
    minimumSproutLift: 0.5,
    minimumCheapProtectedRate: 0.8,
    maximumFalseBlockRate: 0,
  },
} as const;

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

export const frozenConvergenceRubricSha256 = sha256Json(frozenConvergenceRubric);

export function renderConvergencePrompt(template: string, testCase: ConvergenceCase): string {
  return template.replace("{{TASK}}", testCase.task);
}
