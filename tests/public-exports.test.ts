import { describe, expect, it } from "vitest";

import * as publicApi from "@/lib/index";

/**
 * Guards the published surface. A symbol documented in the README must be
 * importable from the package root — `createApiServer` was once missing
 * here while the docs told users to call it.
 */
const REQUIRED_EXPORTS = [
  "MemoSprout",
  "createApiServer",
  "CorrectionStore",
  "FeedbackStore",
  "OutcomeTracker",
  "AuditLog",
  "CodingAdapter",
  "createSourceOracle",
  "callLLM",
  "resolveProviderConfig",
  "knownProviders",
  "LLMError",
  "extractJsonPayload",
  "extractCorrection",
  "semanticCheck",
  "matchesWrongPattern",
  "normalizeText",
  "atomicWriteFile",
  "Mutex",
  "correctionRecordSchema",
  "feedbackRecordSchema",
  "renderCorrectionMarkdown",
  "parseCorrectionMarkdown",
  "evaluateStaleness",
  "findConflicts",
  "isExpired",
  "detectConflict",
  "messageTypeSchema",
] as const;

describe("public exports", () => {
  it.each(REQUIRED_EXPORTS)("exports %s", (name) => {
    expect(publicApi[name as keyof typeof publicApi]).toBeDefined();
  });

  it("exports MemoSprout and createApiServer as callables", () => {
    expect(typeof publicApi.MemoSprout).toBe("function");
    expect(typeof publicApi.createApiServer).toBe("function");
  });
});
