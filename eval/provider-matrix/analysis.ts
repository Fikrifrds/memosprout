/**
 * Corrected analysis of a matrix run (MATRIX_REVISION_V2).
 *
 * The first pass of this report made four measurement errors. This module
 * is the fix, and it recomputes everything from the stored raw results
 * rather than from any previously reported figure:
 *
 * 1. Precision counted only correction cases, so corrections retrieved for
 *    control questions — which are irrelevant by definition — never landed
 *    in the denominator. Micro precision here spans every retrieval the
 *    run performed.
 * 2. Three repetitions of nine cases were reported as n=27 independent
 *    observations. They are nine items measured three times. Rates are
 *    now item-level and intervals come from a bootstrap over items, which
 *    respects the clustering instead of pretending it away.
 * 3. Contamination and control correctness were reported for the gate arm
 *    only, so there was no way to see whether injection itself was what
 *    degraded a control answer.
 * 4. Cross-provider transfer included provider-to-itself pairs, which are
 *    not cross-provider at all.
 */
import { grade, gradePasses, type ProviderRun, type RepetitionResult } from "@/eval/provider-matrix/runner";
import { matrixCases } from "@/eval/provider-matrix/tasks";

export type ArmName = "baseline" | "injection" | "gate";

/**
 * Deterministic RNG. The bootstrap has to produce the same interval on
 * every run, or the regression verifier cannot check the headline claims.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ItemRate {
  /** Number of distinct cases (not case-repetitions). */
  items: number;
  /** Total repetitions behind those items. */
  observations: number;
  /** Mean over items of that item's pass fraction. */
  rate: number;
  /** Percentile bootstrap over items, 95%. */
  ci95: [number, number];
  /** Items that passed in every repetition. */
  itemsAlwaysPass: number;
  /** Items that passed in some but not all repetitions. */
  itemsUnstable: number;
}

const BOOTSTRAP_RESAMPLES = 10_000;
const BOOTSTRAP_SEED = 20260722;

