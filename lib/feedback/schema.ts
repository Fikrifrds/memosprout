import { z } from "zod";

export const feedbackRoleSchema = z.enum(["customer", "agent", "admin", "system"]);

export type FeedbackRole = z.infer<typeof feedbackRoleSchema>;

export const feedbackRecordSchema = z
  .object({
    feedbackId: z.string().regex(/^fb_[a-z0-9][a-z0-9_-]*$/),
    topic: z.string().min(1),
    message: z.string().min(1),
    role: feedbackRoleSchema.default("customer"),
    submittedBy: z.string().default("anonymous"),
    submittedAt: z.string().datetime({ offset: true }),
    domain: z.string().default("general"),
    status: z.enum(["pending", "acknowledged", "converted", "dismissed"]).default("pending"),
    convertedCorrectionId: z.string().nullable().default(null),
  })
  .strict();

export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

export const feedbackSummarySchema = z
  .object({
    topic: z.string(),
    count: z.number().int().positive(),
    latestMessage: z.string(),
    latestAt: z.string(),
    status: z.enum(["pending", "acknowledged", "converted", "dismissed"]),
  })
  .strict();

export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;
