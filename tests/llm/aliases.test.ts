import { afterEach, describe, expect, it, vi } from "vitest";

import { generateAliases, MAX_GENERATED_ALIASES } from "@/lib/llm/aliases";
import { resolveProviderConfig } from "@/lib/llm/provider";

const config = resolveProviderConfig({ provider: "openai", apiKey: "sk-test" });

function reply(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], model: "gpt-4o-mini" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const request = {
  wrong: "The annual uniform allowance is EUR 120",
  correct: "The annual uniform allowance is EUR 200",
  existingKeywords: ["uniform allowance"],
};

describe("generateAliases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the terms a user would actually type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      reply('{"aliases":["workwear","protective clothing"]}'),
    ));

    expect(await generateAliases(config, request)).toEqual([
      "workwear",
      "protective clothing",
    ]);
  });

  it("drops terms already configured, ignoring case and punctuation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      reply('{"aliases":["Uniform Allowance!","workwear","workwear"]}'),
    ));

    expect(await generateAliases(config, request)).toEqual(["workwear"]);
  });

  it("rejects terms carrying numbers, which belong to the fact not the trigger", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      reply('{"aliases":["EUR 200 allowance","workwear"]}'),
    ));

    expect(await generateAliases(config, request)).toEqual(["workwear"]);
  });

  it("rejects sentences", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      reply('{"aliases":["how much can I claim back for my work clothes","workwear"]}'),
    ));

    expect(await generateAliases(config, request)).toEqual(["workwear"]);
  });

  it("caps how many aliases one correction can gain", async () => {
    const many = Array.from({ length: 20 }, (_, index) => `term ${String.fromCharCode(97 + index)}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      reply(JSON.stringify({ aliases: many })),
    ));

    const aliases = await generateAliases(config, request);
    expect(aliases).toHaveLength(MAX_GENERATED_ALIASES);
  });

  it("returns nothing when the endpoint fails, so the write still succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await generateAliases(config, request)).toEqual([]);
  });

  it("returns nothing when the model replies with something other than JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("Sure! Here are some ideas.")));

    expect(await generateAliases(config, request)).toEqual([]);
  });
});
