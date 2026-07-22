import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoSprout } from "@/lib/index";

/**
 * The end-to-end claim: alias generation closes a synonym miss that lexical
 * retrieval cannot reach. The model is stubbed so this stays deterministic
 * and free — what is under test is whether generated aliases actually reach
 * the matcher, not whether a particular model produces good synonyms.
 */
function aliasReply(aliases: string[]): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ aliases }) } }],
      model: "gpt-4o-mini",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const correction = {
  wrong: "The annual uniform allowance is EUR 120",
  correct: "The annual uniform allowance is EUR 200",
  keywords: ["uniform allowance"],
  domain: "handbook",
};
const paraphrase = "How much can a depot employee claim back for workwear each year?";

describe("alias generation and retrieval", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "memosprout-alias-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it("does not retrieve a paraphrase without aliases", async () => {
    const ms = new MemoSprout(directory);
    await ms.correct(correction);

    const { corrections } = await ms.context(paraphrase, "handbook");
    expect(corrections).toHaveLength(0);
  });

  it("retrieves the same paraphrase once aliases are generated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(aliasReply(["workwear", "work clothes"])));

    const ms = new MemoSprout(directory, {
      llm: { provider: "openai", apiKey: "sk-test" },
      generateAliases: true,
    });
    const saved = await ms.correct(correction);
    expect(saved.trigger.keywords).toContain("workwear");

    const { corrections } = await ms.context(paraphrase, "handbook");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.correctAnswer).toContain("200");
  });

  it("costs nothing on the read path — no call is made during context()", async () => {
    const fetchMock = vi.fn().mockResolvedValue(aliasReply(["workwear"]));
    vi.stubGlobal("fetch", fetchMock);

    const ms = new MemoSprout(directory, {
      llm: { provider: "openai", apiKey: "sk-test" },
      generateAliases: true,
    });
    await ms.correct(correction);
    const callsAfterWrite = fetchMock.mock.calls.length;

    await ms.context(paraphrase, "handbook");
    await ms.context(paraphrase, "handbook");

    expect(fetchMock.mock.calls.length).toBe(callsAfterWrite);
  });

  it("leaves the correction intact when alias generation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const ms = new MemoSprout(directory, {
      llm: { provider: "openai", apiKey: "sk-test" },
      generateAliases: true,
    });
    const saved = await ms.correct(correction);

    expect(saved.trigger.keywords).toEqual(["uniform allowance"]);
    const { corrections } = await ms.context("What is the uniform allowance?", "handbook");
    expect(corrections).toHaveLength(1);
  });
});
