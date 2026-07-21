import { describe, expect, it } from "vitest";

import { matchesWrongPattern, normalizeText } from "@/lib/correction/matching";

describe("normalizeText", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeText("  Annual   Leave: 12 Days!  ")).toBe("annual leave 12 days");
  });

  it("keeps unicode letters", () => {
    expect(normalizeText("Cuti tahunan adalah 12 hari")).toBe("cuti tahunan adalah 12 hari");
  });
});

describe("matchesWrongPattern", () => {
  it("matches exact substring (legacy behavior)", () => {
    expect(matchesWrongPattern("Annual leave is 12 days.", "12 days")).toBe(true);
  });

  it("matches despite case and punctuation differences", () => {
    expect(
      matchesWrongPattern("Refund takes 3 business days, as usual.", "refund takes 3 business days"),
    ).toBe(true);
    expect(
      matchesWrongPattern("The refund... takes 3 BUSINESS days!", "Refund takes 3 business days"),
    ).toBe(true);
  });

  it("matches reordered phrasing via token overlap", () => {
    expect(
      matchesWrongPattern(
        "For business refunds, it takes 3 days to process the refund fully",
        "Refund takes 3 business days",
      ),
    ).toBe(true);
  });

  it("does not match when the pattern is absent", () => {
    expect(matchesWrongPattern("Annual leave is 15 days since 2026.", "12 days")).toBe(false);
  });

  it("skips token-overlap for short patterns to avoid false blocks", () => {
    // "12 days" has only one significant token ("days") — must not block
    // an answer that merely mentions days.
    expect(matchesWrongPattern("Delivery happens in 15 days.", "12 days")).toBe(false);
  });

  it("does not match across word boundaries", () => {
    expect(matchesWrongPattern("Delivery takes 112 days in total.", "12 days")).toBe(false);
    expect(matchesWrongPattern("Delivery takes 12 days in total.", "12 days")).toBe(true);
  });

  it("handles empty pattern safely", () => {
    expect(matchesWrongPattern("anything", "")).toBe(false);
    expect(matchesWrongPattern("anything", "!!!")).toBe(false);
  });
});
