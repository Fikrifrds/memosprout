import { MemoSprout } from "@/lib/index";

import {
  benchmarkDomain,
  driftCases,
} from "@/lib/eval/knowledge-drift/dataset";
import {
  irrelevantQueries,
  postChangeHoldoutIrrelevantQueries,
  retrievalProbes,
} from "@/lib/eval/knowledge-drift/robustness";
import { seedStore } from "@/lib/eval/knowledge-drift/runner";

export interface RetrievalProbeResult {
  caseId: string;
  expectedCorrectionId: string;
  returnedCorrectionIds: string[];
  rank: number | null;
}

export interface RetrievalMetrics {
  queries: number;
  hits: number;
  recall: number;
  microPrecision: number;
  meanReciprocalRank: number;
  meanCorrectionsReturned: number;
  missedCaseIds: string[];
}

export interface DeterministicReadinessReport {
  storeSize: number;
  retrieval: {
    original: RetrievalMetrics;
    lexicalVariants: RetrievalMetrics;
    semanticVariantsDiagnostic: RetrievalMetrics;
    evidenceAugmentedSemanticVariants: RetrievalMetrics;
    irrelevantQueries: {
      queries: number;
      contaminatedQueries: number;
      contaminationRate: number;
      correctionsReturned: number;
      cases: Array<{ query: string; returnedCorrectionIds: string[] }>;
    };
    postChangeHoldoutIrrelevantQueries: {
      queries: number;
      contaminatedQueries: number;
      contaminationRate: number;
      correctionsReturned: number;
      cases: Array<{ query: string; returnedCorrectionIds: string[] }>;
    };
  };
  gate: {
    staleAnswers: number;
    staleAnswersBlocked: number;
    correctedAnswers: number;
    correctedAnswersAllowed: number;
    multiFactAnswers: number;
    multiFactAnswersAllowed: number;
    blockedCorrectedCaseIds: string[];
    blockedMultiFactCaseIds: string[];
  };
}

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));

function summarizeRetrieval(results: RetrievalProbeResult[]): RetrievalMetrics {
  const hits = results.filter((result) => result.rank !== null).length;
  const reciprocalRank = results.reduce(
    (sum, result) => sum + (result.rank === null ? 0 : 1 / result.rank),
    0,
  );
  const returned = results.reduce(
    (sum, result) => sum + result.returnedCorrectionIds.length,
    0,
  );
  return {
    queries: results.length,
    hits,
    recall: ratio(hits, results.length),
    microPrecision: ratio(hits, returned),
    meanReciprocalRank: Number((reciprocalRank / results.length).toFixed(4)),
    meanCorrectionsReturned: Number((returned / results.length).toFixed(2)),
    missedCaseIds: results
      .filter((result) => result.rank === null)
      .map((result) => result.caseId),
  };
}

async function probe(
  memosprout: MemoSprout,
  expected: Map<string, string>,
  queries: Array<{ caseId: string; query: string }>,
): Promise<RetrievalProbeResult[]> {
  const results: RetrievalProbeResult[] = [];
  for (const item of queries) {
    const expectedCorrectionId = expected.get(item.caseId);
    if (!expectedCorrectionId) {
      throw new Error(`No seeded correction for retrieval probe ${item.caseId}.`);
    }
    const context = await memosprout.context(item.query, benchmarkDomain);
    const returnedCorrectionIds = context.corrections.map(
      (correction) => correction.correctionId,
    );
    const index = returnedCorrectionIds.indexOf(expectedCorrectionId);
    results.push({
      caseId: item.caseId,
      expectedCorrectionId,
      returnedCorrectionIds,
      rank: index === -1 ? null : index + 1,
    });
  }
  return results;
}

/**
 * Reproducible, no-model release evaluation for retrieval and protection.
 * It complements the live paired benchmark: this catches regressions on
 * fresh wording, noise queries, corrected answers, and multi-fact answers.
 */
