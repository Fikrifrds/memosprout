import { describe, expect, it } from "vitest";

import {
  correctionFilename,
  parseCorrectionMarkdown,
  renderCorrectionMarkdown,
} from "@/lib/correction/render";
import type { CorrectionRecord } from "@/lib/correction/schema";

const sampleCorrection: CorrectionRecord = {
  correctionId: "corr_roundtrip1",
  version: 2,
  status: "validated",
  domain: "coding",
  trigger: { keywords: ["generated", "schema"], entities: ["generated-files"] },
  wrongPattern: "Edit the generated API client directly",
  correctAnswer: "Modify the OpenAPI schema and regenerate",
  explanation: "The generated client is overwritten on each build.",
  sourceRef: "AGENTS.md, section Generated Files",
  submittedBy: "reviewer-1",
  submittedAt: "2026-07-21T10:00:00.000Z",
  validatedBy: "oracle",
  validatedAt: "2026-07-21T11:00:00.000Z",
  deprecatedAt: null,
  deprecatedReason: null,
  confirmCount: 3,
  sourceHash: null,
  expiresAt: null,
  lastValidatedAt: null,
  staleness: "fresh" as const,
};

describe("Correction Markdown render and parse", () => {
  it("roundtrips a correction through Markdown", () => {
    const markdown = renderCorrectionMarkdown(sampleCorrection);
    const parsed = parseCorrectionMarkdown(markdown);

    expect(parsed.correctionId).toBe(sampleCorrection.correctionId);
    expect(parsed.version).toBe(sampleCorrection.version);
    expect(parsed.status).toBe(sampleCorrection.status);
    expect(parsed.domain).toBe(sampleCorrection.domain);
    expect(parsed.trigger.keywords).toEqual(sampleCorrection.trigger.keywords);
    expect(parsed.trigger.entities).toEqual(sampleCorrection.trigger.entities);
    expect(parsed.wrongPattern).toBe(sampleCorrection.wrongPattern);
    expect(parsed.correctAnswer).toBe(sampleCorrection.correctAnswer);
    expect(parsed.explanation).toBe(sampleCorrection.explanation);
    expect(parsed.sourceRef).toBe(sampleCorrection.sourceRef);
    expect(parsed.submittedBy).toBe(sampleCorrection.submittedBy);
    expect(parsed.submittedAt).toBe(sampleCorrection.submittedAt);
    expect(parsed.validatedBy).toBe(sampleCorrection.validatedBy);
    expect(parsed.validatedAt).toBe(sampleCorrection.validatedAt);
    expect(parsed.confirmCount).toBe(sampleCorrection.confirmCount);
  });

  it("produces valid Markdown with frontmatter", () => {
    const markdown = renderCorrectionMarkdown(sampleCorrection);
    expect(markdown).toMatch(/^---\n/);
    expect(markdown).toContain("correction_id: corr_roundtrip1");
    expect(markdown).toContain("status: validated");
    expect(markdown).toContain("## Wrong pattern");
    expect(markdown).toContain("## Correct answer");
    expect(markdown).toContain("## Explanation");
    expect(markdown).toContain("## Source");
  });

  it("throws on Markdown without frontmatter", () => {
    expect(() => parseCorrectionMarkdown("# No frontmatter")).toThrow(
      "Correction Markdown must start with YAML frontmatter.",
    );
  });

  it("generates the correct filename", () => {
    expect(correctionFilename("corr_abc123")).toBe("corr_abc123.md");
  });
});
