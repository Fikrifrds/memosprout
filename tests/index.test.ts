import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";

describe("MemoSprout", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-facade-test-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("correct() captures a correction and returns it", async () => {
    const correction = await ms.correct({
      wrong: "Annual leave is 12 days",
      correct: "Annual leave is 15 days since 2026",
      keywords: ["leave", "annual"],
    });

    expect(correction.correctionId).toMatch(/^corr_/);
    expect(correction.status).toBe("active");
    expect(correction.wrongPattern).toBe("Annual leave is 12 days");
    expect(correction.correctAnswer).toBe("Annual leave is 15 days since 2026");
  });

  it("correct() increments confirmCount for duplicates", async () => {
    const input = { wrong: "wrong", correct: "right" };
    const first = await ms.correct(input);
    expect(first.confirmCount).toBe(0);

    const second = await ms.correct(input);
    expect(second.confirmCount).toBe(1);
  });

  it("context() returns relevant corrections for a query", async () => {
    await ms.correct({
      wrong: "12 days",
      correct: "15 days",
      keywords: ["leave", "annual", "policy"],
    });

    const result = await ms.context("How many annual leave days do I get?");
    expect(result.corrections).toHaveLength(1);
    expect(result.context).toContain("15 days");
    expect(result.context).toContain("Do NOT");
  });

  it("context() returns empty for unrelated queries", async () => {
    await ms.correct({
      wrong: "12 days",
      correct: "15 days",
      keywords: ["leave"],
    });

    const result = await ms.context("What is the weather today?");
    expect(result.corrections).toHaveLength(0);
    expect(result.context).toBe("");
  });

  it("check() blocks an answer matching a known-wrong pattern", async () => {
    await ms.correct({
      wrong: "12 days of annual leave",
      correct: "15 days of annual leave",
      keywords: ["leave"],
    });

    const result = await ms.check("You get 12 days of annual leave per year");
    expect(result.ok).toBe(false);
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].correct).toBe("15 days of annual leave");
  });

  it("check() ranks the strongest match first", async () => {
    await ms.correct({
      wrong: "Refunds are processed in 3 business days",
      correct: "Refunds are processed in 5 business days",
      keywords: ["refund"],
    });
    await ms.correct({
      wrong: "Refunds are processed in 3 days",
      correct: "Refunds are processed in 5 days",
      keywords: ["refund"],
    });

    // Callers act on corrections[0], so the verbatim match has to lead.
    const result = await ms.check("Refunds are processed in 3 business days.");
    expect(result.ok).toBe(false);
    expect(result.corrections[0].correct).toBe("Refunds are processed in 5 business days");
  });

  it("check() does not block a correct answer that states a second fact", async () => {
    await ms.correct({
      wrong: "New hires serve a probation period of 3 months",
      correct: "New hires serve a probation period of 6 months",
      keywords: ["probation"],
    });

    // The "3" belongs to "3 approvers", not to the probation claim.
    const result = await ms.check(
      "New vendors require 3 approvers before onboarding. " +
        "New hires serve a probation period of 6 months.",
    );
    expect(result.ok).toBe(true);
  });

  it("check() passes a correct answer", async () => {
    await ms.correct({
      wrong: "12 days of annual leave",
      correct: "15 days of annual leave",
      keywords: ["leave"],
    });

    const result = await ms.check("You get 15 days of annual leave per year");
    expect(result.ok).toBe(true);
    expect(result.corrections).toHaveLength(0);
  });

  it("list() returns all corrections", async () => {
    await ms.correct({ wrong: "w1", correct: "c1" });
    await ms.correct({ wrong: "w2", correct: "c2" });

    const all = await ms.list();
    expect(all).toHaveLength(2);
  });

  it("list() filters by domain", async () => {
    await ms.correct({ wrong: "w1", correct: "c1", domain: "coding" });
    await ms.correct({ wrong: "w2", correct: "c2", domain: "rag-chat" });

    const coding = await ms.list({ domain: "coding" });
    expect(coding).toHaveLength(1);
    expect(coding[0].domain).toBe("coding");
  });

  it("get() retrieves a correction by ID", async () => {
    const correction = await ms.correct({ wrong: "w", correct: "c" });
    const loaded = await ms.get(correction.correctionId);
    expect(loaded).toBeDefined();
    expect(loaded!.correctionId).toBe(correction.correctionId);
  });

  it("remove() deprecates a correction", async () => {
    const correction = await ms.correct({ wrong: "w", correct: "c" });
    await ms.remove(correction.correctionId);

    const loaded = await ms.get(correction.correctionId);
    expect(loaded!.status).toBe("deprecated");
  });

  it("full workflow: correct → context → check", async () => {
    await ms.correct({
      wrong: "refund takes 3 business days",
      correct: "refund takes 5 business days",
      keywords: ["refund"],
      source: "SOP v3.2",
    });

    const ctx = await ms.context("How long does a refund take?");
    expect(ctx.context).toContain("5 business days");

    const badAnswer = await ms.check("Your refund takes 3 business days");
    expect(badAnswer.ok).toBe(false);

    const goodAnswer = await ms.check("Your refund takes 5 business days");
    expect(goodAnswer.ok).toBe(true);
  });

  it("report() surfaces queries that found no correction", async () => {
    await ms.correct({
      wrong: "The annual uniform allowance is EUR 120",
      correct: "The annual uniform allowance is EUR 200",
      keywords: ["uniform allowance"],
      domain: "handbook",
    });

    await ms.context("What is the uniform allowance?", "handbook"); // hits
    await ms.context("How much for workwear?", "handbook"); // silent miss

    const report = await ms.report("handbook");
    expect(report.queriesWithoutMatch).toBe(1);
    expect(report.unmatchedQueries).toEqual(["How much for workwear?"]);
  });

  it("report() does not log a miss when the domain holds no corrections", async () => {
    // Otherwise every unrelated question in an empty domain would read as
    // a retrieval failure and the signal would be worthless.
    await ms.context("What is the weather today?", "empty-domain");

    const report = await ms.report("empty-domain");
    expect(report.queriesWithoutMatch).toBe(0);
    expect(report.unmatchedQueries).toEqual([]);
  });

  /**
   * A correction that is never approved is never served, and nothing pushes
   * that fact at anyone — so without this number, captured knowledge can be
   * dropped in silence. These pin the counting rules, since the queue is
   * store state rather than an event count.
   */
  describe("report() approval queue", () => {
    it("counts corrections waiting for a human, oldest first", async () => {
      await ms.correct({ wrong: "A1", correct: "A2", domain: "hr", role: "customer" });
      await ms.correct({ wrong: "B1", correct: "B2", domain: "hr", role: "customer" });
      // Trusted source: active immediately, so it is not waiting on anyone.
      await ms.correct({ wrong: "C1", correct: "C2", domain: "hr", role: "agent" });

      const report = await ms.report("hr");
      expect(report.pendingApprovals).toBe(2);
      expect(report.pendingApprovalIds).toHaveLength(2);
      expect(report.oldestPendingApprovalAt).toBeTruthy();
    });

    it("scopes the queue to the domain asked about", async () => {
      await ms.correct({ wrong: "A1", correct: "A2", domain: "hr", role: "customer" });
      await ms.correct({ wrong: "B1", correct: "B2", domain: "legal", role: "customer" });

      expect((await ms.report("hr")).pendingApprovals).toBe(1);
      expect((await ms.report()).pendingApprovals).toBe(2);
    });

    it("shrinks as corrections are approved", async () => {
      await ms.correct({ wrong: "A1", correct: "A2", domain: "hr", role: "customer" });
      await ms.correct({ wrong: "B1", correct: "B2", domain: "hr", role: "customer" });

      const before = await ms.report("hr");
      await ms.approve(before.pendingApprovalIds[0]!);

      expect((await ms.report("hr")).pendingApprovals).toBe(1);
    });

    it("reports an empty queue as zero, not as missing data", async () => {
      const report = await ms.report();
      expect(report.pendingApprovals).toBe(0);
      expect(report.pendingApprovalIds).toEqual([]);
      expect(report.oldestPendingApprovalAt).toBeNull();
    });
  });
});