/** Item-level rate with a cluster bootstrap. `perItem` holds pass fractions. */
export function itemRate(perItem: number[], observations: number): ItemRate {
  const items = perItem.length;
  if (items === 0) {
    return { items: 0, observations, rate: 0, ci95: [0, 0], itemsAlwaysPass: 0, itemsUnstable: 0 };
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const random = mulberry32(BOOTSTRAP_SEED);
  const means: number[] = [];

  for (let resample = 0; resample < BOOTSTRAP_RESAMPLES; resample += 1) {
    const sample: number[] = [];
    for (let index = 0; index < items; index += 1) {
      sample.push(perItem[Math.floor(random() * items)]!);
    }
    means.push(mean(sample));
  }
  means.sort((a, b) => a - b);

  const round = (value: number) => Number(value.toFixed(4));
  return {
    items,
    observations,
    rate: round(mean(perItem)),
    ci95: [
      round(means[Math.floor(0.025 * BOOTSTRAP_RESAMPLES)]!),
      round(means[Math.ceil(0.975 * BOOTSTRAP_RESAMPLES) - 1]!),
    ],
    itemsAlwaysPass: perItem.filter((value) => value === 1).length,
    itemsUnstable: perItem.filter((value) => value > 0 && value < 1).length,
  };
}

/** Groups repetitions by case id and scores each case with `passed`. */
function byItem(
  results: RepetitionResult[],
  passed: (result: RepetitionResult) => boolean | null,
): { perItem: number[]; observations: number } {
  const groups = new Map<string, boolean[]>();
  for (const result of results) {
    const verdict = passed(result);
    if (verdict === null) continue;
    const existing = groups.get(result.caseId) ?? [];
    existing.push(verdict);
    groups.set(result.caseId, existing);
  }

  const perItem = [...groups.values()].map(
    (verdicts) => verdicts.filter(Boolean).length / verdicts.length,
  );
  return {
    perItem,
    observations: [...groups.values()].reduce((sum, verdicts) => sum + verdicts.length, 0),
  };
}

function rateFor(
  results: RepetitionResult[],
  passed: (result: RepetitionResult) => boolean | null,
): ItemRate {
  const { perItem, observations } = byItem(results, passed);
  return itemRate(perItem, observations);
}

const isCorrectionCase = (result: RepetitionResult) =>
  result.kind === "drift" || result.kind === "multifact";

/**
 * Would a caller actually be allowed to send this?
 *
 * The oracle judges the text; `check()` judges whether MemoSprout itself
 * still objects to it. A repaired answer that fails the re-check is one the
 * pipeline is required to withhold, so counting it as a correct gate output
 * would credit the arm for something no deployment may ship.
 *
 * Legacy runs recorded no repair (`repairPassed` absent) and are scored on
 * the oracle alone, exactly as they were — history is analysed as it
 * happened, not rewritten under the newer rule.
 */
export function isShippable(result: RepetitionResult, arm: ArmName): boolean {
  if (arm !== "gate") return true;
  const gate = result.gate;
  if (!gate || gate.repairPassed === undefined) return true;
  return !gate.blocked || gate.repairPassed === true;
}

/** Fully correct: carries the current fact, rejects the stale one, and is sendable. */
const armCorrect = (arm: ArmName) => (result: RepetitionResult) => {
  const outcome = result[arm];
  if (!outcome) return null;
  return gradePasses(outcome.grade) && isShippable(result, arm);
};

const armContaminated = (arm: ArmName) => (result: RepetitionResult) => {
  const outcome = result[arm];
  if (!outcome) return null;
  return outcome.grade.contaminated;
};

export interface ArmView {
  correctionCases: ItemRate;
  controlCorrect: ItemRate;
  controlContaminated: ItemRate;
}

export interface CorrectedSummary {
  provider: ProviderRun["provider"];
  /** Per-arm completion, so a provider that failed one arm is visible. */
  arms: Record<ArmName, ArmView>;
  completeness: {
    attempted: number;
    /** Repetitions with a usable observation, per arm. */
    observedPerArm: Record<ArmName, number>;
    errored: number;
    /** Failures by arm, including partial repetitions. */
    errorsPerArm: Record<ArmName, Record<string, number>>;
  };
  paired: {
    baselineToInjection: PairedChange;
    injectionToGate: PairedChange;
  };
  perCase: Record<string, Record<ArmName, { passed: number; observations: number }>>;
  liftPoints: number;
  gateDeltaPoints: number;
  retrieval: {
    /** Item-level recall over correction cases. */
    recall: ItemRate;
    /** Retrieved-and-relevant over everything retrieved, controls included. */
    microPrecision: number;
    microRelevant: number;
    microRetrieved: number;
    /** Corrections served on control questions, where none applies. */
    controlServeRate: ItemRate;
    servedOnControls: number;
  };
  gate: {
    blockRate: ItemRate;
    harmfulBlocks: number;
    repairAttempts: number;
    repairFailures: number;
  };
  overhead: {
    contextCharsMean: number;
    promptCharsBaselineMean: number;
    promptCharsInjectionMean: number;
    tokensAvailable: boolean;
    tokenUsage: Record<ArmName, TokenUsageMean>;
  };
}

export interface TokenUsageMean {
  samples: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  cacheCreationInputTokens: number | null;
}

export interface PairedChange {
  wins: number;
  losses: number;
  ties: number;
  pairs: number;
}

function pairedChange(
  results: RepetitionResult[],
  from: ArmName,
  to: ArmName,
): PairedChange {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const result of results) {
    const before = armCorrect(from)(result);
    const after = armCorrect(to)(result);
    if (before === null || after === null) continue;
    if (!before && after) wins += 1;
    else if (before && !after) losses += 1;
    else ties += 1;
  }
  return { wins, losses, ties, pairs: wins + losses + ties };
}

function tokenUsageMean(results: RepetitionResult[], arm: ArmName): TokenUsageMean {
  const usage = results.flatMap((result) => {
    const value = result[arm]?.usage;
    return value ? [value] : [];
  });
  const optionalMean = (values: number[]) => values.length === 0
    ? null
    : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
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
}

const caseById = new Map(matrixCases.map((testCase) => [testCase.id, testCase]));

/**
 * Re-scores stored answers with the current oracle.
 *
 * Grades are written at run time, so an oracle defect found afterwards
 * would otherwise be frozen into the results — and this run had two:
 * "euros" did not match "euro", and "5,000" did not match "5000". Both
 * marked correct answers wrong. Re-grading fixes them from the stored
 * text, with no new calls to any provider.
 */
