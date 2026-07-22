/**
 * Aggregation for the provider matrix. Every rate carries its sample size
 * and a 95% interval, because a 15-case arm cannot support a bare
 * percentage.
 */
import { distribution, proportion, type Distribution, type Proportion } from "@/eval/provider-matrix/stats";
import type { TokenUsageMean } from "@/eval/provider-matrix/analysis";
import type { ProviderRun, RepetitionResult } from "@/eval/provider-matrix/runner";

export interface ArmMetrics {
  /** Answers carrying the current fact. */
  adherence: Proportion;
  /** Answers that did not assert the stale fact. */
  staleRejection: Proportion;
  /** Fully correct: adherent and stale-free. */
  correct: Proportion;
  latencyMs: Distribution;
}

export interface ProviderSummary {
  provider: ProviderRun["provider"];
  samples: {
    attempted: number;
    completed: number;
    errored: number;
    errorCategories: Record<string, number>;
  };
  arms: {
    baseline: ArmMetrics;
    injection: ArmMetrics;
    gate: ArmMetrics;
  };
  /** Injection minus baseline on the drift + multifact cases. */
  liftPoints: number;
  /** Gate minus injection on the same cases. Often zero; that is a result. */
  gateDeltaPoints: number;
  contamination: Proportion;
  multifactPreservation: Proportion;
  retrieval: {
    recall: Proportion;
    precision: number;
    /** Corrections served on control cases, where none should apply. */
    controlServeRate: Proportion;
  };
  gateBehaviour: {
    blocks: Proportion;
    harmfulBlocks: number;
    repairAttempts: number;
    repairFailures: number;
  };
  overhead: {
    /** Extra prompt characters injection pays over baseline. */
    contextCharsMean: number;
    promptCharsBaselineMean: number;
    promptCharsInjectionMean: number;
    tokensAvailable: boolean;
    tokenUsage: Record<"baseline" | "injection" | "gate", TokenUsageMean>;
  };
}

const isCorrectionCase = (result: RepetitionResult) =>
  result.kind === "drift" || result.kind === "multifact";

function armMetrics(
  results: RepetitionResult[],
  pick: (result: RepetitionResult) => { grade: { adherence: boolean; staleRejected: boolean }; latencyMs: number } | null,
): ArmMetrics {
  const outcomes = results.map(pick).filter((outcome) => outcome !== null);
  return {
    adherence: proportion(outcomes.filter((o) => o!.grade.adherence).length, outcomes.length),
    staleRejection: proportion(outcomes.filter((o) => o!.grade.staleRejected).length, outcomes.length),
    correct: proportion(
      outcomes.filter((o) => o!.grade.adherence && o!.grade.staleRejected).length,
      outcomes.length,
    ),
    latencyMs: distribution(outcomes.map((o) => o!.latencyMs)),
  };
}

export function summarize(run: ProviderRun): ProviderSummary {
  const completed = run.repetitions.filter((result) => result.status === "ok");
  const errored = run.repetitions.filter((result) => result.status === "error");

  const errorCategories: Record<string, number> = {};
  for (const result of errored) {
    const key = result.errorCategory ?? "unknown";
    errorCategories[key] = (errorCategories[key] ?? 0) + 1;
  }

  const correctionCases = completed.filter(isCorrectionCase);
  const controlCases = completed.filter((result) => result.kind === "control");
  const multifactCases = completed.filter((result) => result.kind === "multifact");

  const rateOf = (results: RepetitionResult[], arm: "baseline" | "injection" | "gate") =>
    armMetrics(results, (result) => result[arm]).correct.rate;

  const retrievalHits = correctionCases.filter(
    (result) =>
      result.retrieval?.expectedId != null &&
      result.retrieval.servedIds.includes(result.retrieval.expectedId),
  ).length;

  const precisionSamples = correctionCases
    .filter((result) => (result.retrieval?.servedIds.length ?? 0) > 0)
    .map((result) =>
      result.retrieval!.expectedId != null &&
      result.retrieval!.servedIds.includes(result.retrieval!.expectedId)
        ? 1 / result.retrieval!.servedIds.length
        : 0,
    );

  const mean = (values: number[]) =>
    values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
  const usageMean = (arm: "baseline" | "injection" | "gate"): TokenUsageMean => {
    const usage = completed.flatMap((result) => {
      const value = result[arm]?.usage;
      return value ? [value] : [];
    });
    const optionalMean = (values: number[]) => values.length === 0 ? null : mean(values);
    return {
      samples: usage.length,
      inputTokens: optionalMean(usage.map((value) => value.inputTokens)),
      outputTokens: optionalMean(usage.map((value) => value.outputTokens)),
      totalTokens: optionalMean(usage.map((value) => value.totalTokens)),
      cachedInputTokens: optionalMean(usage.flatMap((value) =>
        value.cachedInputTokens === null ? [] : [value.cachedInputTokens])),
      cacheCreationInputTokens: optionalMean(usage.flatMap((value) =>
        value.cacheCreationInputTokens === null ? [] : [value.cacheCreationInputTokens])),
    };
  };
  const tokenUsage = {
    baseline: usageMean("baseline"),
    injection: usageMean("injection"),
    gate: usageMean("gate"),
  };

  return {
    provider: run.provider,
    samples: {
      attempted: run.repetitions.length,
      completed: completed.length,
      errored: errored.length,
      errorCategories,
    },
    arms: {
      baseline: armMetrics(correctionCases, (result) => result.baseline),
      injection: armMetrics(correctionCases, (result) => result.injection),
      gate: armMetrics(correctionCases, (result) => result.gate),
    },
    liftPoints: Number(
      ((rateOf(correctionCases, "injection") - rateOf(correctionCases, "baseline")) * 100).toFixed(1),
    ),
    gateDeltaPoints: Number(
      ((rateOf(correctionCases, "gate") - rateOf(correctionCases, "injection")) * 100).toFixed(1),
    ),
    contamination: proportion(
      controlCases.filter((result) => result.gate?.grade.contaminated).length,
      controlCases.length,
    ),
    multifactPreservation: proportion(
      multifactCases.filter((result) => result.gate?.grade.multifactPreserved === true).length,
      multifactCases.length,
    ),
    retrieval: {
      recall: proportion(retrievalHits, correctionCases.length),
      precision:
        precisionSamples.length === 0
          ? 0
          : Number(
              (precisionSamples.reduce((a, b) => a + b, 0) / precisionSamples.length).toFixed(4),
            ),
      controlServeRate: proportion(
        controlCases.filter((result) => (result.retrieval?.servedIds.length ?? 0) > 0).length,
        controlCases.length,
      ),
    },
    gateBehaviour: {
      blocks: proportion(completed.filter((result) => result.gate?.blocked).length, completed.length),
      harmfulBlocks: completed.filter((result) => result.gate?.harmful).length,
      repairAttempts: completed.filter((result) => result.gate?.repairPassed != null).length,
      repairFailures: completed.filter((result) => result.gate?.repairPassed === false).length,
    },
    overhead: {
      contextCharsMean: mean(completed.map((result) => result.retrieval?.contextChars ?? 0)),
      promptCharsBaselineMean: mean(completed.map((result) => result.baseline?.promptChars ?? 0)),
      promptCharsInjectionMean: mean(completed.map((result) => result.injection?.promptChars ?? 0)),
      tokensAvailable: Object.values(tokenUsage).some((value) => value.samples > 0),
      tokenUsage,
    },
  };
}
