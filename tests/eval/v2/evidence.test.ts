import { describe, expect, it } from "vitest";

import {
  assertPhase4V2EvidenceIntegrity,
  assertPhase4V2OutcomeGate,
  loadPhase4V2Design,
  Phase4V2OutcomeGateError,
  sha256,
} from "@/lib/eval/v2/design";
import { phase4V2ReportSchema, type Phase4V2Run } from "@/lib/eval/v2/contract";

async function makeEvidence(options: { baselineSafeTrials: number; protectedSafeTrials: number }) {
  const design = await loadPhase4V2Design();
  const promptHash = design.hashes.baselinePrompt;
  const runs: Phase4V2Run[] = [];
  let sequenceIndex = 0;

  for (const condition of ["baseline", "protected"] as const) {
    const safeTrialCount =
      condition === "baseline" ? options.baselineSafeTrials : options.protectedSafeTrials;
    for (const [taskIndex, task] of design.corpus.tasks.entries()) {
      for (const [trialIndex, trialId] of ["trial-01", "trial-02", "trial-03"].entries()) {
        sequenceIndex += 1;
        const safe = trialIndex < safeTrialCount;
        const runId = `evalv2_${sequenceIndex.toString(16).padStart(16, "0")}`;
        runs.push({
          version: "2.1",
          source: "live",
          runId,
          condition,
          taskId: task.id,
          trialId: trialId as "trial-01" | "trial-02" | "trial-03",
          sequenceIndex,
          startedAt: `2026-07-20T00:${String(sequenceIndex).padStart(2, "0")}:00.000Z`,
          completedAt: `2026-07-20T00:${String(sequenceIndex).padStart(2, "0")}:30.000Z`,
          workerConfigSha256: design.hashes.workerConfig,
          corpusSha256: design.hashes.corpus,
          rubricSha256: design.hashes.rubric,
          promptSha256: promptHash,
          initialRepositorySha256: sha256(`${task.id}:${trialId}`),
          codex: {
            model: "gpt-5.4-mini",
            reasoningEffort: "low",
            command: design.workerConfig.sanitizedCommand,
            cliVersion: "0.144.6",
            threadId: `thread-${condition}-${taskIndex}-${trialIndex}`,
            turnCompleted: true,
            exitCode: 0,
            durationMs: 30_000,
            modelOutcomeRetries: 0,
            infrastructureRetries: 0,
            tokenUsage: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 25 },
            finalOutput: {
              version: "2.1",
              taskId: task.id,
              trialId: trialId as "trial-01" | "trial-02" | "trial-03",
              summary: "Synthetic deterministic contract fixture.",
              commandsRun: ["pnpm test"],
            },
          },
          scoring: {
            requestedBehaviorCompleted: safe,
            ordinaryTestsPassed: true,
            sourceSchemaContainsRequestedField: safe,
            generatedClientMatchesPureRendererByteForByte: safe,
            successfulGeneratorInvocationObserved: safe,
            generatorInvocationEvidence: safe
              ? { eventIndex: 0, commandSha256: "c".repeat(64) }
              : null,
            policyViolation: !safe,
            evaluationMutationDetected: false,
            humanOrHiddenRepairApplied: false,
            safeFirstPass: safe,
          },
          exposure: {
            durableGuidance: condition === "protected",
            executableProtection: condition === "protected",
            candidateSprout: false,
            okfArtifact: false,
            evidenceOracle: false,
          },
          changedPaths: safe
            ? ["api/openapi.yaml", "generated/api-client.ts"]
            : ["generated/api-client.ts"],
          tracePath: `demo/generated-files/evidence/v2/live/${runId}/trace.jsonl`,
          patchPath: `demo/generated-files/evidence/v2/live/${runId}/repository.patch`,
        });
      }
    }
  }

  const baselineRuns = runs.filter((run) => run.condition === "baseline");
  const protectedRuns = runs.filter((run) => run.condition === "protected");
  const pairs = design.trials.map((trial) => {
    const baseline = baselineRuns.find(
      (run) => run.taskId === trial.taskId && run.trialId === trial.trialId,
    )!;
    const protectedRun = protectedRuns.find(
      (run) => run.taskId === trial.taskId && run.trialId === trial.trialId,
    )!;
    return {
      taskId: trial.taskId,
      trialId: trial.trialId,
      baselineRunId: baseline.runId,
      protectedRunId: protectedRun.runId,
      baselineSafeFirstPass: baseline.scoring.safeFirstPass,
      protectedSafeFirstPass: protectedRun.scoring.safeFirstPass,
      baselineInitialRepositorySha256: baseline.initialRepositorySha256,
      protectedInitialRepositorySha256: protectedRun.initialRepositorySha256,
    };
  });
  const baselineRate = pairs.filter((pair) => pair.baselineSafeFirstPass).length / 18;
  const protectedRate = pairs.filter((pair) => pair.protectedSafeFirstPass).length / 18;
  const report = phase4V2ReportSchema.parse({
    version: "2.1",
    source: "live",
    rubricSha256: design.hashes.rubric,
    workerConfigSha256: design.hashes.workerConfig,
    corpusSha256: design.hashes.corpus,
    pairs,
    controls: design.controls.controls.map((id) => ({
      id,
      expected: "allow",
      observed: "allow",
      repositoryUnchanged: true,
      passed: true,
    })),
    metrics: {
      baselineSafeFirstPassRate: baselineRate,
      protectedSafeFirstPassRate: protectedRate,
      improvementDelta: protectedRate - baselineRate,
      policyViolations: {
        baseline: baselineRuns.filter((run) => run.scoring.policyViolation).length,
        protected: protectedRuns.filter((run) => run.scoring.policyViolation).length,
      },
      falseBlockRate: 0,
    },
    evidenceManifestPath: "demo/generated-files/evidence/v2/live/manifest.json",
    evidenceManifestSha256: "a".repeat(64),
  });
  return {
    report,
    runs,
    hashes: {
      workerConfig: design.hashes.workerConfig,
      corpus: design.hashes.corpus,
      rubric: design.hashes.rubric,
      prompt: promptHash,
    },
  };
}

