import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoSprout } from "@/lib/index";

const directories: string[] = [];

function extractionResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }],
      model: "test-extractor",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function makeMemoSprout(options: { approvalRequired?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "memosprout-process-"));
  directories.push(directory);
  return new MemoSprout(directory, {
    llm: {
      provider: "openai-compatible",
      baseUrl: "https://llm.example.invalid/v1",
      apiKey: "test-key",
      model: "test-extractor",
    },
    ...options,
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("processMessage end-to-end safety", () => {
  it("rejects using the extraction model as its own validation judge", () => {
    const llm = {
      provider: "openai-compatible",
      baseUrl: "https://llm.example.invalid/v1",
      apiKey: "test-key",
      model: "same-model",
    };
    expect(
      () => new MemoSprout("unused", { llm, validationLlm: llm }),
    ).toThrow(/cannot validate its own output/);
  });

  it("keeps a high-confidence extracted correction suggested by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(extractionResponse({
      type: "correction",
      confidence: 0.99,
      wrong: "Annual leave is 12 days",
      correct: "Annual leave is 18 days",
      keywords: ["annual leave"],
      source: "HR-2026",
      explanation: "Policy changed",
    })));
    const memosprout = await makeMemoSprout();

    const result = await memosprout.processMessage(
      "No, annual leave is 18 days under HR-2026.",
      "Annual leave is 12 days.",
      "support",
    );

    expect(result.type).toBe("correction");
    expect(result.correctionStatus).toBe("suggested");
    expect(result.correctionSaved?.status).toBe("suggested");
    expect(result.context).toBe("");
  });

  it("allows confidence-based activation only when explicitly opted in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(extractionResponse({
      type: "correction",
      confidence: 0.95,
      wrong: "Refunds take 3 days",
      correct: "Refunds take 5 days",
      keywords: ["refund"],
    })));
    const memosprout = await makeMemoSprout({ approvalRequired: false });

    const result = await memosprout.processMessage(
      "Refunds actually take 5 days.",
      "Refunds take 3 days.",
      "support",
    );

    expect(result.correctionStatus).toBe("active");
    expect(result.correctionSaved?.status).toBe("active");
  });

  it("keeps low-confidence corrections suggested even after opt-in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(extractionResponse({
      type: "correction",
      confidence: 0.6,
      wrong: "Old value",
      correct: "Possible new value",
      keywords: ["value"],
    })));
    const memosprout = await makeMemoSprout({ approvalRequired: false });

    const result = await memosprout.processMessage(
      "I think the value may have changed.",
      "Old value",
    );

    expect(result.correctionStatus).toBe("suggested");
  });

  it("stores feedback separately and makes no correction live", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(extractionResponse({
      type: "feedback",
      confidence: 0.9,
      topic: "shipping delay",
    })));
    const memosprout = await makeMemoSprout();

    const result = await memosprout.processMessage(
      "This shipping answer looks outdated.",
      "Shipping takes two days.",
      "support",
    );

    expect(result.type).toBe("feedback");
    expect(result.feedbackSaved?.topic).toBe("shipping delay");
    expect(result.correctionSaved).toBeNull();
    expect(await memosprout.list()).toEqual([]);
  });
});