export async function runDeterministicReadinessEvaluation(
  memosprout: MemoSprout,
): Promise<DeterministicReadinessReport> {
  const expected = await seedStore(memosprout, driftCases);
  const drift = driftCases.filter((testCase) => testCase.kind === "drift");

  const original = await probe(
    memosprout,
    expected,
    drift.map((testCase) => ({ caseId: testCase.id, query: testCase.question })),
  );
  const lexicalVariants = await probe(
    memosprout,
    expected,
    retrievalProbes.map((item) => ({ caseId: item.caseId, query: item.lexical })),
  );
  const semanticVariants = await probe(
    memosprout,
    expected,
    retrievalProbes.map((item) => ({ caseId: item.caseId, query: item.semantic })),
  );
  const driftById = new Map(drift.map((testCase) => [testCase.id, testCase]));
  const evidenceAugmentedSemanticVariants = await probe(
    memosprout,
    expected,
    retrievalProbes.map((item) => {
      const testCase = driftById.get(item.caseId);
      if (!testCase) throw new Error(`No drift case for retrieval probe ${item.caseId}.`);
      return {
        caseId: item.caseId,
        query: `${item.semantic}\n\nRetrieved material:\n${testCase.kbSnippet}`,
      };
    }),
  );

  let contaminatedQueries = 0;
  let irrelevantCorrectionsReturned = 0;
  const irrelevantCases: Array<{ query: string; returnedCorrectionIds: string[] }> = [];
  for (const query of irrelevantQueries) {
    const result = await memosprout.context(query, benchmarkDomain);
    if (result.corrections.length > 0) contaminatedQueries++;
    irrelevantCorrectionsReturned += result.corrections.length;
    irrelevantCases.push({
      query,
      returnedCorrectionIds: result.corrections.map((correction) => correction.correctionId),
    });
  }

  let holdoutContaminatedQueries = 0;
  let holdoutCorrectionsReturned = 0;
  const holdoutCases: Array<{ query: string; returnedCorrectionIds: string[] }> = [];
  for (const query of postChangeHoldoutIrrelevantQueries) {
    const result = await memosprout.context(query, benchmarkDomain);
    if (result.corrections.length > 0) holdoutContaminatedQueries++;
    holdoutCorrectionsReturned += result.corrections.length;
    holdoutCases.push({
      query,
      returnedCorrectionIds: result.corrections.map((correction) => correction.correctionId),
    });
  }

  let staleAnswersBlocked = 0;
  let correctedAnswersAllowed = 0;
  let multiFactAnswersAllowed = 0;
  const blockedCorrectedCaseIds: string[] = [];
  const blockedMultiFactCaseIds: string[] = [];
  for (let index = 0; index < drift.length; index++) {
    const testCase = drift[index]!;
    const correction = testCase.correction!;
    if (!(await memosprout.check(testCase.kbSnippet, benchmarkDomain)).ok) {
      staleAnswersBlocked++;
    }
    if ((await memosprout.check(correction.correct, benchmarkDomain)).ok) {
      correctedAnswersAllowed++;
    } else {
      blockedCorrectedCaseIds.push(testCase.id);
    }

    const next = drift[(index + 1) % drift.length]!.correction!.correct;
    const multiFactAnswer = `${correction.correct}. ${next}.`;
    if ((await memosprout.check(multiFactAnswer, benchmarkDomain)).ok) {
      multiFactAnswersAllowed++;
    } else {
      blockedMultiFactCaseIds.push(testCase.id);
    }
  }

  return {
    storeSize: (await memosprout.list({ domain: benchmarkDomain })).length,
    retrieval: {
      original: summarizeRetrieval(original),
      lexicalVariants: summarizeRetrieval(lexicalVariants),
      semanticVariantsDiagnostic: summarizeRetrieval(semanticVariants),
      evidenceAugmentedSemanticVariants: summarizeRetrieval(
        evidenceAugmentedSemanticVariants,
      ),
      irrelevantQueries: {
        queries: irrelevantQueries.length,
        contaminatedQueries,
        contaminationRate: ratio(contaminatedQueries, irrelevantQueries.length),
        correctionsReturned: irrelevantCorrectionsReturned,
        cases: irrelevantCases,
      },
      postChangeHoldoutIrrelevantQueries: {
        queries: postChangeHoldoutIrrelevantQueries.length,
        contaminatedQueries: holdoutContaminatedQueries,
        contaminationRate: ratio(
          holdoutContaminatedQueries,
          postChangeHoldoutIrrelevantQueries.length,
        ),
        correctionsReturned: holdoutCorrectionsReturned,
        cases: holdoutCases,
      },
    },
    gate: {
      staleAnswers: drift.length,
      staleAnswersBlocked,
      correctedAnswers: drift.length,
      correctedAnswersAllowed,
      multiFactAnswers: drift.length,
      multiFactAnswersAllowed,
      blockedCorrectedCaseIds,
      blockedMultiFactCaseIds,
    },
  };
}

export function assertDeterministicReleaseThresholds(
  report: DeterministicReadinessReport,
): void {
  const failures: string[] = [];
  if (report.retrieval.original.recall < 1) {
    failures.push(`original-query recall ${report.retrieval.original.recall} < 1`);
  }
  if (report.retrieval.lexicalVariants.recall < 0.9) {
    failures.push(`lexical-variant recall ${report.retrieval.lexicalVariants.recall} < 0.9`);
  }
  if (report.retrieval.evidenceAugmentedSemanticVariants.recall < 0.95) {
    failures.push(
      `evidence-augmented semantic recall ${report.retrieval.evidenceAugmentedSemanticVariants.recall} < 0.95`,
    );
  }
  if (report.retrieval.irrelevantQueries.contaminationRate > 0.1) {
    failures.push(
      `irrelevant-query contamination ${report.retrieval.irrelevantQueries.contaminationRate} > 0.1`,
    );
  }
  if (report.retrieval.postChangeHoldoutIrrelevantQueries.contaminationRate > 0.1) {
    failures.push(
      `post-change holdout contamination ${report.retrieval.postChangeHoldoutIrrelevantQueries.contaminationRate} > 0.1`,
    );
  }
  if (report.gate.staleAnswersBlocked !== report.gate.staleAnswers) {
    failures.push("gate did not block every stale answer");
  }
  if (report.gate.correctedAnswersAllowed !== report.gate.correctedAnswers) {
    failures.push(
      `gate allowed ${report.gate.correctedAnswersAllowed}/${report.gate.correctedAnswers} corrected answers (${report.gate.blockedCorrectedCaseIds.join(", ")})`,
    );
  }
  if (report.gate.multiFactAnswersAllowed !== report.gate.multiFactAnswers) {
    failures.push(
      `gate allowed ${report.gate.multiFactAnswersAllowed}/${report.gate.multiFactAnswers} correct multi-fact answers (${report.gate.blockedMultiFactCaseIds.join(", ")})`,
    );
  }
  if (failures.length > 0) {
    throw new Error(`Deterministic release thresholds failed: ${failures.join("; ")}.`);
  }
}
