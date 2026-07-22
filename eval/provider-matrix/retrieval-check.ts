/**
 * Offline retrieval evaluation.
 *
 *   pnpm tsx eval/provider-matrix/retrieval-check.ts
 *
 * Retrieval is deterministic, so the metric that bounded the whole live
 * matrix — recall, and precision across correction *and* control cases —
 * can be measured for free, with no provider calls at all. This exists to
 * answer one question directly: did the retrieval rework move the numbers
 * the paid run said were the ceiling?
 *
 * Baseline to beat, from the 2026-07-22 pre-retrieval-fix run:
 *   item recall      78% (7 of 9 correction cases)
 *   micro precision  53.8% (21 relevant of 39 retrieved)
 *   control serve    50% (3 of 6 control questions pulled a correction)
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";

import { distractorCorrections, matrixCases } from "@/eval/provider-matrix/tasks";

/** The pre-fix figures this run is compared against. */
export const preFixBaseline = {
  recall: 7 / 9,
  microPrecision: 21 / 39,
  controlServeRate: 3 / 6,
  missedCases: ["h-workwear-allowance", "s-deleted-ticket-retention"],
};

export interface RetrievalOutcome {
  recall: number;
  microPrecision: number;
  microRelevant: number;
  microRetrieved: number;
  controlServeRate: number;
  missedCases: string[];
  contaminatedControls: Array<{ caseId: string; served: number }>;
}

export async function measureRetrieval(): Promise<RetrievalOutcome> {
  const directory = await mkdtemp(join(tmpdir(), "memosprout-retrieval-"));
  try {
    const memosprout = new MemoSprout(directory);
    const expected = new Map<string, string>();

    for (const testCase of matrixCases) {
      if (!testCase.correction) continue;
      const record = await memosprout.correct({
        wrong: testCase.correction.wrong,
        correct: testCase.correction.correct,
        domain: testCase.domain,
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
        domain: distractor.domain,
        keywords: distractor.keywords,
        source: distractor.source,
        role: "admin",
      });
    }

    let retrieved = 0;
    let relevant = 0;
    let controlsServed = 0;
    let controls = 0;
    let correctionCases = 0;
    const missedCases: string[] = [];
    const contaminatedControls: Array<{ caseId: string; served: number }> = [];

    for (const testCase of matrixCases) {
      const { corrections } = await memosprout.context(testCase.question, testCase.domain);
      retrieved += corrections.length;

      if (testCase.correction) {
        correctionCases += 1;
        const wanted = expected.get(testCase.id)!;
        if (corrections.some((correction) => correction.correctionId === wanted)) relevant += 1;
        else missedCases.push(testCase.id);
      } else {
        controls += 1;
        if (corrections.length > 0) {
          controlsServed += 1;
          contaminatedControls.push({ caseId: testCase.id, served: corrections.length });
        }
      }
    }

    return {
      recall: relevant / correctionCases,
      microPrecision: retrieved === 0 ? 0 : relevant / retrieved,
      microRelevant: relevant,
      microRetrieved: retrieved,
      controlServeRate: controlsServed / controls,
      missedCases,
      contaminatedControls,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("retrieval-check.ts")) {
  const outcome = await measureRetrieval();
  const line = (label: string, now: number, before: number) => {
    const delta = (now - before) * 100;
    const arrow = delta > 0.05 ? "+" : delta < -0.05 ? "" : " ";
    return `  ${label.padEnd(20)} ${(before * 100).toFixed(1)}%  ->  ${(now * 100).toFixed(1)}%   ${arrow}${delta.toFixed(1)}pp`;
  };

  console.log("Retrieval, offline — no provider calls\n");
  console.log(line("item recall", outcome.recall, preFixBaseline.recall));
  console.log(
    line("micro precision", outcome.microPrecision, preFixBaseline.microPrecision) +
      `   (${outcome.microRelevant}/${outcome.microRetrieved})`,
  );
  console.log(
    line("control serve rate", outcome.controlServeRate, preFixBaseline.controlServeRate) +
      "   lower is better",
  );

  console.log(
    `\n  still missed: ${outcome.missedCases.length === 0 ? "none" : outcome.missedCases.join(", ")}`,
  );
  console.log(
    `  was missed:   ${preFixBaseline.missedCases.join(", ")}`,
  );
  if (outcome.contaminatedControls.length > 0) {
    console.log("\n  corrections still served on control questions:");
    for (const entry of outcome.contaminatedControls) {
      console.log(`    ${entry.caseId} (${entry.served})`);
    }
  }
}
