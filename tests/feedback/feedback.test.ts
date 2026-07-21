import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";

describe("Feedback system", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-feedback-test-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("captures customer feedback as a signal", async () => {
    const record = await ms.feedback({
      topic: "refund amount",
      message: "My refund should be $200 not $150",
      by: "customer-123",
      role: "customer",
    });

    expect(record.feedbackId).toMatch(/^fb_/);
    expect(record.role).toBe("customer");
    expect(record.status).toBe("pending");
  });

  it("deduplicates identical feedback", async () => {
    const input = { topic: "refund", message: "Refund is wrong" };
    const first = await ms.feedback(input);
    const second = await ms.feedback(input);
    expect(first.feedbackId).toBe(second.feedbackId);
  });

  it("summarizes feedback by topic", async () => {
    await ms.feedback({ topic: "refund", message: "Refund too low", by: "c1" });
    await ms.feedback({ topic: "refund", message: "Refund amount wrong", by: "c2" });
    await ms.feedback({ topic: "shipping", message: "Shipping too slow", by: "c3" });

    const summary = await ms.feedbackSummary();
    expect(summary).toHaveLength(2);
    expect(summary[0].topic).toBe("refund");
    expect(summary[0].count).toBe(2);
    expect(summary[1].topic).toBe("shipping");
    expect(summary[1].count).toBe(1);
  });

  it("filters summary by domain", async () => {
    await ms.feedback({ topic: "refund", message: "msg1", domain: "support" });
    await ms.feedback({ topic: "refund", message: "msg2", domain: "sales" });

    const supportSummary = await ms.feedbackSummary("support");
    expect(supportSummary).toHaveLength(1);
  });
});

describe("Role-based trust", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-role-test-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("agent corrections are auto-active", async () => {
    const correction = await ms.correct({
      wrong: "3 day refund",
      correct: "5 day refund",
      role: "agent",
    });
    expect(correction.status).toBe("active");
  });

  it("admin corrections are auto-active", async () => {
    const correction = await ms.correct({
      wrong: "old policy",
      correct: "new policy",
      role: "admin",
    });
    expect(correction.status).toBe("active");
  });

  it("customer corrections are saved as suggested", async () => {
    const correction = await ms.correct({
      wrong: "3 day refund",
      correct: "5 day refund",
      role: "customer",
    });
    expect(correction.status).toBe("suggested");
  });

  it("default role is agent (auto-active)", async () => {
    const correction = await ms.correct({
      wrong: "wrong",
      correct: "right",
    });
    expect(correction.status).toBe("active");
  });

  it("customer corrections do not appear in context", async () => {
    await ms.correct({
      wrong: "3 day refund",
      correct: "5 day refund",
      keywords: ["refund"],
      role: "customer",
    });

    const { corrections } = await ms.context("How long is the refund?");
    expect(corrections).toHaveLength(0);
  });

  it("approved customer corrections appear in context", async () => {
    const correction = await ms.correct({
      wrong: "3 day refund",
      correct: "5 day refund",
      keywords: ["refund"],
      role: "customer",
    });

    await ms.approve(correction.correctionId);

    const { corrections } = await ms.context("How long is the refund?");
    expect(corrections).toHaveLength(1);
    expect(corrections[0].correctAnswer).toBe("5 day refund");
  });
});
