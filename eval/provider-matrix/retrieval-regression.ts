/**
 * Retrieval regression gate.
 *
 *   pnpm tsx eval/provider-matrix/retrieval-regression.ts
 *
 * Offline and free. Exists because retrieval is the binding constraint on
 * end-to-end accuracy and nothing was watching it: in the live matrix every
 * provider was correct on essentially everything it retrieved
 * (21/21 on three of them) and wrong on everything it did not (0/6). So a
 * change that trades recall for precision trades away answers, and until
 * now that trade could happen silently between paid runs.
 *
 * The gate holds two lines at once, because optimising either one alone is
 * how retrieval gets worse:
 *
 *   - recall must not fall below the recorded pre-fix level
 *   - precision and control-serve must not fall below it either
 *
 * `RED` below marks cases that fail today. They are recorded, not
 * tolerated: the gate fails while any of them is unresolved.
 */
import { measureRetrieval, preFixBaseline } from "@/eval/provider-matrix/retrieval-check";

/**
 * Cases the lexical matcher can reach: the question shares vocabulary with
 * the trigger, allowing for inflection. These must retrieve from a
 * naturally phrased question, and a regression here is a hard failure.
 */
const MUST_RETRIEVE = [
  "h-shift-length",
  "h-onboarding-multifact",
  "b-settlement-window",
  "b-dispute-fee",
  "b-payout-multifact",
  "s-sla-response",
  "s-deleted-ticket-retention",
  "s-plan-multifact",
];

/**
 * The synonym gap: no vocabulary is shared with the trigger at all, so no
 * lexical rule can bridge it. Recorded as an open capability limit rather
 * than a failing test, because a failing test invites the wrong fix —
 * aliasing the question's own word into the fixture, which closes the
 * measurement instead of the gap.
 *
 * These may only turn green through a matcher that can actually relate
 * unrelated words. `verify.ts` enforces that they stay honest by rejecting
 * any trigger that appears verbatim in the question.
 */
const KNOWN_SYNONYM_GAP: Record<string, string> = {
  "h-workwear-allowance":
    'question says "workwear", trigger is "uniform allowance" — no shared token, ' +
    "needs semantic retrieval",
};

const outcome = await measureRetrieval();
const failures: string[] = [];

for (const caseId of MUST_RETRIEVE) {
  if (outcome.missedCases.includes(caseId)) {
    failures.push(`${caseId}: not retrieved — regression on a lexically reachable case`);
  }
}

// A case leaving the acknowledged gap without a matcher change means the
// dataset was edited, not the product.
for (const caseId of Object.keys(KNOWN_SYNONYM_GAP)) {
  if (!outcome.missedCases.includes(caseId)) {
    failures.push(
      `${caseId}: now retrieves, but it is recorded as an unsolved synonym gap. ` +
        "If the matcher genuinely gained semantic retrieval, move it into " +
        "MUST_RETRIEVE. If a trigger alias was added to the fixture instead, " +
        "revert it — verify.ts rejects that shortcut.",
    );
  }
}

// Any miss outside both lists is unaccounted for.
for (const caseId of outcome.missedCases) {
  if (!MUST_RETRIEVE.includes(caseId) && !(caseId in KNOWN_SYNONYM_GAP)) {
    failures.push(`${caseId}: missed, and not recorded in either list`);
  }
}

// A metric may not be bought with another. Both directions are guarded.
if (outcome.recall < preFixBaseline.recall - 0.001) {
  failures.push(
    `recall regressed: ${(outcome.recall * 100).toFixed(1)}% < ` +
      `${(preFixBaseline.recall * 100).toFixed(1)}% recorded before the retrieval rework`,
  );
}
if (outcome.microPrecision < preFixBaseline.microPrecision - 0.001) {
  failures.push(
    `precision regressed: ${(outcome.microPrecision * 100).toFixed(1)}% < ` +
      `${(preFixBaseline.microPrecision * 100).toFixed(1)}%`,
  );
}
if (outcome.controlServeRate > preFixBaseline.controlServeRate + 0.001) {
  failures.push(
    `control contamination regressed: ${(outcome.controlServeRate * 100).toFixed(1)}% > ` +
      `${(preFixBaseline.controlServeRate * 100).toFixed(1)}%`,
  );
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const reachableMissed = MUST_RETRIEVE.filter((id) => outcome.missedCases.includes(id));
console.log(
  `recall ${pct(outcome.recall)} | precision ${pct(outcome.microPrecision)} ` +
    `(${outcome.microRelevant}/${outcome.microRetrieved}) | control serve ${pct(outcome.controlServeRate)}`,
);
console.log(
  `  lexically reachable: ${MUST_RETRIEVE.length - reachableMissed.length}/${MUST_RETRIEVE.length}` +
    `   open synonym gap: ${Object.keys(KNOWN_SYNONYM_GAP).length}`,
);
for (const [caseId, reason] of Object.entries(KNOWN_SYNONYM_GAP)) {
  console.log(`  open: ${caseId} — ${reason}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} retrieval failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nEvery lexically reachable correction case must retrieve from a natural question.\n" +
      "Precision gains that cost recall cost answers: the live matrix found\n" +
      "0/6 correct whenever retrieval missed.",
  );
  process.exit(1);
}
console.log("Retrieval holds on every lexically reachable case; the synonym gap remains open.");
