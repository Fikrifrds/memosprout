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

// Function words inflate overlap without identifying the claim. Keeping
// "the" in a five-token pattern, for example, makes a corrected statement
// that changes only "quarterly" to "monthly" look like an 80% match.
const OVERLAP_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "in", "is", "of", "on", "or", "that", "the", "to", "was",
  "were", "with",
]);

/**
 * Tokens that carry meaning for overlap matching: 3+ characters, or any
 * token containing a digit — numbers ("12", "3") are usually the exact
 * fact a correction disputes, so they must never be dropped.
 */
export function isSignificantToken(token: string): boolean {
  return /\p{N}/u.test(token) || (token.length >= 3 && !OVERLAP_STOP_WORDS.has(token));
}

/**
 * Sentence boundaries. The lookbehind keeps decimals intact: "0.58" has
 * no space after the dot, so it is never split into "0" and "58".
 */
const SENTENCE_BOUNDARY = /(?<=[.!?;])\s+|\n+/;

const NEGATION_CUES = new Set([
  "incorrect", "never", "no", "not", "obsolete", "outdated", "stale", "wrong",
]);
const NEGATION_WINDOW = 4;

/** True when every occurrence of a token is governed by a nearby negation. */
function tokenIsOnlyNegated(segmentTokens: string[], token: string): boolean {
  const occurrences: number[] = [];
  for (let index = 0; index < segmentTokens.length; index += 1) {
    if (segmentTokens[index] === token) occurrences.push(index);
  }
  return occurrences.length > 0 && occurrences.every((index) => {
    for (let cueIndex = Math.max(0, index - NEGATION_WINDOW); cueIndex < index; cueIndex += 1) {
      const candidate = segmentTokens[cueIndex]!;
      if (!NEGATION_CUES.has(candidate)) continue;
      // "not only X, but also Y" emphasizes X rather than denying it.
      if (candidate === "not" && segmentTokens[cueIndex + 1] === "only") continue;
      return true;
    }
    return false;
  });
}

function segmentNegatesPatternToken(segmentTokens: string[], patternTokens: string[]): boolean {
  return patternTokens.some((token) => tokenIsOnlyNegated(segmentTokens, token));
}

/** Token overlap between one sentence and an already-tokenized pattern. */
function segmentOverlap(segment: string, patternTokens: string[]): number {
  const orderedSegmentTokens = normalizeText(segment).split(" ").filter(Boolean);
  const segmentTokens = new Set(orderedSegmentTokens);

  if (segmentNegatesPatternToken(orderedSegmentTokens, patternTokens)) return 0;

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

  const segments = answer.split(SENTENCE_BOUNDARY);
  const allPatternTokens = normalizedPattern.split(" ").filter(Boolean);

  // Word-boundary substring: " 12 days " must not match inside "112 days".
  // A verbatim phrase mentioned only to reject it is not an assertion.
  for (const segment of segments) {
    const normalizedSegment = normalizeText(segment);
    if (
      ` ${normalizedSegment} `.includes(` ${normalizedPattern} `) &&
      !segmentNegatesPatternToken(normalizedSegment.split(" "), allPatternTokens)
    ) {
      return 1;
    }
  }

  const patternTokens = normalizedPattern.split(" ").filter(isSignificantToken);
  if (patternTokens.length < MIN_SIGNIFICANT_TOKENS) return 0;

  return segments
    .reduce((best, segment) => Math.max(best, segmentOverlap(segment, patternTokens)), 0);
}

/** Does `answer` contain the known-wrong `pattern`? */
export function matchesWrongPattern(answer: string, pattern: string): boolean {
  return wrongPatternMatchScore(answer, pattern) > 0;
}
