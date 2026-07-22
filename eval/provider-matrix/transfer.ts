/**
 * Cross-provider transfer: does a correction learned through one model
 * apply when a different model answers?
 *
 * The extractor provider turns a natural user utterance into a structured
 * correction via `processMessage()`. Because `approvalRequired` now
 * defaults to true, the extracted record lands as `suggested` and is
 * approved explicitly — that approval is the human gate the product
 * describes, so the test performs it rather than pretending it is
 * automatic. The answering provider then sees only what the store holds.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";
import { callLLM } from "@/lib/llm/provider";

import { assertsPhrase } from "@/lib/eval/knowledge-drift/oracle";
import { hasWrapperArtifact } from "@/eval/provider-matrix/runner";
import {
  categorizeError,
  toLabel,
  type ErrorCategory,
  type ProviderEntry,
  type ProviderLabel,
} from "@/eval/provider-matrix/providers";
import { transferCases } from "@/eval/provider-matrix/tasks";

const SYSTEM_PROMPT =
  "You are an internal assistant. Answer strictly from the material you are given. " +
  "Do not invent policy. Answer in one or two sentences and state the specific values asked for.";

export interface ExtractionResult {
  extractor: ProviderLabel;
  caseId: string;
  status: "extracted" | "not_a_correction" | "error";
  /** Whether the extracted record needed the approval step. */
  requiredApproval: boolean;
  confidence: number;
  errorCategory: ErrorCategory | null;
}

export interface TransferResult {
  extractor: string;
  answerer: string;
  caseId: string;
  status: "ok" | "skipped_extraction_failed" | "error";
  /**
   * Did the answering model apply the correction the other model learned?
   * Fact-level only: true means the corrected fact is present and the stale
   * one is not, regardless of how the answer was packaged.
   */
  applied: boolean | null;
  /**
   * False when the answer arrived wrapped in a JSON or chat-template
   * envelope. Same rule the matrix arms use, so a transfer figure cannot
   * claim more than a correction-case figure would for the same output.
   */
  cleanOutput: boolean | null;
  /** Applied *and* clean — the only form a caller could actually ship. */
  appliedCleanly: boolean | null;
  /**
   * The answer text. Stored because without it "43/50 applied" cannot be
   * re-graded later, and an oracle fix would need a paid rerun to land.
   */
  answer: string | null;
  retrievedCorrection: boolean | null;
  errorCategory: ErrorCategory | null;
}

export interface TransferReport {
  extractions: ExtractionResult[];
  transfers: TransferResult[];
}

/**
 * Runs extraction with `extractor` into a fresh store, then has every
 * provider in `answerers` answer from that store.
 */
export async function runTransfer(
  extractor: ProviderEntry,
  answerers: ProviderEntry[],
): Promise<TransferReport> {
  const extractions: ExtractionResult[] = [];
  const transfers: TransferResult[] = [];
  const directory = await mkdtemp(join(tmpdir(), "memosprout-transfer-"));

  try {
    const memosprout = new MemoSprout(directory, {
      llm: {
        provider: extractor.provider,
        baseUrl: extractor.config.baseUrl,
        apiKey: extractor.config.apiKey,
        model: extractor.model,
        timeoutMs: 60_000,
      },
    });

    const extracted = new Set<string>();

    for (const testCase of transferCases) {
      try {
        const result = await memosprout.processMessage(
          testCase.userMessage,
          testCase.previousAnswer,
          testCase.domain,
        );

        if (!result.correctionSaved) {
          extractions.push({
            extractor: toLabel(extractor),
            caseId: testCase.id,
            status: "not_a_correction",
            requiredApproval: false,
            confidence: result.confidence,
            errorCategory: null,
          });
          continue;
        }

        const requiredApproval = result.correctionStatus !== "active";
        if (requiredApproval) {
          await memosprout.approve(result.correctionSaved.correctionId);
        }

        extracted.add(testCase.id);
        extractions.push({
          extractor: toLabel(extractor),
          caseId: testCase.id,
          status: "extracted",
          requiredApproval,
          confidence: result.confidence,
          errorCategory: null,
        });
      } catch (error) {
        extractions.push({
          extractor: toLabel(extractor),
          caseId: testCase.id,
          status: "error",
          requiredApproval: false,
          confidence: 0,
          errorCategory: categorizeError(error),
        });
      }
    }

    for (const answerer of answerers) {
      for (const testCase of transferCases) {
        if (!extracted.has(testCase.id)) {
          transfers.push({
            extractor: extractor.id,
            answerer: answerer.id,
            caseId: testCase.id,
            status: "skipped_extraction_failed",
            applied: null,
            cleanOutput: null,
            appliedCleanly: null,
            answer: null,
            retrievedCorrection: null,
            errorCategory: null,
          });
          continue;
        }

        try {
          const { context, corrections } = await memosprout.context(
            testCase.question,
            testCase.domain,
          );
          const response = await callLLM(answerer.config, [
            {
              role: "system",
              content: context ? `${SYSTEM_PROMPT}\n\n${context}` : SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: `Reference material:\n${testCase.kbSnippet}\n\nQuestion: ${testCase.question}`,
            },
          ]);

          const answer = response.content.trim();
          const applied =
            testCase.mustInclude.every((spec) =>
              spec.split("|").some((alternative) => assertsPhrase(answer, alternative)),
            ) && !testCase.mustExclude.some((phrase) => assertsPhrase(answer, phrase));

          const cleanOutput = !hasWrapperArtifact(answer);
          transfers.push({
            extractor: extractor.id,
            answerer: answerer.id,
            caseId: testCase.id,
            status: "ok",
            applied,
            cleanOutput,
            appliedCleanly: applied && cleanOutput,
            answer,
            retrievedCorrection: corrections.length > 0,
            errorCategory: null,
          });
        } catch (error) {
          transfers.push({
            extractor: extractor.id,
            answerer: answerer.id,
            caseId: testCase.id,
            status: "error",
            applied: null,
            cleanOutput: null,
            appliedCleanly: null,
            answer: null,
            retrievedCorrection: null,
            errorCategory: categorizeError(error),
          });
        }
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  return { extractions, transfers };
}
