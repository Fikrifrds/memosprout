import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";
import { CodingAdapter } from "@/lib/adapter/coding";
import { idempotencyScenario } from "@/lib/scenario/idempotency";

describe("Outcome tracking", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-outcome-test-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("tracks corrections served via context()", async () => {
    await ms.correct({
      wrong: "12 days",
      correct: "15 days",
      keywords: ["leave"],
    });

    await ms.context("How many leave days?");
    const report = await ms.report();

    expect(report.correctionsServed).toBe(1);
    expect(report.totalQueries).toBe(1);
  });

  it("tracks blocks triggered via check()", async () => {
    await ms.correct({
      wrong: "12 days of leave",
      correct: "15 days of leave",
      keywords: ["leave"],
    });

    await ms.check("You get 12 days of leave");
    const report = await ms.report();

    expect(report.blocksTriggered).toBe(1);
    expect(report.topCorrections).toHaveLength(1);
    expect(report.topCorrections[0].timesBlocked).toBe(1);
  });

  it("tracks approvals and deprecations", async () => {
    const correction = await ms.correct({
      wrong: "w",
      correct: "c",
      role: "customer",
    });

    await ms.approve(correction.correctionId);
    await ms.remove(correction.correctionId);

    const report = await ms.report();
    expect(report.correctionsApproved).toBe(1);
    expect(report.correctionsDeprecated).toBe(1);
  });

  it("filters report by domain", async () => {
    await ms.correct({ wrong: "w1", correct: "c1", domain: "support", keywords: ["refund"] });
    await ms.correct({ wrong: "w2", correct: "c2", domain: "coding", keywords: ["deploy"] });

    await ms.context("refund policy", "support");

    const supportReport = await ms.report("support");
    expect(supportReport.correctionsServed).toBe(1);

    const codingReport = await ms.report("coding");
    expect(codingReport.correctionsServed).toBe(0);
  });
});

describe("Audit trail", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-audit-test-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("records approval in audit trail", async () => {
    const correction = await ms.correct({
      wrong: "w",
      correct: "c",
      role: "customer",
    });

    await ms.approve(correction.correctionId);
    const history = await ms.audit(correction.correctionId);

    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("approved");
    expect(history[0].actor).toBe("admin");
  });

  it("records deprecation in audit trail", async () => {
    const correction = await ms.correct({ wrong: "w", correct: "c" });
    await ms.remove(correction.correctionId);

    const history = await ms.audit(correction.correctionId);
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("deprecated");
  });

  it("returns empty history for unknown correction", async () => {
    const history = await ms.audit("corr_nonexistent");
    expect(history).toHaveLength(0);
  });
});

describe("Oracle validation via adapter", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-oracle-test-"));
    ms = new MemoSprout(directory);
    const adapter = new CodingAdapter();
    adapter.registerScenario(idempotencyScenario);
    ms.setAdapter(adapter);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("validates a correction against the oracle", async () => {
    const correction = await ms.correct({
      wrong: "Edit src/payment-store.ts without idempotency check",
      correct: "Add duplicate event ID check in src/payment-store.ts before processing",
      keywords: ["src/payment-store.ts"],
      entities: ["idempotency"],
      role: "customer",
    });

    const result = await ms.validate(correction.correctionId);
    expect(result.passed).toBe(true);
    expect(result.detail).toContain("idempotency");

    const validated = await ms.get(correction.correctionId);
    expect(validated?.status).toBe("validated");
    expect(validated?.validatedBy).toContain("coding-oracle");
    expect(validated?.validatedAt).not.toBeNull();
    expect(validated?.lastValidatedAt).not.toBeNull();

    // Oracle validation and release are separate decisions. A validated
    // correction remains out of prompts until an authorized approval.
    expect((await ms.context("payment idempotency", "general")).corrections).toEqual([]);
    await ms.approve(correction.correctionId);
    expect((await ms.get(correction.correctionId))?.status).toBe("active");
  });

  it("fails validation for unknown scenario", async () => {
    const correction = await ms.correct({
      wrong: "Edit src/payment-store.ts without checking",
      correct: "Add proper validation in src/payment-store.ts before processing",
      keywords: ["src/payment-store.ts"],
      entities: ["nonexistent"],
    });

    const result = await ms.validate(correction.correctionId);
    expect(result.passed).toBe(false);
    expect((await ms.get(correction.correctionId))?.status).toBe("quarantined");
    expect((await ms.get(correction.correctionId))?.lastValidatedAt).not.toBeNull();
  });

  it("fails validation without adapter", async () => {
    const msNoAdapter = new MemoSprout(directory);
    const correction = await msNoAdapter.correct({ wrong: "w", correct: "c" });

    const result = await msNoAdapter.validate(correction.correctionId);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("No validation oracle");
  });

  it("records revalidation in audit trail", async () => {
    const correction = await ms.correct({
      wrong: "Edit src/payment-store.ts without idempotency check",
      correct: "Add duplicate event ID check in src/payment-store.ts before processing",
      keywords: ["src/payment-store.ts"],
      entities: ["idempotency"],
    });

    await ms.validate(correction.correctionId);
    const history = await ms.audit(correction.correctionId);

    expect(history.some((e) => e.action === "revalidated")).toBe(true);
  });
});
