import { describe, expect, it } from "vitest";

import { correctionRecordSchema } from "@/lib/correction/schema";

const validCorrection = {
  correctionId: "corr_abc123",
  version: 1,
  status: "suggested" as const,
  domain: "coding",
  trigger: { keywords: ["generated"], entities: ["generated-files"] },
  wrongPattern: "Edit the generated file directly",
  correctAnswer: "Modify the source schema and run the generator",
  explanation: "Generated files are overwritten on each build.",
  sourceRef: "AGENTS.md",
  submittedBy: "reviewer-1",
  submittedAt: "2026-07-21T10:00:00.000Z",
  validatedBy: null,
  validatedAt: null,
  deprecatedAt: null,
  deprecatedReason: null,
  confirmCount: 0,
};

describe("CorrectionRecord schema", () => {
  it("accepts a valid correction record", () => {
    const result = correctionRecordSchema.parse(validCorrection);
    expect(result.correctionId).toBe("corr_abc123");
    expect(result.status).toBe("suggested");
    expect(result.domain).toBe("coding");
  });

  it("rejects an invalid correction ID", () => {
    expect(() =>
      correctionRecordSchema.parse({ ...validCorrection, correctionId: "bad-id" }),
    ).toThrow();
  });

  it("rejects an empty wrongPattern", () => {
    expect(() =>
      correctionRecordSchema.parse({ ...validCorrection, wrongPattern: "" }),
    ).toThrow();
  });

  it("applies default values", () => {
    const minimal = {
      correctionId: "corr_minimal1",
      domain: "rag-chat",
      trigger: { keywords: [], entities: [] },
      wrongPattern: "wrong",
      correctAnswer: "right",
      submittedAt: "2026-07-21T10:00:00.000Z",
    };
    const result = correctionRecordSchema.parse(minimal);
    expect(result.version).toBe(1);
    expect(result.status).toBe("suggested");
    expect(result.explanation).toBe("");
    expect(result.sourceRef).toBe("");
    expect(result.submittedBy).toBe("unknown");
    expect(result.confirmCount).toBe(0);
    expect(result.validatedBy).toBeNull();
  });

  it("accepts all valid statuses", () => {
    for (const status of ["suggested", "quarantined", "validated", "active", "deprecated"]) {
      const result = correctionRecordSchema.parse({ ...validCorrection, status });
      expect(result.status).toBe(status);
    }
  });
});
