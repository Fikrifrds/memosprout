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
  const forbidden = testCase.mustExclude.filter((phrase) => containsPhrase(answer, phrase));
  return { passed: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}
