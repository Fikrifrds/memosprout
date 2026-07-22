import { afterEach, describe, expect, it, vi } from "vitest";

import {
  looksStructured,
  callLLM,
  extractJsonPayload,
  knownProviders,
  LLMError,
  resolveProviderConfig,
} from "@/lib/llm/provider";

const config = resolveProviderConfig({ provider: "openai", apiKey: "sk-test" });

function okResponse(content: string, usage?: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], model: "gpt-4o-mini", usage }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callLLM", () => {
  it("returns content on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse('{"ok":true}')));
    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result.content).toBe('{"ok":true}');
    expect(result.usage).toBeNull();
  });

  it("returns normalized OpenAI-compatible token usage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("ok", {
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 40 },
    })));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      cachedInputTokens: 40,
      cacheCreationInputTokens: null,
    });
  });

  it("derives the total when an endpoint omits total_tokens", async () => {
    // vLLM, LiteLLM and similar gateways report the parts without the sum.
    // Dropping the whole usage block over a derivable field would discard
    // the only cost data those endpoints provide.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("ok", {
      prompt_tokens: 120,
      completion_tokens: 30,
    })));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      cachedInputTokens: null,
      cacheCreationInputTokens: null,
    });
  });

  it("keeps usage null when the block is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("ok", {
      prompt_tokens: "many",
      completion_tokens: null,
    })));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result.usage).toBeNull();
  });

  it("reports the same input-side meaning on both wire formats", async () => {
    // Anthropic excludes cache figures from input_tokens and OpenAI
    // includes them. Identical real usage must produce identical numbers.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("ok", {
      prompt_tokens: 140,
      completion_tokens: 20,
      total_tokens: 160,
      prompt_tokens_details: { cached_tokens: 50 },
    })));
    const openai = await callLLM(config, [{ role: "user", content: "hi" }]);

    const anthropic = resolveProviderConfig({ provider: "anthropic", apiKey: "sk-test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 90, output_tokens: 20, cache_read_input_tokens: 50 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const claude = await callLLM(anthropic, [{ role: "user", content: "hi" }]);

    expect(claude.usage!.inputTokens).toBe(openai.usage!.inputTokens);
    expect(claude.usage!.totalTokens).toBe(openai.usage!.totalTokens);
    expect(claude.usage!.cachedInputTokens).toBe(openai.usage!.cachedInputTokens);
  });

  it("flags a reply that is a structured scaffold rather than prose", async () => {
    // Real shapes observed from an evaluated model, which improvised a
    // different schema on nearly every reply. The content is reported
    // as-is: there is no single envelope, so stripping a field would mean
    // guessing which key holds the answer.
    for (const content of [
      '{"reasoning":"...","answer":"A shift is 8 hours."}',
      '{"response":"A shift is 8 hours."}',
      '{"finalA shift is 8 hours.',
      "<|channel|>final<|message|>A shift is 8 hours.",
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(content)));
      const result = await callLLM(config, [{ role: "user", content: "hi" }]);
      expect(result.looksStructured, content).toBe(true);
      expect(result.content).toBe(content);
    }
  });

  it("does not flag ordinary prose, including prose that mentions braces", async () => {
    for (const content of [
      "A standard depot shift is 8 hours.",
      'The config uses {"timeout": 30} as its default.',
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(content)));
      const result = await callLLM(config, [{ role: "user", content: "hi" }]);
      expect(result.looksStructured, content).toBe(false);
    }
  });

  it("treats an empty string as unstructured", () => {
    // callLLM throws before returning empty content, so this edge is only
    // reachable through the helper itself.
    expect(looksStructured("")).toBe(false);
    expect(looksStructured("   ")).toBe(false);
  });

  it("returns normalized Anthropic token usage", async () => {
    const anthropic = resolveProviderConfig({ provider: "anthropic", apiKey: "sk-test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      usage: {
        input_tokens: 80,
        output_tokens: 20,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 10,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await callLLM(anthropic, [{ role: "user", content: "hi" }]);
    // 80 base + 50 cache reads + 10 cache writes: inputTokens is the whole
    // input side, matching what OpenAI's prompt_tokens already reports.
    expect(result.usage).toEqual({
      inputTokens: 140,
      outputTokens: 20,
      totalTokens: 160,
      cachedInputTokens: 50,
      cacheCreationInputTokens: 10,
    });
  });

  it("retries once on a 500 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream down", { status: 500 }))
      .mockResolvedValueOnce(okResponse("recovered"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result.content).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callLLM(config, [{ role: "user", content: "hi" }])).rejects.toThrow("401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on network failure then rethrows", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callLLM(config, [{ role: "user", content: "hi" }])).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes an abort signal (timeout) to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("x"));
    vi.stubGlobal("fetch", fetchMock);
    await callLLM(config, [{ role: "user", content: "hi" }]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("defaults timeoutMs to 30s and accepts overrides", () => {
    expect(config.timeoutMs).toBe(30_000);
    const custom = resolveProviderConfig({ provider: "openai", apiKey: "sk", timeoutMs: 5000 });
    expect(custom.timeoutMs).toBe(5000);
  });

  it("throws a clear LLMError with the model name on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no such model", { status: 404 })));
    const err = await callLLM(config, [{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.message).toContain("gpt-4o-mini");
    expect(err.message).toContain("404");
  });

  it("retries without response_format when the endpoint rejects it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":"response_format is not supported"}', { status: 400 }),
      )
      .mockResolvedValueOnce(okResponse("plain"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result.content).toBe("plain");
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.response_format).toBeUndefined();
  });

  it("throws LLMError on empty/unexpected response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"unexpected":true}', { status: 200 })),
    );
    await expect(callLLM(config, [{ role: "user", content: "hi" }])).rejects.toThrow(
      /empty or unexpected/,
    );
  });

  it("wraps timeouts in a readable LLMError", async () => {
    const timeoutError = new Error("aborted");
    timeoutError.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError));
    const err = await callLLM(config, [{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.message).toMatch(/timed out after 30000ms/);
  });
});

