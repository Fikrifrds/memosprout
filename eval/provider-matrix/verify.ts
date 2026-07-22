/**
 * Offline invariant check. Run before spending a live matrix on a task set
 * that cannot measure what it claims to.
 *
 *   pnpm tsx eval/provider-matrix/verify.ts
 *
 * Lives outside the vitest include patterns on purpose: this lane must not
 * change the shared test suite.
 */
import { assertsPhrase } from "@/lib/eval/knowledge-drift/oracle";
import { normalizeText } from "@/lib/correction/matching";
import { grade } from "@/eval/provider-matrix/runner";
import {
  distractorCorrections,
  matrixCaseSchema,
  matrixCases,
  transferCases,
} from "@/eval/provider-matrix/tasks";

const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

for (const testCase of matrixCases) {
  const parsed = matrixCaseSchema.safeParse(testCase);
  check(parsed.success, `${testCase.id}: schema — ${parsed.error?.issues[0]?.message ?? ""}`);
}

const ids = matrixCases.map((testCase) => testCase.id);
check(new Set(ids).size === ids.length, "duplicate case ids");

for (const testCase of matrixCases) {
  if (testCase.correction) {
    // The stale snippet must actually assert the fact under dispute,
    // otherwise the baseline could pass by accident and the lift is fiction.
    check(
      testCase.mustExclude.some((phrase) => assertsPhrase(testCase.kbSnippet, phrase)),
      `${testCase.id}: snippet does not assert the stale fact`,
    );
    // ...and must not already contain the corrected one. On a multifact
    // case only mustInclude[0] is the drifted fact; the remaining entries
    // are the stable facts, which the snippet is supposed to supply.
    const driftedSpecs = testCase.kind === "multifact"
      ? testCase.mustInclude.slice(0, 1)
      : testCase.mustInclude;
    check(
      !driftedSpecs.some((spec) =>
        spec.split("|").some((alternative) => assertsPhrase(testCase.kbSnippet, alternative)),
      ),
      `${testCase.id}: snippet leaks the corrected fact`,
    );
    if (testCase.kind === "multifact") {
      // The stable facts must be present, or the case cannot show that
      // they survived.
      check(
        testCase.mustInclude
          .slice(1)
          .every((spec) =>
            spec.split("|").some((alternative) => assertsPhrase(testCase.kbSnippet, alternative)),
          ),
        `${testCase.id}: snippet is missing the stable fact it must preserve`,
      );
    }
    // The correction text has to be able to satisfy its own oracle, or the
    // ceiling sits below 100% for reasons unrelated to the system.
    const correctionGrade = grade(testCase, testCase.correction.correct);
    check(
      correctionGrade.staleRejected,
      `${testCase.id}: correction text trips its own mustExclude`,
    );
  } else {
    // A control snippet must answer its own question, so a passing
    // baseline is the expected outcome rather than luck.
    const snippetGrade = grade(testCase, testCase.kbSnippet);
    check(snippetGrade.adherence, `${testCase.id}: control snippet does not answer its question`);
    check(
      !snippetGrade.contaminated,
      `${testCase.id}: control snippet already contains a contamination phrase`,
    );
    check(
      testCase.contaminationPhrases.length > 0,
      `${testCase.id}: control case measures no contamination`,
    );
  }
}

// A `medium` case is defined as one whose question paraphrases the trigger
// away. If any trigger keyword appears verbatim in the question, the case
// has quietly become `easy` and no longer measures the gap it exists for.
//
// This guard exists because that is exactly what happened once: "workwear"
// was added to the uniform-allowance triggers, which turned the retrieval
// guard green without the matcher gaining any synonym ability. Closing a
// measurement is not the same as closing a gap.
for (const testCase of matrixCases) {
  if (testCase.difficulty !== "medium" || !testCase.correction) continue;
  const questionTokens = new Set(normalizeText(testCase.question).split(" "));
  for (const keyword of testCase.correction.keywords) {
    const normalized = normalizeText(keyword);
    const verbatim = normalized.includes(" ")
      ? ` ${normalizeText(testCase.question)} `.includes(` ${normalized} `)
      : questionTokens.has(normalized);
    check(
      !verbatim,
      `${testCase.id}: trigger "${keyword}" appears verbatim in a paraphrase case — ` +
        `the case no longer tests the synonym gap it documents`,
    );
  }
}

// Multifact cases need at least two required facts, or they measure nothing
// about preservation.
for (const testCase of matrixCases) {
  if (testCase.kind !== "multifact") continue;
  check(testCase.mustInclude.length >= 2, `${testCase.id}: multifact case has one required fact`);
}

for (const testCase of transferCases) {
  check(
    testCase.mustExclude.some((phrase) => assertsPhrase(testCase.kbSnippet, phrase)),
    `${testCase.id}: transfer snippet does not assert the stale fact`,
  );
}

const domains = new Set(matrixCases.map((testCase) => testCase.domain));
const difficulties = new Set(matrixCases.map((testCase) => testCase.difficulty));
const kinds = new Set(matrixCases.map((testCase) => testCase.kind));

console.log(
  `cases ${matrixCases.length} | domains ${[...domains].join(", ")} | ` +
    `difficulty ${[...difficulties].join(", ")} | kinds ${[...kinds].join(", ")} | ` +
    `distractors ${distractorCorrections.length} | transfer ${transferCases.length}`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} invariant failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("All invariants hold.");
