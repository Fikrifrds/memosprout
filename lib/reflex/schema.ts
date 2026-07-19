import { z } from "zod";

export const reflexActionSchema = z.enum(["block", "warn"]);

export type ReflexAction = z.infer<typeof reflexActionSchema>;

export const reflexRuleSchema = z
  .object({
    ruleId: z.string().regex(/^reflex_[a-f0-9]{16}$/),
    sproutId: z.string().regex(/^sprout_[a-f0-9]{16}$/),
    scenario: z.string().min(1),
    description: z.string().min(1),
    protectedPaths: z.array(z.string().min(1)).min(1),
    action: reflexActionSchema,
  })
  .strict();

export type ReflexRule = z.infer<typeof reflexRuleSchema>;

export const fileEditTools = [
  "edit_file",
  "write_file",
  "create_file",
  "apply_patch",
  "str_replace_editor",
] as const;

export const toolCallSchema = z
  .object({
    tool: z.string().min(1),
    targetPath: z.string().optional(),
  })
  .strict();

export type ToolCall = z.infer<typeof toolCallSchema>;

export const reflexDecisionSchema = z
  .object({
    allowed: z.boolean(),
    action: z.enum(["allow", "block", "warn"]),
    matchedRuleId: z.string().nullable(),
    reason: z.string().min(1),
  })
  .strict();

export type ReflexDecision = z.infer<typeof reflexDecisionSchema>;
