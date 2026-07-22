import { describe, expect, it } from "vitest";

import {
  matchesWrongPattern,
  normalizeText,
  wrongPatternMatchScore,
} from "@/lib/correction/matching";

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

describe("matchesWrongPattern across sentences", () => {
  const pattern = "New hires serve a probation period of 3 months";

  it("does not borrow a number from a different fact in the answer", () => {
    // The "3" belongs to "3 approvers". Both statements are correct, so
    // blocking here would replace a right answer with a wrong one.
    expect(
      matchesWrongPattern(
        "New vendors require 3 approvers before onboarding. " +
          "New hires serve a probation period of 6 months.",
        pattern,
      ),
    ).toBe(false);
  });

  it("still matches when one sentence does assert the wrong fact", () => {
    expect(
      matchesWrongPattern(
        "New vendors require 3 approvers before onboarding. " +
          "A probation period of 3 months applies to new hires.",
        pattern,
      ),
    ).toBe(true);
  });

  it("does not block a wrong fact mentioned only to reject it", () => {
    expect(
      matchesWrongPattern(
        "Payouts are sent daily, not weekly, and the minimum is EUR 50.",
        "Payouts are sent weekly",
      ),
    ).toBe(false);
    expect(
      matchesWrongPattern(
        "It is not correct that payouts are sent weekly.",
        "Payouts are sent weekly",
      ),
    ).toBe(false);
  });

  it("still blocks the wrong fact when the negation applies to the correction", () => {
    expect(
      matchesWrongPattern(
        "Payouts are sent weekly, not daily.",
        "Payouts are sent weekly",
      ),
    ).toBe(true);
    expect(
      matchesWrongPattern(
        "Not only are payouts sent weekly, they are also delayed on holidays.",
        "Payouts are sent weekly",
      ),
    ).toBe(true);
  });

  it("keeps decimals intact when splitting sentences", () => {
    expect(
      matchesWrongPattern(
        "Private car use is reimbursed at EUR 0.58 per kilometre.",
        "Private car use is reimbursed at EUR 0.58 per kilometre",
      ),
    ).toBe(true);
  });
});

describe("wrongPatternMatchScore", () => {
  const pattern = "Full-time employees accrue 12 days of annual leave";

  it("scores a verbatim hit above a partial one", () => {
    const verbatim = wrongPatternMatchScore(
      "Full-time employees accrue 12 days of annual leave.",
      pattern,
    );
    // Same claim, one token short of the pattern — a weaker match, and so
    // ranked below a correction the answer states outright.
    const partial = wrongPatternMatchScore(
      "Full-time staff accrue 12 days of annual leave.",
      pattern,
    );
    expect(verbatim).toBe(1);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(verbatim);
  });

  it("scores zero when the pattern is absent", () => {
    expect(wrongPatternMatchScore("Full-time employees accrue 18 days.", pattern)).toBe(0);
  });
});