export function regrade(run: ProviderRun): ProviderRun {
  return {
    ...run,
    repetitions: run.repetitions.map((result) => {
      const testCase = caseById.get(result.caseId);
      if (!testCase) return result;
      const score = <T extends { answer: string }>(outcome: T | null) =>
        outcome === null ? null : { ...outcome, grade: grade(testCase, outcome.answer) };
      const baseline = score(result.baseline);
      const injection = score(result.injection);
      const scoredGate = score(result.gate);
      const rescoredResult = { ...result, baseline, injection, gate: scoredGate };
      const gate = scoredGate === null
        ? null
        : {
            ...scoredGate,
            harmful:
              injection !== null &&
              gradePasses(injection.grade) &&
              !(gradePasses(scoredGate.grade) && isShippable(rescoredResult, "gate")),
          };
      return {
        ...result,
        baseline,
        injection,
        gate,
      };
    }),
  };
}

export function correctedSummary(rawRun: ProviderRun): CorrectedSummary {
  const run = regrade(rawRun);
  // "partial" repetitions carry a usable observation for at least one arm.
  // Per-arm grouping drops the missing side on its own, so keeping them
  // preserves data that a whole-repetition filter would throw away.
  const observed = run.repetitions;
  const errored = run.repetitions.filter((result) => result.status === "error");
  const corrections = observed.filter(isCorrectionCase);
  const controls = observed.filter((result) => result.kind === "control");

  const errorsPerArm: CorrectedSummary["completeness"]["errorsPerArm"] = {
    baseline: {},
    injection: {},
    gate: {},
  };
  for (const result of run.repetitions) {
    const legacy = result.armErrors as RepetitionResult["armErrors"] | undefined;
    const errors = {
      baseline: legacy?.baseline ?? (result.baseline ? null : result.errorCategory ?? "unknown"),
      injection: legacy?.injection ?? (result.injection ? null : result.errorCategory ?? "unknown"),
      gate: legacy?.gate ?? (result.gate ? null : result.injection ? "unknown" : "not_attempted"),
    };
    for (const arm of ["baseline", "injection", "gate"] as const) {
      const error = errors[arm];
      if (error === null) continue;
      errorsPerArm[arm][error] = (errorsPerArm[arm][error] ?? 0) + 1;
    }
  }

  const view = (arm: ArmName): ArmView => ({
    correctionCases: rateFor(corrections, armCorrect(arm)),
    controlCorrect: rateFor(controls, armCorrect(arm)),
    controlContaminated: rateFor(controls, armContaminated(arm)),
  });

  const arms = { baseline: view("baseline"), injection: view("injection"), gate: view("gate") };

  let microRetrieved = 0;
  let microRelevant = 0;
  let servedOnControls = 0;
  for (const result of observed) {
    if (!result.retrieval) continue;
    microRetrieved += result.retrieval.servedIds.length;
    if (
      result.retrieval.expectedId != null &&
      result.retrieval.servedIds.includes(result.retrieval.expectedId)
    ) {
      microRelevant += 1;
    }
    if (result.kind === "control") servedOnControls += result.retrieval.servedIds.length;
  }

  const mean = (values: number[]) =>
    values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
  const tokenUsage = {
    baseline: tokenUsageMean(observed, "baseline"),
    injection: tokenUsageMean(observed, "injection"),
    gate: tokenUsageMean(observed, "gate"),
  };

  const observedPerArm = (arm: ArmName) =>
    observed.filter((result) => result[arm] !== null).length;

  const perCase: CorrectedSummary["perCase"] = {};
  for (const result of corrections) {
    const caseRates = (perCase[result.caseId] ??= {
      baseline: { passed: 0, observations: 0 },
      injection: { passed: 0, observations: 0 },
      gate: { passed: 0, observations: 0 },
    });
    for (const arm of ["baseline", "injection", "gate"] as const) {
      const passed = armCorrect(arm)(result);
      if (passed === null) continue;
      caseRates[arm].observations += 1;
      if (passed) caseRates[arm].passed += 1;
    }
  }

  return {
    provider: run.provider,
    arms,
    completeness: {
      attempted: run.repetitions.length,
      observedPerArm: {
        baseline: observedPerArm("baseline"),
        injection: observedPerArm("injection"),
        gate: observedPerArm("gate"),
      },
      errored: errored.length,
      errorsPerArm,
    },
    paired: {
      baselineToInjection: pairedChange(corrections, "baseline", "injection"),
      injectionToGate: pairedChange(corrections, "injection", "gate"),
    },
    perCase,
    liftPoints: Number(
      ((arms.injection.correctionCases.rate - arms.baseline.correctionCases.rate) * 100).toFixed(1),
    ),
    gateDeltaPoints: Number(
      ((arms.gate.correctionCases.rate - arms.injection.correctionCases.rate) * 100).toFixed(1),
    ),
    retrieval: {
      recall: rateFor(corrections, (result) =>
        result.retrieval?.expectedId == null
          ? null
          : result.retrieval.servedIds.includes(result.retrieval.expectedId),
      ),
      microPrecision:
        microRetrieved === 0 ? 0 : Number((microRelevant / microRetrieved).toFixed(4)),
      microRelevant,
      microRetrieved,
      controlServeRate: rateFor(controls, (result) =>
        result.retrieval ? result.retrieval.servedIds.length > 0 : null,
      ),
      servedOnControls,
    },
    gate: {
      blockRate: rateFor(observed, (result) => result.gate?.blocked ?? null),
      harmfulBlocks: observed.filter((result) => result.gate?.harmful).length,
      repairAttempts: observed.filter((result) => result.gate?.repairPassed != null).length,
      repairFailures: observed.filter((result) => result.gate?.repairPassed === false).length,
    },
    overhead: {
      contextCharsMean: mean(observed.flatMap((result) =>
        result.retrieval ? [result.retrieval.contextChars] : [])),
      promptCharsBaselineMean: mean(observed.flatMap((result) =>
        result.baseline ? [result.baseline.promptChars] : [])),
      promptCharsInjectionMean: mean(observed.flatMap((result) =>
        result.injection ? [result.injection.promptChars] : [])),
      tokensAvailable: Object.values(tokenUsage).some((value) => value.samples > 0),
      tokenUsage,
    },
  };
}

