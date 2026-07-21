import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout, type SourceHashProvider } from "@/lib/index";
import {
  detectConflict,
  evaluateStaleness,
  findConflicts,
  isExpired,
} from "@/lib/correction/staleness";
import type { CorrectionRecord } from "@/lib/correction/schema";

function makeCorrection(overrides: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return {
    correctionId: "corr_stale_test1",
    version: 1,
    status: "active",
    domain: "rag-chat",
    trigger: { keywords: ["leave"], entities: [] },
    wrongPattern: "12 days",
    correctAnswer: "15 days",
    explanation: "",
    sourceRef: "HR-Policy.pdf",
    submittedBy: "test",
    submittedAt: "2026-01-15T10:00:00.000Z",
    validatedBy: null,
    validatedAt: null,
    deprecatedAt: null,
    deprecatedReason: null,
    confirmCount: 0,
    sourceHash: "hash_v1",
    expiresAt: null,
    lastValidatedAt: null,
    staleness: "fresh",
    ...overrides,
  };
}

describe("Staleness detection", () => {
  describe("isExpired", () => {
    it("returns false when no expiresAt", () => {
      expect(isExpired(makeCorrection())).toBe(false);
    });

    it("returns false when not yet expired", () => {
      const correction = makeCorrection({ expiresAt: "2030-01-01T00:00:00.000Z" });
      expect(isExpired(correction)).toBe(false);
    });

    it("returns true when expired", () => {
      const correction = makeCorrection({ expiresAt: "2020-01-01T00:00:00.000Z" });
      expect(isExpired(correction)).toBe(true);
    });
  });

  describe("detectConflict", () => {
    it("detects when new correction contradicts an active one", () => {
      const existing = makeCorrection({
        correctAnswer: "15 days",
        wrongPattern: "12 days",
      });
      const conflict = detectConflict(existing, {
        wrongPattern: "15 days",
        correctAnswer: "20 days",
      });
      expect(conflict).toBe(true);
    });

    it("no conflict when corrections agree", () => {
      const existing = makeCorrection({
        correctAnswer: "15 days",
        wrongPattern: "12 days",
      });
      const conflict = detectConflict(existing, {
        wrongPattern: "12 days",
        correctAnswer: "15 days",
      });
      expect(conflict).toBe(false);
    });

    it("no conflict for non-active corrections", () => {
      const existing = makeCorrection({
        status: "deprecated",
        correctAnswer: "15 days",
        wrongPattern: "12 days",
      });
      const conflict = detectConflict(existing, {
        wrongPattern: "15 days",
        correctAnswer: "20 days",
      });
      expect(conflict).toBe(false);
    });
  });

  describe("findConflicts", () => {
    it("finds conflicting corrections in the same domain", () => {
      const corrections = [
        makeCorrection({ correctionId: "corr_a", correctAnswer: "15 days", wrongPattern: "12 days" }),
        makeCorrection({ correctionId: "corr_b", correctAnswer: "5 days", wrongPattern: "3 days", domain: "coding" }),
      ];
      const conflicts = findConflicts(corrections, {
        wrongPattern: "15 days",
        correctAnswer: "20 days",
        domain: "rag-chat",
      });
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].correctionId).toBe("corr_a");
    });
  });

  describe("evaluateStaleness", () => {
    it("marks expired corrections as quarantined", async () => {
      const correction = makeCorrection({ expiresAt: "2020-01-01T00:00:00.000Z" });
      const result = await evaluateStaleness(correction);
      expect(result.staleness).toBe("expired");
      expect(result.status).toBe("quarantined");
    });

    it("marks source-changed corrections as quarantined", async () => {
      const provider: SourceHashProvider = {
        async getCurrentHash() {
          return "hash_v2_different";
        },
      };
      const correction = makeCorrection({ sourceHash: "hash_v1" });
      const result = await evaluateStaleness(correction, { sourceHashProvider: provider });
      expect(result.staleness).toBe("source_changed");
      expect(result.status).toBe("quarantined");
    });

    it("keeps fresh corrections fresh when source unchanged", async () => {
      const provider: SourceHashProvider = {
        async getCurrentHash() {
          return "hash_v1";
        },
      };
      const correction = makeCorrection({ sourceHash: "hash_v1" });
      const result = await evaluateStaleness(correction, { sourceHashProvider: provider });
      expect(result.staleness).toBe("fresh");
      expect(result.status).toBe("active");
    });

    it("skips deprecated corrections", async () => {
      const correction = makeCorrection({
        status: "deprecated",
        expiresAt: "2020-01-01T00:00:00.000Z",
      });
      const result = await evaluateStaleness(correction);
      expect(result.status).toBe("deprecated");
    });
  });
});

describe("MemoSprout staleness integration", () => {
  let directory: string;
  let ms: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-stale-test-"));
    ms = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("auto-quarantines conflicting corrections on correct()", async () => {
    await ms.correct({
      wrong: "12 days",
      correct: "15 days",
      domain: "rag-chat",
      keywords: ["leave"],
    });

    await ms.correct({
      wrong: "15 days",
      correct: "20 days",
      domain: "rag-chat",
      keywords: ["leave"],
    });

    const all = await ms.list({ domain: "rag-chat" });
    const quarantined = all.filter((c) => c.status === "quarantined");
    const active = all.filter((c) => c.status === "active");

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].staleness).toBe("conflict");
    expect(quarantined[0].correctAnswer).toBe("15 days");
    expect(active).toHaveLength(1);
    expect(active[0].correctAnswer).toBe("20 days");
  });

  it("skips expired corrections in context()", async () => {
    await ms.correct({
      wrong: "12 days",
      correct: "15 days",
      keywords: ["leave"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const result = await ms.context("How many leave days?");
    expect(result.corrections).toHaveLength(0);
    expect(result.staleSkipped).toBe(1);
  });

  it("skips expired corrections in check()", async () => {
    await ms.correct({
      wrong: "12 days of leave",
      correct: "15 days of leave",
      keywords: ["leave"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const result = await ms.check("You get 12 days of leave");
    expect(result.ok).toBe(true);
  });

  it("refreshStaleness detects expired corrections", async () => {
    await ms.correct({
      wrong: "w1",
      correct: "c1",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    await ms.correct({ wrong: "w2", correct: "c2" });

    const result = await ms.refreshStaleness();
    expect(result.checked).toBe(2);
    expect(result.stale).toBe(1);

    const all = await ms.list();
    const expired = all.find((c) => c.staleness === "expired");
    expect(expired).toBeDefined();
    expect(expired!.status).toBe("quarantined");
  });

  it("refreshStaleness detects source changes via provider", async () => {
    await ms.correct({
      wrong: "old answer",
      correct: "current answer",
      source: "doc.pdf",
      sourceHash: "hash_v1",
    });

    ms.setSourceHashProvider({
      async getCurrentHash() {
        return "hash_v2_changed";
      },
    });

    const result = await ms.refreshStaleness();
    expect(result.stale).toBe(1);

    const all = await ms.list();
    expect(all[0].staleness).toBe("source_changed");
    expect(all[0].status).toBe("quarantined");
  });

  it("stores sourceHash and expiresAt in correction", async () => {
    const correction = await ms.correct({
      wrong: "w",
      correct: "c",
      source: "doc.pdf",
      sourceHash: "abc123",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });

    expect(correction.sourceHash).toBe("abc123");
    expect(correction.expiresAt).toBe("2027-01-01T00:00:00.000Z");

    const loaded = await ms.get(correction.correctionId);
    expect(loaded!.sourceHash).toBe("abc123");
    expect(loaded!.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });
});
