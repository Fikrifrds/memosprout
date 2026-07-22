import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoSprout } from "@/lib/index";

/**
 * The claim under test: semantic retrieval answers paraphrases that lexical
 * retrieval cannot, without giving up lexical precision — and without
 * spending an embedding call on queries lexical already answered.
 *
 * Embeddings are stubbed with a deterministic bag-of-words vector plus a
 * hand-written synonym map. That is not a model, and it is not pretending to
 * be: what is under test is the *wiring* — whether a semantic hit reaches
 * the caller, whether the cache suppresses repeat calls, whether staleness
 * still gates. Real-model recall is measured separately in
 * scripts/run-semantic-retrieval-eval.ts against a live provider.
 */

// Words that mean the same thing collapse to a shared axis, which is what
// gives the stub its "semantic" behaviour.
const SYNONYMS: Record<string, string> = {
  workwear: "uniform",
  clothing: "uniform",
  clothes: "uniform",
  garment: "uniform",
  reimburse: "allowance",
  reimbursement: "allowance",
  claim: "allowance",
  refund: "allowance",
  yearly: "annual",
  year: "annual",
};

const AXES = [
  "uniform", "allowance", "annual", "eur", "parking", "permit",
  "laptop", "warranty", "sick", "leave",
];

function stubVector(text: string): number[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((token) => SYNONYMS[token] ?? token);
  return AXES.map((axis) => (tokens.includes(axis) ? 1 : 0));
}

function embeddingReply(inputs: string[]): Response {
  return new Response(
    JSON.stringify({
      data: inputs.map((text, index) => ({ embedding: stubVector(text), index })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Serves /embeddings; anything else in these tests is a bug. */
function stubEmbeddingFetch() {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (!String(url).includes("/embeddings")) {
      throw new Error(`unexpected request to ${String(url)}`);
    }
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    return embeddingReply(body.input);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const UNIFORM = {
  wrong: "The annual uniform allowance is EUR 120",
  correct: "The annual uniform allowance is EUR 200",
  keywords: ["uniform allowance"],
  domain: "handbook",
};

const PARKING = {
  wrong: "A parking permit costs EUR 40 per month",
  correct: "A parking permit costs EUR 55 per month",
  keywords: ["parking permit"],
  domain: "handbook",
};

const PARAPHRASE = "How much can I claim back for workwear each year?";

function semanticInstance(directory: string) {
  return new MemoSprout(directory, {
    llm: { provider: "openai", apiKey: "sk-test" },
    semanticRetrieval: true,
  });
}

describe("semantic retrieval — with vs without", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-semantic-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it("without it, a paraphrase retrieves nothing", async () => {
    const ms = new MemoSprout(directory);
    await ms.correct(UNIFORM);

    const { corrections } = await ms.context(PARAPHRASE, "handbook");
    expect(corrections).toHaveLength(0);
  });

  it("with it, the same paraphrase retrieves the correction", async () => {
    stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    await ms.correct(UNIFORM);

    const { corrections } = await ms.context(PARAPHRASE, "handbook");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.correctAnswer).toContain("200");
  });

  it("does not serve an unrelated correction from the same domain", async () => {
    stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    await ms.correct(UNIFORM);
    await ms.correct(PARKING);

    const { corrections } = await ms.context(PARAPHRASE, "handbook");
    expect(corrections.map((c) => c.correctAnswer)).toEqual([
      "The annual uniform allowance is EUR 200",
    ]);
  });

  it("costs nothing when lexical retrieval already answered the query", async () => {
    const fetchMock = stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    await ms.correct(UNIFORM);
    fetchMock.mockClear();

    const { corrections } = await ms.context("What is the uniform allowance?", "handbook");

    expect(corrections).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches correction vectors — a repeat query embeds only the query", async () => {
    const fetchMock = stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    await ms.correct(UNIFORM);

    await ms.context(PARAPHRASE, "handbook");
    const callsAfterFirst = fetchMock.mock.calls.length;
    await ms.context(PARAPHRASE, "handbook");

    // Cold: one call for the query + one batched call for the corrections.
    // Warm: the query only.
    expect(callsAfterFirst).toBe(2);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst + 1);

    const cache = JSON.parse(await readFile(join(directory, "embeddings.json"), "utf8"));
    expect(Object.keys(cache)).toHaveLength(1);
  });

  it("re-embeds when a correction's indexed text changes", async () => {
    const fetchMock = stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    const saved = await ms.correct(UNIFORM);
    await ms.context(PARAPHRASE, "handbook");

    const before = JSON.parse(await readFile(join(directory, "embeddings.json"), "utf8"));
    const fingerprintBefore = before[saved.correctionId].fingerprint;

    // A superseding correction is a different record with different text, so
    // it must get its own vector rather than inherit the cached one.
    const superseding = await ms.correct({
      ...UNIFORM,
      correct: "The annual uniform allowance is EUR 260",
    });
    fetchMock.mockClear();
    await ms.context(PARAPHRASE, "handbook");

    const after = JSON.parse(await readFile(join(directory, "embeddings.json"), "utf8"));
    expect(superseding.correctionId).not.toBe(saved.correctionId);
    expect(after[superseding.correctionId].fingerprint).not.toBe(fingerprintBefore);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("never serves a quarantined correction, however similar", async () => {
    stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    const saved = await ms.correct({ ...UNIFORM, source: "handbook.pdf", sourceHash: "v1" });
    ms.setSourceHashProvider({ getCurrentHash: async () => "v2" });

    const { corrections, staleSkipped } = await ms.context(PARAPHRASE, "handbook");
    expect(corrections).toHaveLength(0);
    expect(staleSkipped).toBe(1);
    expect((await ms.get(saved.correctionId))!.status).toBe("quarantined");
  });

  it("falls back to an empty context when the embedding provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ms = semanticInstance(directory);
    await ms.correct(UNIFORM);

    await expect(ms.context(PARAPHRASE, "handbook")).resolves.toMatchObject({
      corrections: [],
    });
    expect(warn).toHaveBeenCalled();
  });

  it("requires a key, and says so at construction", () => {
    expect(() => new MemoSprout(directory, { semanticRetrieval: true })).toThrow(/apiKey/i);
  });

  /**
   * The threshold is the only guard against a loosely-related correction
   * being served, and the live eval shows that guard is real: off-topic
   * queries do attach to a near neighbour when it is set too low. This
   * pins the mechanism so a future change cannot quietly disable it.
   */
  it("rejects a candidate below the threshold instead of serving the nearest one", async () => {
    stubEmbeddingFetch();
    const ms = new MemoSprout(directory, {
      llm: { provider: "openai", apiKey: "sk-test" },
      semanticRetrieval: true,
      semanticRetrievalThreshold: 0.99,
    });
    await ms.correct(UNIFORM);

    // The paraphrase is a genuine match at the default threshold; at 0.99
    // nothing qualifies, and the correct behaviour is silence rather than
    // the best available guess.
    const { corrections } = await ms.context(PARAPHRASE, "handbook");
    expect(corrections).toHaveLength(0);
  });

  it("serves nothing for a query unrelated to every correction", async () => {
    stubEmbeddingFetch();
    const ms = semanticInstance(directory);
    await ms.correct(UNIFORM);
    await ms.correct(PARKING);

    const { corrections } = await ms.context("Who is the CEO of the company?", "handbook");
    expect(corrections).toHaveLength(0);
  });
});
