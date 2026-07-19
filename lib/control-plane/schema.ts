import { z } from "zod";

export const sproutStatusSchema = z.enum([
  "candidate",
  "validated",
  "released",
  "deprecated",
]);

export type SproutStatus = z.infer<typeof sproutStatusSchema>;

export const sproutReleaseSchema = z
  .object({
    sproutId: z.string().regex(/^sprout_[a-f0-9]{16}$/),
    scenario: z.string().min(1),
    status: sproutStatusSchema,
    version: z.number().int().positive(),
    canaryPercent: z.number().min(0).max(100).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type SproutRelease = z.infer<typeof sproutReleaseSchema>;

export const auditActionSchema = z.enum([
  "registered",
  "validated",
  "released",
  "rolled_back",
  "deprecated",
]);

export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntrySchema = z
  .object({
    auditId: z.string().regex(/^audit_[a-f0-9]{16}$/),
    sproutId: z.string().regex(/^sprout_[a-f0-9]{16}$/),
    action: auditActionSchema,
    actor: z.string().min(1),
    note: z.string().optional(),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AuditEntry = z.infer<typeof auditEntrySchema>;
