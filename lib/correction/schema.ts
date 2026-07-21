import { z } from "zod";

export const correctionStatusSchema = z.enum([
  "suggested",
  "quarantined",
  "validated",
  "active",
  "deprecated",
]);

export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;

export const stalenessSchema = z.enum([
  "fresh",
  "source_changed",
  "conflict",
  "expired",
]);

export type Staleness = z.infer<typeof stalenessSchema>;

export const correctionTriggerSchema = z
  .object({
    keywords: z.array(z.string().min(1)).default([]),
    entities: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type CorrectionTrigger = z.infer<typeof correctionTriggerSchema>;

export const correctionRecordSchema = z
  .object({
    correctionId: z.string().regex(/^corr_[a-z0-9][a-z0-9_-]*$/),
    version: z.number().int().positive().default(1),
    status: correctionStatusSchema.default("suggested"),
    domain: z.string().min(1),

    trigger: correctionTriggerSchema,

    wrongPattern: z.string().min(1),
    correctAnswer: z.string().min(1),
    explanation: z.string().default(""),
    sourceRef: z.string().default(""),

    submittedBy: z.string().default("unknown"),
    submittedAt: z.string().datetime({ offset: true }),

    validatedBy: z.string().nullable().default(null),
    validatedAt: z.string().datetime({ offset: true }).nullable().default(null),

    deprecatedAt: z.string().datetime({ offset: true }).nullable().default(null),
    deprecatedReason: z.string().nullable().default(null),

    confirmCount: z.number().int().nonnegative().default(0),

    sourceHash: z.string().nullable().default(null),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
    lastValidatedAt: z.string().datetime({ offset: true }).nullable().default(null),
    staleness: stalenessSchema.default("fresh"),
  })
  .strict();

export type CorrectionRecord = z.infer<typeof correctionRecordSchema>;

export const correctionFilterSchema = z
  .object({
    status: correctionStatusSchema.optional(),
    domain: z.string().optional(),
    keyword: z.string().optional(),
  })
  .strict();

export type CorrectionFilter = z.infer<typeof correctionFilterSchema>;
