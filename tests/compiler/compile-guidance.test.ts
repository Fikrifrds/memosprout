import { describe, expect, it } from "vitest";

import { compileSproutGuidance } from "@/lib/compiler/compile-guidance";
import type { CandidateSproutContent } from "@/lib/domain/schemas";

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

describe("compileSproutGuidance", () => {
  it("renders the title, trigger, numbered procedure, and prohibited actions", () => {
    const guidance = compileSproutGuidance(content);
    expect(guidance).toContain("# Payment events must be processed idempotently");
    expect(guidance).toContain("A task implements the payment webhook handler.");
    expect(guidance).toContain("1. Use the provider event id as the idempotency key.");
    expect(guidance).toContain("2. Protect terminal order states.");
    expect(guidance).toContain("- Do not process the same event id twice.");
  });

  it("includes the source sprout id when provided", () => {
    const guidance = compileSproutGuidance(content, { sproutId: "sprout_abc123" });
    expect(guidance).toContain("Source Candidate Sprout: `sprout_abc123`");
  });

  it("omits the source sprout id when not provided", () => {
    const guidance = compileSproutGuidance(content);
    expect(guidance).not.toContain("Source Candidate Sprout");
  });

  it("rejects invalid sprout content", () => {
    expect(() => compileSproutGuidance({ title: "only a title" } as never)).toThrow();
  });
});
