/**
 * Trigger alias generation.
 *
 * Retrieval matches a question against the words configured on a
 * correction, so a correction filed under "uniform allowance" is invisible
 * to someone who asks about "workwear". Expecting whoever writes the
 * correction to guess every phrasing their users will type is not a
 * reasonable ask, and when the guess is wrong the failure is silent.
 *
 * This asks a model once, at write time, for the other words people use
 * for the same thing. The cost lands on the write, not on every query, and
 * no per-request latency is added to the read path.
 */
import { z } from "zod";

import { callLLM, extractJsonPayload, type LLMProviderConfig } from "@/lib/llm/provider";
import { normalizeText } from "@/lib/correction/matching";

export const aliasResultSchema = z
  .object({ aliases: z.array(z.string()).default([]) })
  .strict();

/**
 * Hard ceiling on generated aliases. Every alias is another chance to
 * retrieve the correction for a question it does not answer, so recall
 * bought here is paid for in precision. A short list keeps that trade
 * visible and bounded.
 */
export const MAX_GENERATED_ALIASES = 6;

const ALIAS_SYSTEM_PROMPT = `You expand the trigger vocabulary of a stored correction.

You are given a fact that was corrected and the words already configured to
find it. Return the OTHER words and short phrases a real user might type
when asking about that same fact.

Rules:
- Only terms that refer to the SAME thing. A near-neighbour that means
  something else will cause the wrong correction to be served.
- Prefer everyday wording over formal wording; the configured terms are
  usually already the formal ones.
- Short noun phrases only. No sentences, no questions.
- Do not repeat terms that are already configured.
- Do not include numbers, dates, amounts, or the corrected value itself.
- If nothing useful can be added, return an empty list.

Respond with JSON only:
{"aliases": ["term one", "term two"]}`;

export interface AliasRequest {
  wrong: string;
  correct: string;
  existingKeywords: string[];
}

/**
 * Returns aliases to add. Never throws: a correction is more valuable than
 * its trigger list is complete, so a failed or malformed call degrades to
 * "no aliases" and leaves the write intact.
 */
export async function generateAliases(
  config: LLMProviderConfig,
  request: AliasRequest,
): Promise<string[]> {
  let content: string;
  try {
    const response = await callLLM(config, [
      { role: "system", content: ALIAS_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Corrected fact: ${request.correct}\n` +
          `Previously stated (wrong): ${request.wrong}\n` +
          `Already configured: ${request.existingKeywords.join(", ") || "(none)"}`,
      },
    ]);
    content = response.content;
  } catch {
    return [];
  }

  const parsed = aliasResultSchema.safeParse(
    (() => {
      try {
        return JSON.parse(extractJsonPayload(content));
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) return [];

  const seen = new Set(request.existingKeywords.map((keyword) => normalizeText(keyword)));
  const aliases: string[] = [];

  for (const raw of parsed.data.aliases) {
    const alias = raw.trim();
    const normalized = normalizeText(alias);

    // A blank, a duplicate, a number, or an essay is not a trigger term.
    if (!normalized || seen.has(normalized)) continue;
    if (/\p{N}/u.test(normalized)) continue;
    if (normalized.split(" ").length > 4) continue;

    seen.add(normalized);
    aliases.push(alias);
    if (aliases.length >= MAX_GENERATED_ALIASES) break;
  }

  return aliases;
}
