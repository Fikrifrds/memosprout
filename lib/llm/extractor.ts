import { z } from "zod";

import { callLLM, type LLMProviderConfig } from "@/lib/llm/provider";

export const extractionResultSchema = z
  .object({
    isCorrection: z.boolean(),
    confidence: z.number().min(0).max(1).default(0),
    wrong: z.string().optional(),
    correct: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    source: z.string().optional(),
    explanation: z.string().optional(),
  })
  .strict();

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

const EXTRACTION_SYSTEM_PROMPT = `You are a correction detector and extractor for an AI assistant system.

Your job: analyze the user's latest message and the AI's previous answer. Determine if the user is CORRECTING the AI's answer.

A correction is when the user says the AI was wrong and provides (or implies) the right answer. Corrections can be in ANY language and expressed in many ways:
- Direct: "No, that's wrong. It should be X"
- Implicit: "Actually, since 2026 it's been X"
- Partial: the user only says what's wrong but not what's right
- With source: "Check document X, it says Y"
- In any language the user speaks

If the user IS correcting the AI, extract:
- wrong: what the AI said that was wrong (from the previous answer)
- correct: what the user says is right
- keywords: 2-5 trigger keywords that would match similar future questions
- source: any document/reference the user mentions (empty string if none)
- explanation: brief explanation of why (empty string if none)
- confidence: how confident you are that this is a genuine, clear correction (0.0 to 1.0)
  - 0.9-1.0: explicit, unambiguous correction with a clear correct answer
  - 0.6-0.8: likely a correction but somewhat implicit or partial
  - 0.3-0.5: might be a correction but ambiguous
  - 0.0-0.2: probably not a correction

If the user is NOT correcting (asking a new question, saying thanks, giving unrelated feedback), return isCorrection: false with confidence 0.

Return ONLY valid JSON. No markdown, no explanation outside JSON.`;

export async function extractCorrection(
  config: LLMProviderConfig,
  userMessage: string,
  previousAIAnswer: string,
): Promise<ExtractionResult> {
  const userPrompt = JSON.stringify(
    {
      previous_ai_answer: previousAIAnswer,
      user_message: userMessage,
    },
    null,
    2,
  );

  const response = await callLLM(config, [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);

  try {
    const parsed = JSON.parse(response.content) as unknown;
    return extractionResultSchema.parse(parsed);
  } catch {
    return { isCorrection: false, confidence: 0 };
  }
}
