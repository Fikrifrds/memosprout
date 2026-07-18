import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { evaluationCases, frozenRubricSha256, validControlIds } from "@/lib/eval/cases";
import {
  assertEvidenceManifest,
  buildEvaluationReport,
  evaluationManifestSchema,
  evaluationReportSchema,
  evaluationRunSchema,
  type EvaluationRun,
} from "@/lib/eval/report";

const sha = "a".repeat(64);

function makeRun(index: number, condition: "baseline" | "protected", success: boolean): EvaluationRun {
  const testCase = evaluationCases[index]!;
  return evaluationRunSchema.parse({
    version: "1",
    source: "live",
    runId: `evalrun_${String(index * 2 + (condition === "protected" ? 1 : 0)).padStart(16, "0")}`,
    case: testCase,
    condition,
    rubricSha256: frozenRubricSha256,
    startedAt: "2026-07-19T00:00:00.000Z",
    completedAt: "2026-07-19T00:00:01.000Z",
    durationMs: 1000,
    codex: {
      command: "codex exec <sanitized>",
      version: "codex-cli 1",
      exitCode: 0,
      turnCompleted: true,
      threadId: `thread-${index}-${condition}`,
      finalOutput: {
        version: "1",
        taskId: testCase.id,
        requestedField: testCase.requestedField,
        summary: "Completed.",
        commandsRun: ["pnpm test"],
      },
      tokenUsage: { inputTokens: null, cachedInputTokens: null, outputTokens: null },
    },
    exposure: {
      candidateSprout: false,
      okfArtifact: false,
      durableGuidance: condition === "protected",
      executableProtection: condition === "protected",
      acceptanceOracle: false,
    },
    evidence: {
      changedPaths: success ? ["api/openapi.yaml", "generated/api-client.ts"] : ["generated/api-client.ts"],
      repositoryMutated: true,
      patchSha256: sha,
      schemaContainsField: success,
      generatedClientContainsField: true,
      oracle: {
        passed: success,
        reason: success ? "generated-client-consistent" : "generated-client-diverged",
        expectedSha256: sha,
        actualSha256: sha,
      },
      tests: { command: "pnpm test", exitCode: success ? 0 : 1, passed: success },
    },
    outcome: { taskSuccess: success, policyViolation: !success, firstPass: success },
    artifacts: { trace: "trace.jsonl", patch: "repository.patch" },
  });
}

function makeReport() {
  const runs = evaluationCases.flatMap((_, index) => [
    makeRun(index, "baseline", index === 0),
    makeRun(index, "protected", true),
  ]);
  return buildEvaluationReport({
    source: "seeded",
    createdAt: "2026-07-19T00:00:00.000Z",
    rubricSha256: frozenRubricSha256,
    rubricPath: "rubric.json",
    runs,
    controls: validControlIds.map((id) => ({ id, expected: "allow" as const, observed: "allow" as const, passed: true })),
    evidenceManifestPath: "manifest.json",
    evidenceManifestSha256: sha,
  });
}

describe("evaluation report integrity", () => {
  it("derives rates and improvement from paired case evidence", () => {
    const report = makeReport();
    expect(report.metrics).toMatchObject({
      baselineCorrectWorkflowRate: 0.2,
      protectedCorrectWorkflowRate: 1,
      improvementDelta: 0.8,
      falseBlockRate: 0,
    });
  });

  it("rejects duplicate, missing, and zero-case reports", () => {
    const report = makeReport();
    const duplicate = structuredClone(report);
    duplicate.pairs[4] = structuredClone(duplicate.pairs[0]!);
    expect(evaluationReportSchema.safeParse(duplicate).success).toBe(false);
    expect(evaluationReportSchema.safeParse({ ...report, pairs: report.pairs.slice(0, 4) }).success).toBe(false);
    expect(evaluationReportSchema.safeParse({ ...report, pairs: [] }).success).toBe(false);
  });

  it("rejects metrics that are not derived from evidence", () => {
    const report = makeReport();
    expect(
      evaluationReportSchema.safeParse({
        ...report,
        metrics: { ...report.metrics, improvementDelta: 0.4 },
      }).success,
    ).toBe(false);
  });

  it("verifies seeded evidence against its manifest and rejects tampering", async () => {
    const content = "seeded evidence\n";
    const manifest = evaluationManifestSchema.parse({
      version: "1",
      generatedAt: "2026-07-19T00:00:00.000Z",
      rubricSha256: frozenRubricSha256,
      entries: [{ path: "seeded.json", sha256: createHash("sha256").update(content).digest("hex") }],
    });
    await expect(assertEvidenceManifest(manifest, async () => content)).resolves.toBeUndefined();
    await expect(assertEvidenceManifest(manifest, async () => "tampered")).rejects.toThrow("Evidence hash mismatch");
  });
});
