/**
 * Regression checks for this lane's own logic.
 *
 *   pnpm tsx eval/provider-matrix/regression.ts
 *
 * Offline and deterministic. Guards the analysis rules that
 * MATRIX_REVISION_V2 corrected, so a later edit cannot silently
 * reintroduce a pooled precision, a pooled transfer figure, or
 * repetition-as-sample-size.
 */
import { correctedSummary, correctedTransfer, isShippable, itemRate, regrade } from "@/eval/provider-matrix/analysis";
import { grade, gradePasses, hasWrapperArtifact } from "@/eval/provider-matrix/runner";
import { matrixCases } from "@/eval/provider-matrix/tasks";
import type { ProviderRun } from "@/eval/provider-matrix/runner";

const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

// --- item-level rates must not inflate with repetitions ----------------
const threeItemsAllPass = itemRate([1, 1, 1], 9);
check(threeItemsAllPass.items === 3, "itemRate counts observations instead of items");
check(threeItemsAllPass.observations === 9, "itemRate lost the observation count");

// Repeating the same item does not narrow the interval the way extra
// independent items would. This is the whole point of clustering.
const nineObservationsOneItem = itemRate([0.5], 9);
const nineItemsHalfPass = itemRate([1, 0, 1, 0, 1, 0, 1, 0, 0.5], 9);
check(
  nineObservationsOneItem.ci95[1] - nineObservationsOneItem.ci95[0] === 0,
  "a single item should have no between-item variance",
);
check(
  nineItemsHalfPass.ci95[1] - nineItemsHalfPass.ci95[0] > 0,
  "nine distinct items should produce a non-degenerate interval",
);

// --- bootstrap determinism ---------------------------------------------
const sample = [1, 0.667, 0, 1, 0.333, 1, 1, 0, 1];
check(
  JSON.stringify(itemRate(sample, 27).ci95) === JSON.stringify(itemRate(sample, 27).ci95),
  "bootstrap interval is not reproducible",
);

// --- transfer must exclude self-pairs ----------------------------------
const transfer = correctedTransfer({
  transfers: [
    { extractor: "a", answerer: "a", status: "ok", applied: true },
    { extractor: "a", answerer: "b", status: "ok", applied: true },
    { extractor: "b", answerer: "a", status: "ok", applied: false },
    { extractor: "b", answerer: "c", status: "skipped_extraction_failed", applied: null },
  ],
  extractions: [{ status: "extracted", requiredApproval: true }],
});
check(transfer?.crossProvider.total === 2, "self-pairs leaked into the cross-provider denominator");
check(transfer?.crossProvider.applied === 1, "cross-provider applied count is wrong");
check(transfer?.selfTransfer.total === 1, "self-transfers were not held out separately");
check(transfer?.skipped === 1, "skipped transfers were not counted");

// --- the oracle defects this revision fixed must stay fixed ------------
const currency = matrixCases.find((testCase) => testCase.id === "b-currency-control")!;
check(
  grade(currency, "Northmark Payments settles in euros by default.").adherence,
  'oracle rejects "euros" again',
);
const csv = matrixCases.find((testCase) => testCase.id === "s-csv-export-control")!;
check(
  grade(csv, "A single CSV export can contain up to 5,000 tickets.").adherence,
  'oracle rejects a thousands separator ("5,000") again',
);

// --- re-grading must use the current oracle, not stored grades ---------
const stale: ProviderRun = {
  provider: { id: "x/y", provider: "x", model: "y" },
  startedAt: "",
  finishedAt: "",
  storeSize: 0,
  repetitions: [
    {
      caseId: "b-currency-control",
      domain: "billing",
      kind: "control",
      difficulty: "easy",
      repetition: 1,
      status: "ok",
      armErrors: { baseline: null, injection: null, gate: "not_attempted" },
      errorCategory: null,
      baseline: {
        answer: "Northmark Payments settles in euros by default.",
        // A deliberately wrong stored grade, as the first run produced.
        grade: {
          cleanOutput: true,
          adherence: false,
          staleRejected: true,
          contaminated: false,
          multifactPreserved: null,
          missing: ["euro|eur"],
          forbidden: [],
          leaked: [],
        },
        latencyMs: 1,
        promptChars: 1,
      },
      injection: null,
      gate: null,
      retrieval: null,
    },
  ],
};
check(
  regrade(stale).repetitions[0]!.baseline!.grade.adherence,
  "regrade() trusted the stored grade instead of recomputing it",
);

// --- provider wrappers are not clean answers ---------------------------
const wrapped = '{"name":"final","content":"Northmark Payments settles in euros by default."}';
const wrappedGrade = grade(currency, wrapped);
check(hasWrapperArtifact(wrapped), "TogetherAI-style envelope was not detected");
check(wrappedGrade.adherence, "wrapper regression fixture no longer contains the right fact");
check(!wrappedGrade.cleanOutput, "wrapper artifact was graded as clean output");
check(!gradePasses(wrappedGrade), "wrapper artifact was counted as a correct answer");

// --- per-arm independence ----------------------------------------------
const partial: ProviderRun = {
  ...stale,
  repetitions: [{
    ...stale.repetitions[0]!,
    status: "partial",
    armErrors: { baseline: null, injection: "timeout", gate: "not_attempted" },
    injection: null,
  }],
};
check(
  regrade(partial).repetitions[0]!.baseline !== null,
  "a partial repetition lost its surviving arm",
);

