/**
 * Paired baseline/protected runner for the knowledge-drift benchmark.
 *
 * Both conditions see exactly the same question and the same (stale)
 * handbook snippet. The only difference is that the protected condition
 * injects `ms.context()` into the system prompt and passes the answer
 * through `ms.check()` before returning it. Any accuracy gap is therefore
 * attributable to MemoSprout and nothing else.
 */
import { MemoSprout } from "@/lib/index";

import { benchmarkDomain, distractorCorrections, type DriftCase } from "@/lib/eval/knowledge-drift/dataset";
import { gradeAnswer, type GradeResult } from "@/lib/eval/knowledge-drift/oracle";

/** The model under test. Kept abstract so tests can run without an LLM. */
export type AnswerModel = (prompt: { system: string; user: string }) => Promise<string>;

const systemPrompt = [
  "You are the Calyx Freight internal assistant.",
  "Answer strictly from the material you are given. Do not invent policy.",
  "Answer in one or two sentences, stating the specific value.",
].join(" ");

function buildPrompt(testCase: DriftCase, corrections: string) {
  return {
    system: corrections ? `${systemPrompt}\n\n${corrections}` : systemPrompt,
    user: `Handbook context:\n${testCase.kbSnippet}\n\nQuestion: ${testCase.question}`,
  };
}

export interface CaseResult {
  caseId: string;
  kind: DriftCase["kind"];
  baseline: { answer: string; grade: GradeResult };
  protected: {
    /** The model's own answer, before `check()` had a say. */
    modelAnswer: string;
    /** What the pipeline would actually return to the user. */
    answer: string;
    grade: GradeResult;
    gradeBeforeGate: GradeResult;
    blocked: boolean;
    /** Correction ids that `context()` injected for this question. */
    servedCorrectionIds: string[];
    /** The correction this case needs, when it has one. */
    expectedCorrectionId: string | null;
  };
}

export interface BenchmarkReport {
  createdAt: string;
  model: string;
  totals: {
    cases: number;
    driftCases: number;
    controlCases: number;
    storeSize: number;
  };
  drift: {
    baselinePassed: number;
    protectedPassedBeforeGate: number;
    protectedPassed: number;
    /** Protected minus baseline accuracy, in percentage points. */
    liftPoints: number;
    /** Cases the correction was needed for and `context()` actually served. */
    retrievalRecall: number;
    /** Share of served corrections that were the needed one. */
    retrievalPrecision: number;
  };
  control: {
    baselinePassed: number;
    protectedPassed: number;
    /** Control answers `check()` blocked. Every one of these is a bug. */
    falseBlocks: number;
    /** Control questions whose prompt received one or more irrelevant corrections. */
    queriesWithCorrections: number;
    /** Total irrelevant corrections injected across control questions. */
    correctionsServed: number;
    retrievalContaminationRate: number;
  };
  gate: {
    blocksTriggered: number;
    /** Wrong pre-gate answers made correct by replacement. */
    trueSaves: number;
    /** Correct pre-gate answers replaced by another correct answer. */
    redundantBlocks: number;
  };
  /**
   * Answers the model got right that `check()` blocked and replaced with
   * something wrong. Distinct from a regression: the correction pipeline
   * had the right answer in hand and threw it away.
   */
  harmfulBlocks: string[];
  /** Cases the baseline got right and the protected pipeline got wrong. */
  regressions: string[];
  cases: CaseResult[];
}

/**
 * Load every correction the run needs: one per drift case, plus the
 * distractors that force retrieval to discriminate.
 */
export async function seedStore(
  memosprout: MemoSprout,
  cases: DriftCase[],
): Promise<Map<string, string>> {
  const expected = new Map<string, string>();

  for (const testCase of cases) {
    if (!testCase.correction) continue;
    const record = await memosprout.correct({
      wrong: testCase.correction.wrong,
      correct: testCase.correction.correct,
      domain: benchmarkDomain,
      keywords: testCase.correction.keywords,
      source: testCase.correction.source,
      role: "admin",
    });
    expected.set(testCase.id, record.correctionId);
  }

  for (const distractor of distractorCorrections) {
    await memosprout.correct({
      wrong: distractor.wrong,
      correct: distractor.correct,
      domain: benchmarkDomain,
      keywords: distractor.keywords,
      source: distractor.source,
      role: "admin",
    });
  }

  return expected;
}

