import { z } from "zod";

export const apiFormatSchema = z.enum(["openai-compatible", "anthropic"]);

export const llmProviderConfigSchema = z
  .object({
    baseUrl: z.string().url().default("https://api.openai.com/v1"),
    apiKey: z.string().min(1),
    model: z.string().min(1).default("gpt-4o-mini"),
    apiFormat: apiFormatSchema.default("openai-compatible"),
    timeoutMs: z.number().int().positive().default(30_000),
  })
  .strict();

export type LLMProviderConfig = z.infer<typeof llmProviderConfigSchema>;

/**
 * Token counts normalized across wire formats.
 *
 * `inputTokens` is always the complete input side, cache included, so the
 * same field means the same thing on every provider. `cachedInputTokens`
 * and `cacheCreationInputTokens` break that total down for pricing, which
 * matters because cache reads and cache writes do not bill at the input
 * rate. `totalTokens` is always `inputTokens + outputTokens`.
 */
export interface LLMTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Tokens served from a provider prompt cache, when reported separately. */
  cachedInputTokens: number | null;
  /** Tokens written to an Anthropic-style prompt cache, when reported. */
  cacheCreationInputTokens: number | null;
}

export interface LLMResponse {
  content: string;
  model: string;
  /** Null only when the endpoint omitted or returned an invalid usage block. */
  usage: LLMTokenUsage | null;
}

const openAIUsageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    // Optional: self-hosted and gateway endpoints (vLLM, LiteLLM and
    // friends) often report the two component counts and omit the sum.
    // Rejecting the whole block over a derivable field would throw away
    // the only cost data those endpoints give us.
    total_tokens: z.number().int().nonnegative().optional(),
    prompt_tokens_details: z
      .object({ cached_tokens: z.number().int().nonnegative().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const anthropicUsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_input_tokens: z.number().int().nonnegative().optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().optional(),
  })
  .passthrough();

function normalizeOpenAIUsage(value: unknown): LLMTokenUsage | null {
  const parsed = openAIUsageSchema.safeParse(value);
  if (!parsed.success) return null;
  // OpenAI counts cached tokens inside prompt_tokens, so inputTokens is
  // already the whole input side and cached_tokens is a breakdown of it.
  return {
    inputTokens: parsed.data.prompt_tokens,
    outputTokens: parsed.data.completion_tokens,
    totalTokens:
      parsed.data.total_tokens ?? parsed.data.prompt_tokens + parsed.data.completion_tokens,
    cachedInputTokens: parsed.data.prompt_tokens_details?.cached_tokens ?? null,
    cacheCreationInputTokens: null,
  };
}

function normalizeAnthropicUsage(value: unknown): LLMTokenUsage | null {
  const parsed = anthropicUsageSchema.safeParse(value);
  if (!parsed.success) return null;
  const cachedInputTokens = parsed.data.cache_read_input_tokens ?? null;
  const cacheCreationInputTokens = parsed.data.cache_creation_input_tokens ?? null;

  // Anthropic reports input_tokens *excluding* both cache figures, while
  // OpenAI reports them included. Folding them in here makes inputTokens
  // mean the same thing on every provider — the whole input side — so a
  // consumer can compare or sum across providers without knowing which
  // wire format produced the number. The cache fields remain the
  // breakdown, and pricing must use them because cache reads and cache
  // writes bill at different rates from ordinary input.
  const inputTokens =
    parsed.data.input_tokens + (cachedInputTokens ?? 0) + (cacheCreationInputTokens ?? 0);

  return {
    inputTokens,
    outputTokens: parsed.data.output_tokens,
    totalTokens: inputTokens + parsed.data.output_tokens,
    cachedInputTokens,
    cacheCreationInputTokens,
  };
}