export interface TransferSummary {
  /** Pairs where extractor and answerer differ — the only real transfers. */
  crossProvider: { applied: number; total: number; rate: number };
  /**
   * Cross-provider pairs that applied the fact *and* returned it as clean
   * prose. Null for runs recorded before the transfer harness stored the
   * answer text: the weaker `applied` figure cannot be upgraded after the
   * fact, so it is reported as unknown rather than assumed.
   */
  crossProviderClean: { applied: number; total: number; rate: number } | null;
  /** Same provider both sides. Reported separately, never pooled in. */
  selfTransfer: { applied: number; total: number };
  skipped: number;
  extractionsOk: number;
  extractionsTotal: number;
  extractionsRequiringApproval: number;
}

export function correctedTransfer(
  transfer: {
    transfers: Array<{
      extractor: string;
      answerer: string;
      status: string;
      applied: boolean | null;
      appliedCleanly?: boolean | null;
    }>;
    extractions: Array<{ status: string; requiredApproval: boolean }>;
  } | null,
): TransferSummary | null {
  if (!transfer) return null;

  const usable = transfer.transfers.filter((result) => result.status === "ok");
  const cross = usable.filter((result) => result.extractor !== result.answerer);
  const self = usable.filter((result) => result.extractor === result.answerer);

  // Only runs from the instrumented harness can report the clean figure.
  const cleanRecorded = cross.every((result) => result.appliedCleanly !== undefined);
  const cleanApplied = cross.filter((result) => result.appliedCleanly === true).length;

  return {
    crossProviderClean: cleanRecorded
      ? {
          applied: cleanApplied,
          total: cross.length,
          rate: cross.length === 0 ? 0 : Number((cleanApplied / cross.length).toFixed(4)),
        }
      : null,
    crossProvider: {
      applied: cross.filter((result) => result.applied).length,
      total: cross.length,
      rate: cross.length === 0 ? 0 : Number((cross.filter((r) => r.applied).length / cross.length).toFixed(4)),
    },
    selfTransfer: { applied: self.filter((result) => result.applied).length, total: self.length },
    skipped: transfer.transfers.filter((result) => result.status !== "ok").length,
    extractionsOk: transfer.extractions.filter((entry) => entry.status === "extracted").length,
    extractionsTotal: transfer.extractions.length,
    extractionsRequiringApproval: transfer.extractions.filter((entry) => entry.requiredApproval).length,
  };
}
