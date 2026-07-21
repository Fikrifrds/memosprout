import { afterEach, describe, expect, it, vi } from "vitest";

import {
  callLLM,
  extractJsonPayload,
  knownProviders,
  LLMError,
  resolveProviderConfig,
} from "@/lib/llm/provider";

const config = resolveProviderConfig({ provider: "openai", apiKey: "sk-test" });

function okResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], model: "gpt-4o-mini" }),
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
