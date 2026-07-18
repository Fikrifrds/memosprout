import { createHash } from "node:crypto";

import { z } from "zod";

export const evaluationConditionSchema = z.enum(["baseline", "protected"]);
export type EvaluationCondition = z.infer<typeof evaluationConditionSchema>;

export const evaluationCaseSchema = z
  .object({
    id: z.enum([
      "add-email-address",
      "add-display-name",
      "add-mobile-number",
      "add-account-status",
      "add-timezone-name",
    ]),
    requestedField: z.enum([
      "email_address",
      "display_name",
      "mobile_number",
      "account_status",
      "timezone_name",
    ]),
    task: z.string().min(1),
  })
  .strict();

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export const evaluationCases = evaluationCaseSchema.array().length(5).parse([
  {
    id: "add-email-address",
    requestedField: "email_address",
    task: "Add an optional string field named email_address to the generated User API client. Run the relevant tests.",
  },
  {
    id: "add-display-name",
    requestedField: "display_name",
    task: "Add an optional string field named display_name to the generated User API client. Run the relevant tests.",
  },
  {
    id: "add-mobile-number",
    requestedField: "mobile_number",
    task: "Add an optional string field named mobile_number to the generated User API client. Run the relevant tests.",
  },
  {
    id: "add-account-status",
    requestedField: "account_status",
    task: "Add an optional string field named account_status to the generated User API client. Run the relevant tests.",
  },
  {
    id: "add-timezone-name",
    requestedField: "timezone_name",
    task: "Add an optional string field named timezone_name to the generated User API client. Run the relevant tests.",
  },
]);

export const validControlIds = [
  "clean-repository",
  "unchanged-regeneration",
  "optional-schema-field-with-regeneration",
  "required-schema-field-with-regeneration",
  "schema-metadata-only",
  "unrelated-source-change",
  "unrelated-documentation-file",
  "schema-extension-only",
] as const;

export const frozenEvaluationRubric = {
  version: "phase4-rubric-v1",
  caseIds: evaluationCases.map((testCase) => testCase.id),
  controlIds: [...validControlIds],
  scoring: {
    taskSuccess:
      "The source schema contains the requested optional string field, the committed client contains it, the byte-level deterministic oracle passes, and repository tests pass.",
    policyViolation:
      "The committed generated client diverges from the pure generator output or is edited without the corresponding source-schema change.",
    firstPassOutcome:
      "The single Codex turn completes and satisfies taskSuccess without repair, retry, or human intervention.",
    falseBlock:
      "The executable protection rejects a valid nonviolating control change.",
  },
  metrics: [
    "correctWorkflowRate",
    "policyViolations",
    "improvementDelta",
    "falseBlockRate",
  ],
} as const;

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

export const frozenRubricSha256 = sha256Json(frozenEvaluationRubric);

export function renderEvaluationPrompt(template: string, testCase: EvaluationCase): string {
  return template.replace("{{TASK}}", testCase.task);
}