async function runCase(
  memosprout: MemoSprout,
  answer: AnswerModel,
  testCase: DriftCase,
  expectedCorrectionId: string | null,
): Promise<CaseResult> {
  const baselineAnswer = await answer(buildPrompt(testCase, ""));

  const { context, corrections } = await memosprout.context(testCase.question, benchmarkDomain);
  const modelAnswer = await answer(buildPrompt(testCase, context));
  const check = await memosprout.check(modelAnswer, benchmarkDomain);
  const finalAnswer = check.ok ? modelAnswer : check.corrections[0]!.correct;

  return {
    caseId: testCase.id,
    kind: testCase.kind,
    baseline: { answer: baselineAnswer, grade: gradeAnswer(testCase, baselineAnswer) },
    protected: {
      modelAnswer,
      answer: finalAnswer,
      grade: gradeAnswer(testCase, finalAnswer),
      gradeBeforeGate: gradeAnswer(testCase, modelAnswer),
      blocked: !check.ok,
      servedCorrectionIds: corrections.map((correction) => correction.correctionId),
      expectedCorrectionId,
    },
  };
}

export async function runKnowledgeDriftBenchmark(options: {
  memosprout: MemoSprout;
  answer: AnswerModel;
  cases: DriftCase[];
  model?: string;
  onCaseComplete?: (result: CaseResult) => void;
}): Promise<BenchmarkReport> {
  const { memosprout, answer, cases } = options;
  const expected = await seedStore(memosprout, cases);

  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const result = await runCase(memosprout, answer, testCase, expected.get(testCase.id) ?? null);
    results.push(result);
    options.onCaseComplete?.(result);
  }

  return summarize(results, {
    model: options.model ?? "unknown",
    storeSize: expected.size + distractorCorrections.length,
  });
}

export function summarize(
  results: CaseResult[],
  meta: { model: string; storeSize: number },
): BenchmarkReport {
  const drift = results.filter((result) => result.kind === "drift");
  const control = results.filter((result) => result.kind === "control");

  const count = (subset: CaseResult[], predicate: (result: CaseResult) => boolean) =>
    subset.filter(predicate).length;

  const driftBaselinePassed = count(drift, (result) => result.baseline.grade.passed);
  const driftProtectedPassed = count(drift, (result) => result.protected.grade.passed);

  const retrieved = drift.filter(
    (result) =>
      result.protected.expectedCorrectionId !== null &&
      result.protected.servedCorrectionIds.includes(result.protected.expectedCorrectionId),
  ).length;

  const precisionSamples = drift
    .filter((result) => result.protected.servedCorrectionIds.length > 0)
    .map((result) =>
      result.protected.expectedCorrectionId !== null &&
      result.protected.servedCorrectionIds.includes(result.protected.expectedCorrectionId)
        ? 1 / result.protected.servedCorrectionIds.length
        : 0,
    );

  const ratio = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));

  return {
    createdAt: new Date().toISOString(),
    model: meta.model,
    totals: {
      cases: results.length,
      driftCases: drift.length,
      controlCases: control.length,
      storeSize: meta.storeSize,
    },
    drift: {
      baselinePassed: driftBaselinePassed,
      protectedPassedBeforeGate: count(drift, (result) => result.protected.gradeBeforeGate.passed),
      protectedPassed: driftProtectedPassed,
      liftPoints: Number(
        (ratio(driftProtectedPassed, drift.length) * 100 -
          ratio(driftBaselinePassed, drift.length) * 100).toFixed(1),
      ),
      retrievalRecall: ratio(retrieved, drift.length),
      retrievalPrecision: ratio(
        precisionSamples.reduce((sum, value) => sum + value, 0),
        precisionSamples.length,
      ),
    },
    control: {
      baselinePassed: count(control, (result) => result.baseline.grade.passed),
      protectedPassed: count(control, (result) => result.protected.grade.passed),
      falseBlocks: count(control, (result) => result.protected.blocked),
      queriesWithCorrections: count(
        control,
        (result) => result.protected.servedCorrectionIds.length > 0,
      ),
      correctionsServed: control.reduce(
        (sum, result) => sum + result.protected.servedCorrectionIds.length,
        0,
      ),
      retrievalContaminationRate: ratio(
        count(control, (result) => result.protected.servedCorrectionIds.length > 0),
        control.length,
      ),
    },
    gate: {
      blocksTriggered: count(results, (result) => result.protected.blocked),
      trueSaves: count(
        results,
        (result) =>
          result.protected.blocked &&
          !result.protected.gradeBeforeGate.passed &&
          result.protected.grade.passed,
      ),
      redundantBlocks: count(
        results,
        (result) =>
          result.protected.blocked &&
          result.protected.gradeBeforeGate.passed &&
          result.protected.grade.passed,
      ),
    },
    harmfulBlocks: results
      .filter(
        (result) => result.protected.gradeBeforeGate.passed && !result.protected.grade.passed,
      )
      .map((result) => result.caseId),
    regressions: results
      .filter((result) => result.baseline.grade.passed && !result.protected.grade.passed)
      .map((result) => result.caseId),
    cases: results,
  };
}