/**
 * Every LLM failure surfaces as an LLMError with an actionable message —
 * never a silent crash or a bare fetch error.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

function describeHttpFailure(status: number, body: string, config: LLMProviderConfig): string {
  const detail = body.slice(0, 200);
  if (status === 401 || status === 403) {
    return `LLM auth failed (${status}) at ${config.baseUrl} — check your API key. ${detail}`;
  }
  if (status === 404) {
    return (
      `LLM endpoint or model not found (404) at ${config.baseUrl} — ` +
      `check that model "${config.model}" exists on this provider. ${detail}`
    );
  }
  if (status === 400 && /model/i.test(detail)) {
    return (
      `LLM rejected the request (400) — model "${config.model}" may not be ` +
      `supported by this provider. ${detail}`
    );
  }
  if (status === 429) {
    return `LLM rate limit hit (429) at ${config.baseUrl}. ${detail}`;
  }
  return `LLM request failed (${status}) at ${config.baseUrl}: ${detail}`;
}

/**
 * Some models wrap JSON in markdown fences or prose. Extract the JSON
 * payload so downstream JSON.parse succeeds across providers.
 */
export function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function callLLM(
  config: LLMProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<LLMResponse> {
  const call = () =>
    config.apiFormat === "anthropic"
      ? callAnthropic(config, messages)
      : callOpenAICompatible(config, messages);

  try {
    return await call();
  } catch (error) {
    if (!isRetryable(error)) throw toLLMError(error, config);
    try {
      return await call();
    } catch (retryError) {
      throw toLLMError(retryError, config);
    }
  }
}

function toLLMError(error: unknown, config: LLMProviderConfig): LLMError {
  if (error instanceof LLMError) return error;
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return new LLMError(
        `LLM request timed out after ${config.timeoutMs}ms at ${config.baseUrl}. ` +
          `Increase timeoutMs or check the endpoint.`,
      );
    }
    return new LLMError(
      `Could not reach LLM endpoint ${config.baseUrl}: ${error.message}. ` +
        `Check the baseUrl and your network.`,
    );
  }
  return new LLMError(`LLM request failed: ${String(error)}`);
}

// Retry once on timeouts, network failures, and 5xx / 429 — not on 4xx.
function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const status =
    error instanceof LLMError
      ? error.status
      : Number(/\((\d{3})\)/.exec(error.message)?.[1]) || undefined;
  if (status) return status === 429 || status >= 500;
  return true; // no status → network-level failure (fetch TypeError, etc.)
}

async function callOpenAICompatible(
  config: LLMProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  useJsonFormat = true,
): Promise<LLMResponse> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0,
      ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Not every OpenAI-compatible endpoint supports response_format —
    // retry the same request without it before giving up.
    if (useJsonFormat && response.status === 400 && /response_format/i.test(body)) {
      return callOpenAICompatible(config, messages, false);
    }
    throw new LLMError(describeHttpFailure(response.status, body, config), response.status);
  }

  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: unknown;
  } | null;

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMError(
      `LLM at ${config.baseUrl} returned an empty or unexpected response for ` +
        `model "${config.model}". The model may not be supported by this provider.`,
    );
  }

  return {
    content,
    model: data?.model ?? config.model,
    usage: normalizeOpenAIUsage(data?.usage),
  };
}

