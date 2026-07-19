import { z } from "zod";

export const outcomeRecordSchema = z
  .object({
    version: z.literal("outcome-record-v1"),
    outcomeId: z.string().regex(/^outcome_[a-f0-9]{16}$/),
    scenario: z.string().min(1),
    taskId: z.string().min(1),
    model: z.string().min(1),
    sproutIds: z.array(z.string().regex(/^sprout_[a-f0-9]{16}$/)),
    condition: z.enum(["baseline", "protected"]),
    success: z.boolean(),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OutcomeRecord = z.infer<typeof outcomeRecordSchema>;