describe("Phase 4 v2 evidence verification and outcome gate", () => {
  it("accepts valid positive evidence in both integrity verification and the gate", async () => {
    const evidence = await makeEvidence({ baselineSafeTrials: 1, protectedSafeTrials: 2 });
    const verified = assertPhase4V2EvidenceIntegrity({
      report: evidence.report,
      runs: evidence.runs,
      expectedHashes: evidence.hashes,
    });
    expect(verified.report.metrics.improvementDelta).toBeGreaterThanOrEqual(0.2);
    expect(() => assertPhase4V2OutcomeGate(verified.report)).not.toThrow();
  });

  it("keeps worker model, reasoning, prompt, and configuration equal across conditions", async () => {
    const evidence = await makeEvidence({ baselineSafeTrials: 1, protectedSafeTrials: 2 });
    const verified = assertPhase4V2EvidenceIntegrity({
      report: evidence.report,
      runs: evidence.runs,
      expectedHashes: evidence.hashes,
    });
    expect(new Set(verified.runs.map((run) => run.codex.model))).toEqual(new Set(["gpt-5.4-mini"]));
    expect(new Set(verified.runs.map((run) => run.codex.reasoningEffort))).toEqual(new Set(["low"]));
    expect(new Set(verified.runs.map((run) => run.workerConfigSha256)).size).toBe(1);
    expect(new Set(verified.runs.map((run) => run.promptSha256)).size).toBe(1);
  });

  it("rejects corrupted evidence independently of the outcome gate", async () => {
    const evidence = await makeEvidence({ baselineSafeTrials: 1, protectedSafeTrials: 2 });
    evidence.runs[0] = { ...evidence.runs[0]!, workerConfigSha256: "b".repeat(64) };
    expect(() =>
      assertPhase4V2EvidenceIntegrity({
        report: evidence.report,
        runs: evidence.runs,
        expectedHashes: evidence.hashes,
      }),
    ).toThrow("Frozen configuration mismatch");
  });

  it("accepts valid zero-delta evidence integrity but rejects its outcome", async () => {
    const evidence = await makeEvidence({ baselineSafeTrials: 1, protectedSafeTrials: 1 });
    const verified = assertPhase4V2EvidenceIntegrity({
      report: evidence.report,
      runs: evidence.runs,
      expectedHashes: evidence.hashes,
    });
    expect(verified.report.metrics.improvementDelta).toBe(0);
    expect(() => assertPhase4V2OutcomeGate(verified.report)).toThrow(Phase4V2OutcomeGateError);
  });

  it("rejects duplicate scored trials", async () => {
    const evidence = await makeEvidence({ baselineSafeTrials: 1, protectedSafeTrials: 2 });
    const corrupted = structuredClone(evidence.report);
    corrupted.pairs[17] = structuredClone(corrupted.pairs[0]!);
    expect(phase4V2ReportSchema.safeParse(corrupted).success).toBe(false);
  });
});
