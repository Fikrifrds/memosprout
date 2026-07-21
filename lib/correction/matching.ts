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
 * Does `answer` contain the known-wrong `pattern`?
 *
 * 1. Normalized substring — catches case/punctuation/whitespace variants.
 * 2. Token overlap — catches reordered phrasing when the pattern has at
 *    least 3 significant tokens (length >= 3) and >= 80% of them appear
 *    in the answer. Short patterns skip this path to avoid false blocks.
 */
export function matchesWrongPattern(answer: string, pattern: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  const normalizedPattern = normalizeText(pattern);
  if (!normalizedPattern) return false;

  // Word-boundary substring: " 12 days " must not match inside "112 days".
  if (` ${normalizedAnswer} `.includes(` ${normalizedPattern} `)) return true;

  const patternTokens = normalizedPattern.split(" ").filter(isSignificantToken);
  if (patternTokens.length < MIN_SIGNIFICANT_TOKENS) return false;

  const answerTokens = new Set(normalizedAnswer.split(" "));

  // Numeric tokens are the disputed fact ("3 days" vs "5 days") — every
  // one must appear, otherwise the answer is likely the corrected version.
  const numericTokens = patternTokens.filter((token) => /\p{N}/u.test(token));
  if (!numericTokens.every((token) => answerTokens.has(token))) return false;

  const hits = patternTokens.filter((token) => answerTokens.has(token)).length;
  return hits / patternTokens.length >= TOKEN_OVERLAP_THRESHOLD;
}