async function callAnthropic(
  config: LLMProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<LLMResponse> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/messages`;

  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role === "user");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemMessage?.content ?? "",
      messages: userMessages.map((m) => ({ role: "user", content: m.content })),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LLMError(describeHttpFailure(response.status, body, config), response.status);
  }

  const data = (await response.json().catch(() => null)) as {
    content?: Array<{ type: string; text: string }>;
    model?: string;
    usage?: unknown;
  } | null;

  const textBlock = data?.content?.find((block) => block.type === "text");
  if (!textBlock?.text) {
    throw new LLMError(
      `Anthropic endpoint at ${config.baseUrl} returned an empty or unexpected ` +
        `response for model "${config.model}".`,
    );
  }

  return {
    content: textBlock.text,
    model: data?.model ?? config.model,
    usage: normalizeAnthropicUsage(data?.usage),
  };
}

export interface ProviderInfo {
  baseUrl: string;
  defaultModel: string;
  apiFormat: "openai-compatible" | "anthropic";
  /** Cheap, reliable model recommended for correction extraction. */
  suggestedModel: string;
  note: string;
}

export const knownProviders: Record<string, ProviderInfo> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    suggestedModel: "gpt-4o-mini",
    apiFormat: "openai-compatible",
    note: "Best price/performance ratio. Reliable JSON output.",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5-20251001",
    suggestedModel: "claude-haiku-4-5-20251001",
    apiFormat: "anthropic",
    note: "Haiku 4.5 is the cheapest Claude model, fast and reliable for extraction.",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    suggestedModel: "deepseek-chat",
    apiFormat: "openai-compatible",
    note: "Extremely cheap. Good quality for structured extraction.",
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    suggestedModel: "qwen-turbo",
    apiFormat: "openai-compatible",
    note: "Qwen-turbo is the cheapest tier, strong multilingual support.",
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    suggestedModel: "moonshot-v1-8k",
    apiFormat: "openai-compatible",
    note: "8k context is sufficient for correction extraction.",
  },
  xiaomi: {
    baseUrl: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5",
    suggestedModel: "mimo-v2.5",
    apiFormat: "openai-compatible",
    note: "Xiaomi MiMo. mimo-v2.5-pro for higher quality. Also offers an Anthropic-compatible endpoint (use provider anthropic-compatible).",
  },
  minimax: {
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-Text-01",
    suggestedModel: "MiniMax-Text-01",
    apiFormat: "openai-compatible",
    note: "Single model, competitive pricing.",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModel: "llama-3.1-8b-instant",
    apiFormat: "openai-compatible",
    note: "8b-instant is the fastest and cheapest on Groq. Free tier available.",
  },
  togetherai: {
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    suggestedModel: "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    apiFormat: "openai-compatible",
    note: "8B Instruct Turbo is cheap and fast for extraction tasks.",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-chat-v3-0324",
    suggestedModel: "deepseek/deepseek-chat-v3-0324",
    apiFormat: "openai-compatible",
    note: "Access hundreds of models. DeepSeek via OpenRouter is very cheap.",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    suggestedModel: "llama3.2",
    apiFormat: "openai-compatible",
    note: "Free, local, no API key needed. 3B model is sufficient for extraction.",
  },
};

export function resolveProviderConfig(options: {
  provider?: string;
  baseUrl?: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}): LLMProviderConfig {
  // Explicit custom-endpoint providers: bring your own baseUrl + model,
  // choose which wire format the endpoint speaks.
  if (options.provider === "openai-compatible" || options.provider === "anthropic-compatible") {
    if (!options.baseUrl || !options.model) {
      throw new LLMError(
        `Provider "${options.provider}" is for custom endpoints and requires ` +
          `both baseUrl and model to be set explicitly.`,
      );
    }
    return llmProviderConfigSchema.parse({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      apiFormat: options.provider === "anthropic-compatible" ? "anthropic" : "openai-compatible",
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
  }

  const known = options.provider ? knownProviders[options.provider] : undefined;

  // Only providers in the registry are supported — an unknown name must
  // fail loudly at construction time, not fall back to OpenAI and produce
  // confusing auth errors later.
  if (options.provider && !known) {
    throw new LLMError(
      `Unsupported LLM provider "${options.provider}". ` +
        `Supported providers: ${Object.keys(knownProviders).join(", ")}, ` +
        `plus "openai-compatible" and "anthropic-compatible" for custom ` +
        `endpoints (require baseUrl + model). See docs/PROVIDERS.md.`,
    );
  }

  return llmProviderConfigSchema.parse({
    baseUrl: options.baseUrl ?? known?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: options.apiKey,
    model: options.model ?? known?.defaultModel ?? "gpt-4o-mini",
    apiFormat: known?.apiFormat ?? "openai-compatible",
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
}