const partialSummary = correctedSummary(partial);
check(partialSummary.completeness.observedPerArm.baseline === 1, "surviving baseline was not counted");
check(partialSummary.completeness.observedPerArm.injection === 0, "missing injection was counted");
check(partialSummary.completeness.errorsPerArm.injection.timeout === 1, "partial-arm error was hidden");
check(
  partialSummary.completeness.errorsPerArm.gate.not_attempted === 1,
  "dependent gate non-attempt was hidden",
);

const failedCallsWithRetrieval: ProviderRun = {
  ...stale,
  repetitions: [{
    ...stale.repetitions[0]!,
    status: "error",
    armErrors: { baseline: "timeout", injection: "server_error", gate: "not_attempted" },
    baseline: null,
    injection: null,
    gate: null,
    retrieval: { servedIds: ["irrelevant-control-correction"], expectedId: null, contextChars: 42 },
  }],
};
const failedSummary = correctedSummary(failedCallsWithRetrieval);
check(failedSummary.retrieval.microRetrieved === 1, "provider failures discarded observed retrieval");
check(failedSummary.retrieval.servedOnControls === 1, "provider failures hid control contamination risk");
check(failedSummary.overhead.contextCharsMean === 42, "missing arms biased retrieval overhead to zero");

const metered: ProviderRun = {
  ...stale,
  repetitions: [{
    ...stale.repetitions[0]!,
    baseline: {
      ...stale.repetitions[0]!.baseline!,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cachedInputTokens: 40,
        cacheCreationInputTokens: null,
      },
    },
  }],
};
const meteredSummary = correctedSummary(metered);
check(meteredSummary.overhead.tokensAvailable, "provider usage was discarded by analysis");
check(
  meteredSummary.overhead.tokenUsage.baseline.totalTokens === 120 &&
    meteredSummary.overhead.tokenUsage.baseline.samples === 1,
  "provider usage was aggregated incorrectly",
);


// --- transfer must distinguish fact application from a shippable answer ---
const legacyTransfer = correctedTransfer({
  transfers: [{ extractor: "a", answerer: "b", status: "ok", applied: true }],
  extractions: [{ status: "extracted", requiredApproval: true }],
});
check(
  legacyTransfer?.crossProviderClean === null,
  "a run without stored answer text must report the clean figure as unknown, not assume it",
);

const instrumentedTransfer = correctedTransfer({
  transfers: [
    { extractor: "a", answerer: "b", status: "ok", applied: true, appliedCleanly: true },
    // Fact present, but wrapped in an envelope: applied, not shippable.
    { extractor: "a", answerer: "c", status: "ok", applied: true, appliedCleanly: false },
  ],
  extractions: [{ status: "extracted", requiredApproval: true }],
});
check(
  instrumentedTransfer?.crossProvider.applied === 2 &&
    instrumentedTransfer?.crossProviderClean?.applied === 1,
  "clean-output transfer must be counted separately from fact application",
);


// --- a repair that still fails check() is never a shippable gate output ---
const shippableCase = (repairPassed: boolean | null | undefined, blocked: boolean) => ({
  caseId: "b-payout-multifact",
  domain: "billing" as const,
  kind: "multifact" as const,
  difficulty: "hard" as const,
  repetition: 1,
  status: "ok" as const,
  armErrors: { baseline: null, injection: null, gate: null },
  errorCategory: null,
  baseline: null,
  injection: null,
  gate: {
    answer: "Payouts are sent daily, and the minimum payout amount is EUR 50.",
    grade: {
      cleanOutput: true, adherence: true, staleRejected: true, contaminated: false,
      multifactPreserved: true, missing: [], forbidden: [], leaked: [],
    },
    latencyMs: 1,
    promptChars: 1,
    usage: null,
    blocked,
    ...(repairPassed === undefined ? {} : { repairPassed }),
    harmful: false,
  },
  retrieval: null,
});

check(
  !isShippable(shippableCase(false, true) as never, "gate"),
  "a repair that failed the re-check was counted as shippable",
);
check(
  isShippable(shippableCase(true, true) as never, "gate"),
  "a repair that passed the re-check must count as shippable",
);
check(
  isShippable(shippableCase(null, false) as never, "gate"),
  "an unblocked answer needs no repair to be shippable",
);
// History is analysed as it happened: legacy rows carry no repair field.
check(
  isShippable(shippableCase(undefined, true) as never, "gate"),
  "legacy rows without a repair field must keep their original scoring",
);

const failedRepair = shippableCase(false, true);
const failedRepairRun: ProviderRun = {
  provider: { id: "x/y", provider: "x", model: "y" },
  startedAt: "",
  finishedAt: "",
  storeSize: 0,
  repetitions: [{
    ...failedRepair,
    injection: {
      answer: failedRepair.gate.answer,
      grade: failedRepair.gate.grade,
      latencyMs: 1,
      promptChars: 1,
      usage: null,
    },
  }],
};
const failedRepairSummary = correctedSummary(failedRepairRun);
check(
  failedRepairSummary.arms.gate.correctionCases.rate === 0,
  "regrade counted an unshippable repair as a correct gate output",
);
check(
  failedRepairSummary.gate.harmfulBlocks === 1,
  "regrade erased the harm caused by turning a passing answer into an unshippable repair",
);

if (failures.length > 0) {
  console.error(`${failures.length} regression failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Analysis regression checks pass.");