describe("resolveProviderConfig", () => {
  it("resolves every documented provider", () => {
    for (const name of ["openai", "anthropic", "qwen", "kimi", "xiaomi", "openrouter", "togetherai", "deepseek", "groq", "ollama", "minimax"]) {
      const resolved = resolveProviderConfig({ provider: name, apiKey: "sk" });
      expect(resolved.baseUrl).toBe(knownProviders[name].baseUrl);
      expect(resolved.model).toBe(knownProviders[name].defaultModel);
    }
  });

  it("throws a clear error for an unsupported provider", () => {
    expect(() => resolveProviderConfig({ provider: "gemini", apiKey: "sk" })).toThrow(
      /Unsupported LLM provider "gemini".*openai/s,
    );
    expect(() =>
      resolveProviderConfig({ provider: "my-proxy", baseUrl: "https://x.dev/v1", apiKey: "sk" }),
    ).toThrow(/Unsupported LLM provider/);
  });

  it("supports explicit openai-compatible custom endpoints", () => {
    const resolved = resolveProviderConfig({
      provider: "openai-compatible",
      baseUrl: "https://gateway.internal/v1",
      apiKey: "sk",
      model: "my-model",
    });
    expect(resolved.apiFormat).toBe("openai-compatible");
    expect(resolved.baseUrl).toBe("https://gateway.internal/v1");
  });

  it("supports explicit anthropic-compatible custom endpoints", () => {
    const resolved = resolveProviderConfig({
      provider: "anthropic-compatible",
      baseUrl: "https://proxy.internal/v1",
      apiKey: "sk",
      model: "my-model",
    });
    expect(resolved.apiFormat).toBe("anthropic");
  });

  it("requires baseUrl and model for custom-endpoint providers", () => {
    expect(() =>
      resolveProviderConfig({ provider: "openai-compatible", apiKey: "sk", model: "m" }),
    ).toThrow(/requires both baseUrl and model/);
    expect(() =>
      resolveProviderConfig({
        provider: "anthropic-compatible",
        baseUrl: "https://x.dev/v1",
        apiKey: "sk",
      }),
    ).toThrow(/requires both baseUrl and model/);
  });

  it("allows baseUrl override on a supported provider (proxy/self-hosted)", () => {
    const resolved = resolveProviderConfig({
      provider: "openai",
      baseUrl: "https://llm.internal/v1",
      apiKey: "sk",
      model: "custom-model",
    });
    expect(resolved.baseUrl).toBe("https://llm.internal/v1");
    expect(resolved.model).toBe("custom-model");
  });
});

describe("extractJsonPayload", () => {
  it("passes through plain JSON", () => {
    expect(extractJsonPayload('{"a":1}')).toBe('{"a":1}');
  });

  it("strips markdown fences", () => {
    expect(extractJsonPayload('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonPayload('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts JSON embedded in prose", () => {
    expect(extractJsonPayload('Here is the result: {"a":1} hope that helps')).toBe('{"a":1}');
  });
});
