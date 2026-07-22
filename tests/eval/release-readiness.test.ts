import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";
import {
  assertDeterministicReleaseThresholds,
  runDeterministicReadinessEvaluation,
} from "@/lib/eval/knowledge-drift/readiness";
import {
  retrievalProbeSchema,
  retrievalProbes,
} from "@/lib/eval/knowledge-drift/robustness";

describe("npm release readiness evaluation", () => {
  let directory: string;
  let memosprout: MemoSprout;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-readiness-"));
    memosprout = new MemoSprout(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps the fresh robustness probes valid and unique", () => {
    expect(new Set(retrievalProbes.map((probe) => probe.caseId)).size).toBe(
      retrievalProbes.length,
    );
    for (const probe of retrievalProbes) {
      expect(() => retrievalProbeSchema.parse(probe)).not.toThrow();
      expect(probe.lexical).not.toBe(probe.semantic);
    }
  });

  it("passes supported retrieval and answer-gate safety thresholds", async () => {
    const report = await runDeterministicReadinessEvaluation(memosprout);
    expect(() => assertDeterministicReleaseThresholds(report)).not.toThrow();

    // Semantic recall is reported, not marketed as a deterministic feature.
    // Keeping it visible prevents the strong supported-path result from being
    // misrepresented as embedding-like or cross-language retrieval.
    expect(report.retrieval.semanticVariantsDiagnostic.recall).toBeGreaterThanOrEqual(0);
    expect(report.retrieval.semanticVariantsDiagnostic.recall).toBeLessThanOrEqual(1);
    expect(report.retrieval.evidenceAugmentedSemanticVariants.recall).toBeGreaterThanOrEqual(0.95);
    expect(report.retrieval.irrelevantQueries.cases).toHaveLength(
      report.retrieval.irrelevantQueries.queries,
    );
    expect(report.retrieval.irrelevantQueries.contaminationRate).toBeLessThanOrEqual(0.1);
    expect(
      report.retrieval.postChangeHoldoutIrrelevantQueries.contaminationRate,
    ).toBeLessThanOrEqual(0.1);
  });

  it("never serves suggested, expired, cross-domain, or deprecated corrections", async () => {
    const suggested = await memosprout.correct({
      wrong: "Returns are accepted for 14 days",
      correct: "Returns are accepted for 30 days",
      keywords: ["returns"],
      domain: "support",
      role: "customer",
    });
    await memosprout.correct({
      wrong: "The audit window is 7 days",
      correct: "The audit window is 10 days",
      keywords: ["audit window"],
      domain: "finance",
      role: "admin",
    });
    const expired = await memosprout.correct({
      wrong: "Passwords expire every 30 days",
      correct: "Passwords expire every 90 days",
      keywords: ["password"],
      domain: "support",
      role: "admin",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const deprecated = await memosprout.correct({
      wrong: "Shipping is free above EUR 100",
      correct: "Shipping is free above EUR 75",
      keywords: ["shipping"],
      domain: "support",
      role: "admin",
    });
    await memosprout.remove(deprecated.correctionId);

    expect((await memosprout.context("returns", "support")).corrections).toEqual([]);
    expect((await memosprout.context("audit window", "support")).corrections).toEqual([]);
    expect((await memosprout.context("password", "support")).corrections).toEqual([]);
    expect((await memosprout.context("shipping", "support")).corrections).toEqual([]);
    expect((await memosprout.get(suggested.correctionId))?.status).toBe("suggested");
    expect((await memosprout.get(expired.correctionId))?.status).toBe("quarantined");
  });
});
