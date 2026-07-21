import { callLLM, type LLMProviderConfig } from "@/lib/llm/provider";
import type { CorrectionRecord } from "@/lib/correction/schema";
import type { Oracle, OracleResult } from "@/lib/adapter/types";

const VERIFICATION_SYSTEM_PROMPT = `You are a fact-checker for an AI correction system.

You will receive a correction that claims:
- The AI was wrong about something (wrongPattern)
- The correct answer is something else (correctAnswer)
- A source reference (sourceRef)

Your job: evaluate whether this correction is INTERNALLY CONSISTENT and PLAUSIBLE.

Check:
1. Does the correct answer actually differ from the wrong pattern? (not identical)
2. Is the correct answer specific and actionable? (not vague like "it depends")
3. Does the explanation (if any) support the correction?
4. Is the source reference plausible? (not empty for a factual claim)
5. Are there any obvious contradictions or red flags?

Return JSON: { "passed": true/false, "detail": "explanation" }
Return ONLY valid JSON.`;

export function createSourceOracle(
  config: LLMProviderConfig,
  correction: CorrectionRecord,
): Oracle {
  return {
    id: `source-oracle:${correction.correctionId}`,
    async evaluate(): Promise<OracleResult> {
      const prompt = JSON.stringify(
        {
          wrongPattern: correction.wrongPattern,
          correctAnswer: correction.correctAnswer,
          explanation: correction.explanation,
          sourceRef: correction.sourceRef,
          domain: correction.domain,
        },
        null,
        2,
      );

      try {
        const response = await callLLM(config, [
          { role: "system", content: VERIFICATION_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ]);

        const parsed = JSON.parse(response.content) as { passed: boolean; detail: string };
        return {
          passed: Boolean(parsed.passed),
          detail: String(parsed.detail ?? ""),
        };
      } catch (error) {
        return {
          passed: false,
          detail: `Source oracle failed: ${error instanceof Error ? error.message : "unknown error"}`,
        };
      }
    },
  };
}
