import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";
import {
  evaluationCases,
  frozenEvaluationRubric,
  frozenRubricSha256,
  sha256Json,
  validControlIds,
} from "@/lib/eval/cases";

describe("frozen Phase 4 evaluation corpus", () => {
  it("contains exactly five unique requested fields and eight controls", () => {
    expect(evaluationCases).toHaveLength(5);
    expect(new Set(evaluationCases.map((testCase) => testCase.id)).size).toBe(5);
    expect(evaluationCases.map((testCase) => testCase.requestedField)).toEqual([
      "email_address",
      "display_name",
      "mobile_number",
      "account_status",
      "timezone_name",
    ]);
    expect(validControlIds).toHaveLength(8);
  });

  it("has a reproducible frozen rubric hash", () => {
    expect(frozenRubricSha256).toBe(sha256Json(frozenEvaluationRubric));
  });

  it("uses identical baseline and protected task prompts", async () => {
    const promptRoot = join(process.cwd(), "demo", "generated-files", "prompts");
    const [baseline, protectedPrompt] = await Promise.all([
      readFile(join(promptRoot, "baseline.md"), "utf8"),
      readFile(join(promptRoot, "protected.md"), "utf8"),
    ]);
    expect(baseline).toBe(protectedPrompt);
  });

  it("passes the provider-schema compatibility preflight", async () => {
    await expect(
      loadAndAssertCodexOutputSchema(
        join(process.cwd(), "demo", "generated-files", "schemas", "codex-eval-output.schema.json"),
      ),
    ).resolves.toBeUndefined();
  });
});
