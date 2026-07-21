/**
 * Lexical matching for wrong-pattern detection.
 *
 * Exact substring matching misses answers that paraphrase or reorder the
 * wrong pattern. This module normalizes both sides (case, punctuation,
 * whitespace) and adds a token-overlap fallback so reordered or lightly
 * rephrased wrong answers are still caught, while staying deterministic
 * and dependency-free.
 */

/** Lowercase, strip punctuation, collapse whitespace. Unicode-aware. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const TOKEN_OVERLAP_THRESHOLD = 0.8;
const MIN_SIGNIFICANT_TOKENS = 3;

/**
 * Tokens that carry meaning for overlap matching: 3+ characters, or any
 * token containing a digit — numbers ("12", "3") are usually the exact
 * fact a correction disputes, so they must never be dropped.
 */
export function isSignificantToken(token: string): boolean {
  return token.length >= 3 || /\p{N}/u.test(token);
}

/**
 * Sentence boundaries. The lookbehind keeps decimals intact: "0.58" has
 * no space after the dot, so it is never split into "0" and "58".
 */
const SENTENCE_BOUNDARY = /(?<=[.!?;])\s+|\n+/;

/** Token overlap between one sentence and an already-tokenized pattern. */
function segmentOverlap(segment: string, patternTokens: string[]): number {
  const segmentTokens = new Set(normalizeText(segment).split(" "));

  // Numeric tokens are the disputed fact ("3 days" vs "5 days") — every
  // one must appear, otherwise the sentence is likely the corrected
  // version. Scoped to this sentence so that a number belonging to some
  // other fact in the answer cannot stand in for the disputed one.
  const numericTokens = patternTokens.filter((token) => /\p{N}/u.test(token));
  if (!numericTokens.every((token) => segmentTokens.has(token))) return 0;

  const hits = patternTokens.filter((token) => segmentTokens.has(token)).length;
  const ratio = hits / patternTokens.length;
  return ratio >= TOKEN_OVERLAP_THRESHOLD ? ratio : 0;
}

/**
 * How strongly does `answer` assert the known-wrong `pattern`? Returns 0
 * for no match, otherwise the share of the pattern the answer carries —
 * 1 for a verbatim hit.
 *
 * 1. Normalized substring — catches case/punctuation/whitespace variants.
 * 2. Token overlap, evaluated one sentence at a time — catches reordered
 *    phrasing when the pattern has at least 3 significant tokens
 *    (length >= 3) and >= 80% of them appear in a single sentence. Short
 *    patterns skip this path to avoid false blocks.
 *
 * Overlap is per sentence rather than over the whole answer because a
 * multi-fact answer otherwise pools tokens from unrelated statements: an
 * answer saying "3 approvers" and "probation period of 6 months" would
 * satisfy the pattern "probation period of 3 months" using a "3" that
 * belongs to a different fact, and a correct answer would be blocked.
 */
export function wrongPatternMatchScore(answer: string, pattern: string): number {
  const normalizedPattern = normalizeText(pattern);
  if (!normalizedPattern) return 0;

  // Word-boundary substring: " 12 days " must not match inside "112 days".
  if (` ${normalizeText(answer)} `.includes(` ${normalizedPattern} `)) return 1;

  const patternTokens = normalizedPattern.split(" ").filter(isSignificantToken);
  if (patternTokens.length < MIN_SIGNIFICANT_TOKENS) return 0;

  return answer
    .split(SENTENCE_BOUNDARY)
    .reduce((best, segment) => Math.max(best, segmentOverlap(segment, patternTokens)), 0);
}

/** Does `answer` contain the known-wrong `pattern`? */
export function matchesWrongPattern(answer: string, pattern: string): boolean {
  return wrongPatternMatchScore(answer, pattern) > 0;
}
