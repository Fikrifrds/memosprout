/**
 * Deterministic grading for the knowledge-drift benchmark.
 *
 * The oracle is a fixed rule, not a model. An LLM judge would add its own
 * error bar to a measurement whose whole purpose is to be believed, and
 * the repository rule against sharing a model between generator and
 * oracle would make a judge awkward to source anyway. Every case here
 * turns on one concrete fact, so phrase matching is enough.
 */
import { normalizeText } from "@/lib/correction/matching";

import type { DriftCase } from "@/lib/eval/knowledge-drift/dataset";

/**
 * Does `answer` contain `phrase`, ignoring case, punctuation, and
 * spacing? Matching is on word boundaries so "12 days" does not match
 * inside "112 days".
 */
export function containsPhrase(answer: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return ` ${normalizeText(answer)} `.includes(` ${normalizedPhrase} `);
}

/**
 * Words that turn a following phrase into a contrast rather than a claim:
 * "16 weeks, not the 8 weeks stated in the older version".
 */
const CONTRAST_CUES = new Set([
  "not",
  "instead",
  "rather",
  "previously",
  "formerly",
  "outdated",
  "superseded",
  "obsolete",
  "old",
  "older",
  "earlier",
  "stale",
  "incorrect",
  "wrong",
  "was",
  "were",
  "replaced",
  "replaces",
  "supersedes",
  "longer",
]);

/** How far back a contrast cue can sit and still govern the phrase. */
const CONTRAST_WINDOW = 6;

/**
 * Does `answer` *assert* `phrase`, as opposed to naming it to reject it?
 *
 * A model that answers "16 weeks, not the 8 weeks in the older version"
 * has the fact right, and grading it as wrong would understate the
 * system under test. Every occurrence must be governed by a contrast cue
 * before the phrase counts as unasserted.
 */
export function assertsPhrase(answer: string, phrase: string): boolean {
  const phraseTokens = normalizeText(phrase).split(" ").filter(Boolean);
  if (phraseTokens.length === 0) return false;

  const answerTokens = normalizeText(answer).split(" ").filter(Boolean);
  let asserted = false;

  for (let index = 0; index + phraseTokens.length <= answerTokens.length; index += 1) {
    const isOccurrence = phraseTokens.every((token, offset) => answerTokens[index + offset] === token);
    if (!isOccurrence) continue;

    const window = answerTokens.slice(Math.max(0, index - CONTRAST_WINDOW), index);
    if (!window.some((token) => CONTRAST_CUES.has(token))) asserted = true;
  }

  return asserted;
}

/** `"a|b"` passes when either alternative is present. */
function containsAnyAlternative(answer: string, spec: string): boolean {
  return spec.split("|").some((alternative) => containsPhrase(answer, alternative));
}

export interface GradeResult {
  passed: boolean;
  /** `mustInclude` entries that no alternative satisfied. */
  missing: string[];
  /** `mustExclude` entries the answer contained anyway. */
  forbidden: string[];
}

export function gradeAnswer(testCase: DriftCase, answer: string): GradeResult {
  const missing = testCase.mustInclude.filter((spec) => !containsAnyAlternative(answer, spec));
  const forbidden = testCase.mustExclude.filter((phrase) => assertsPhrase(answer, phrase));
  return { passed: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}
