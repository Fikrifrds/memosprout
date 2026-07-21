import { describe, expect, it } from "vitest";

import { CodingAdapter, type CodingCorrectionInput } from "@/lib/adapter/coding";
import type { CorrectionRecord } from "@/lib/correction/schema";
import { idempotencyScenario } from "@/lib/scenario/idempotency";

describe("CodingAdapter", () => {
  const adapter = new CodingAdapter();
  adapter.registerScenario(idempotencyScenario);

  it("has the coding domain", () => {
    expect(adapter.domain).toBe("coding");
  });

  it("captures a correction from coding input", async () => {
    const input: CodingCorrectionInput = {
      scenario: "idempotency",
      task: "Implement webhook handler",
      wrongBehavior: "Process duplicate webhooks without checking",
      correctBehavior: "Check for duplicate event IDs before processing",
      guardedPaths: ["src/payment-store.ts", "src/types.ts"],
      explanation: "Duplicate webhooks cause double charges.",
      sourceRef: "AGENTS.md",
      submittedBy: "reviewer-1",
    };

    const correction = await adapter.captureCorrection(input);
    expect(correction.correctionId).toMatch(/^corr_/);
    expect(correction.domain).toBe("coding");
    expect(correction.status).toBe("suggested");
    expect(correction.wrongPattern).toBe("Process duplicate webhooks without checking");
    expect(correction.correctAnswer).toBe("Check for duplicate event IDs before processing");
    expect(correction.trigger.entities).toContain("idempotency");
    expect(correction.trigger.keywords).toContain("src/payment-store.ts");
  });

  it("produces deterministic IDs for the same input", async () => {
    const input: CodingCorrectionInput = {
      scenario: "idempotency",
      task: "task",
      wrongBehavior: "wrong",
      correctBehavior: "right",
      guardedPaths: [],
    };
    const first = await adapter.captureCorrection(input);
    const second = await adapter.captureCorrection(input);
    expect(first.correctionId).toBe(second.correctionId);
  });

  it("creates an oracle for a known scenario", () => {
    const correction: CorrectionRecord = {
      correctionId: "corr_oracle_test",
      version: 1,
      status: "suggested",
      domain: "coding",
      trigger: { keywords: [], entities: ["idempotency"] },
      wrongPattern: "wrong",
      correctAnswer: "right",
      explanation: "",
      sourceRef: "",
      submittedBy: "test",
      submittedAt: "2026-07-21T10:00:00.000Z",
      validatedBy: null,
      validatedAt: null,
      deprecatedAt: null,
      deprecatedReason: null,
      confirmCount: 0,
      sourceHash: null,
      expiresAt: null,
      lastValidatedAt: null,
      staleness: "fresh" as const,
    };

    const oracle = adapter.createOracle(correction);
    expect(oracle.id).toContain("coding-oracle");
  });

  it("oracle passes for a registered scenario", async () => {
    const correction: CorrectionRecord = {
      correctionId: "corr_oracle_pass",
      version: 1,
      status: "suggested",
      domain: "coding",
      trigger: { keywords: ["src/payment-store.ts"], entities: ["idempotency"] },
      wrongPattern: "Edit src/payment-store.ts directly without idempotency check",
      correctAnswer: "Add duplicate event ID check before processing in src/payment-store.ts",
      explanation: "",
      sourceRef: "",
      submittedBy: "test",
      submittedAt: "2026-07-21T10:00:00.000Z",
      validatedBy: null,
      validatedAt: null,
      deprecatedAt: null,
      deprecatedReason: null,
      confirmCount: 0,
      sourceHash: null,
      expiresAt: null,
      lastValidatedAt: null,
      staleness: "fresh" as const,
    };

    const oracle = adapter.createOracle(correction);
    const result = await oracle.evaluate(correction);
    expect(result.passed).toBe(true);
    expect(result.detail).toContain("idempotency");
  });

  it("oracle fails for an unknown scenario", async () => {
    const correction: CorrectionRecord = {
      correctionId: "corr_oracle_fail",
      version: 1,
      status: "suggested",
      domain: "coding",
      trigger: { keywords: [], entities: ["nonexistent"] },
      wrongPattern: "wrong",
      correctAnswer: "right",
      explanation: "",
      sourceRef: "",
      submittedBy: "test",
      submittedAt: "2026-07-21T10:00:00.000Z",
      validatedBy: null,
      validatedAt: null,
      deprecatedAt: null,
      deprecatedReason: null,
      confirmCount: 0,
      sourceHash: null,
      expiresAt: null,
      lastValidatedAt: null,
      staleness: "fresh" as const,
    };

    const oracle = adapter.createOracle(correction);
    const result = await oracle.evaluate(correction);
    expect(result.passed).toBe(false);
  });

  it("builds context from corrections", () => {
    const corrections: CorrectionRecord[] = [
      {
        correctionId: "corr_ctx1",
        version: 1,
        status: "active",
        domain: "coding",
        trigger: { keywords: [], entities: [] },
        wrongPattern: "Edit generated files directly",
        correctAnswer: "Modify the schema and regenerate",
        explanation: "",
        sourceRef: "AGENTS.md",
        submittedBy: "test",
        submittedAt: "2026-07-21T10:00:00.000Z",
        validatedBy: "oracle",
        validatedAt: "2026-07-21T11:00:00.000Z",
        deprecatedAt: null,
        deprecatedReason: null,
        confirmCount: 0,
        sourceHash: null,
        expiresAt: null,
        lastValidatedAt: null,
        staleness: "fresh" as const,
      },
    ];

    const context = adapter.buildContext(corrections);
    expect(context).toContain("Do NOT: Edit generated files directly");
    expect(context).toContain("Instead: Modify the schema and regenerate");
    expect(context).toContain("Source: AGENTS.md");
  });

  it("returns empty context for no corrections", () => {
    expect(adapter.buildContext([])).toBe("");
  });

  it("blocks edits to guarded paths", () => {
    const result = adapter.checkOutput("src/payment-store.ts");
    expect(result.blocked).toBe(true);
    expect(result.sourceRef).toContain("idempotency");
  });

  it("allows edits to non-guarded paths", () => {
    const result = adapter.checkOutput("src/webhook-handler.ts");
    expect(result.blocked).toBe(false);
  });
});
