import { describe, expect, it } from "vitest";

import type { CandidateSproutContent } from "@/lib/domain/schemas";
import { experienceOkfFilename, renderExperienceOkf } from "@/lib/okf/render";
import { parseAndValidateOkf } from "@/lib/okf/validate";

const content: CandidateSproutContent = {
  title: "Payment events must be processed idempotently",
  type: "Agent Experience",
  trigger: "A task implements the payment webhook handler.",
  procedure: [
    "Use the provider event id as the idempotency key.",
    "Protect terminal order states.",
  ],
  prohibitedActions: ["Do not process the same event id twice."],
  scope: { paths: ["src/webhook-handler.ts"] },
  uncertainties: [],
  recommendedArtifact: "ci_and_hook",
};

const baseOptions = {
  scenario: "idempotency",
  sproutId: "sprout_abc123",
  source: "seeded" as const,
  promptVersion: "experience-compiler-v1",
  modelRequested: "gpt-5.6-sol",
  modelReturned: null,
  responseId: null,
  generatedAt: "2026-07-20T00:00:00.000Z",
  evidenceIds: { humanCorrection: "correction_x1" },
};

describe("renderExperienceOkf", () => {
  it("renders scenario-aware OKF Markdown that validates", () => {
    const markdown = renderExperienceOkf(content, baseOptions);
    const validated = parseAndValidateOkf(markdown);
    expect(validated.frontmatter.type).toBe("Agent Experience");
    expect(validated.frontmatter.memosprout.sprout_id).toBe("sprout_abc123");
    expect(validated.frontmatter.memosprout.scenario).toBe("idempotency");
    expect(markdown).toContain("idempotency evidence and Human Correction");
    expect(markdown).toContain("## Validated Procedure");
  });

  it("renders for the soft-delete scenario", () => {
    const markdown = renderExperienceOkf(
      { ...content, scope: { paths: ["src/user-service.ts"] } },
      { ...baseOptions, scenario: "soft-delete" },
    );
    const validated = parseAndValidateOkf(markdown);
    expect(validated.frontmatter.memosprout.scenario).toBe("soft-delete");
    expect(markdown).toContain("soft-delete evidence and Human Correction");
  });

  it("produces a scenario-specific download filename", () => {
    expect(experienceOkfFilename("idempotency")).toBe("idempotency-agent-experience.md");
    expect(experienceOkfFilename("soft-delete")).toBe("soft-delete-agent-experience.md");
  });
});
