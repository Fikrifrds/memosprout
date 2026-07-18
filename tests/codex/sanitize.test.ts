import { describe, expect, it } from "vitest";

import {
  assertSanitizedEvidence,
  sanitizeCodexText,
} from "@/lib/codex/sanitize";

describe("Codex evidence sanitizer", () => {
  it("redacts credentials, home paths, and the temporary repository", () => {
    const sanitized = sanitizeCodexText(
      "OPENAI_API_KEY=sk-example-secret-value /Users/example/work /private/tmp/run-1",
      { temporaryRepository: "/private/tmp/run-1" },
    );

    expect(sanitized).not.toContain("sk-example-secret-value");
    expect(sanitized).not.toContain("/Users/example");
    expect(sanitized).not.toContain("/private/tmp/run-1");
    expect(sanitized).toContain("[TEMP_REPOSITORY]");
    expect(() => assertSanitizedEvidence(sanitized)).not.toThrow();
  });

  it("rejects evidence that was not sanitized", () => {
    expect(() => assertSanitizedEvidence("token sk-example-secret-value")).toThrow();
  });
});
