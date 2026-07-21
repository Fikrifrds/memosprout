import { z } from "zod";

export const apiFormatSchema = z.enum(["openai-compatible", "anthropic"]);

export const llmProviderConfigSchema = z
  .object({
    baseUrl: z.string().url().default("https://api.openai.com/v1"),
    apiKey: z.string().min(1),
    model: z.string().min(1).default("gpt-4o-mini"),
    apiFormat: apiFormatSchema.default("openai-compatible"),
  })
  .strict();

export type LLMProviderConfig = z.infer<typeof llmProviderConfigSchema>;

export interface LLMResponse {
  content: string;
  model: string;
}

export async function callLLM(
  config: LLMProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<LLMResponse> {
  if (config.apiFormat === "anthropic") {
    return callAnthropic(config, messages);
  }
  return callOpenAICompatible(config, messages);
}

async function callOpenAICompatible(
  config: LLMProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<LLMResponse> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `LLM request failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
  };

  return {
    content: data.choices[0]?.message?.content ?? "",
    model: data.model,
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
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: systemMessage?.content ?? "",
      messages: userMessages.map((m) => ({ role: "user", content: m.content })),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Anthropic request failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    model: string;
  };

  const textBlock = data.content.find((block) => block.type === "text");

  return {
    content: textBlock?.text ?? "",
    model: data.model,
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
    defaultModel: "claude-sonnet-4-20250514",
    suggestedModel: "claude-3-5-haiku-20241022",
    apiFormat: "anthropic",
    note: "Haiku is the cheapest Claude model, fast and reliable for extraction.",
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
  together: {
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
}): LLMProviderConfig {
  const known = options.provider ? knownProviders[options.provider] : undefined;

  return llmProviderConfigSchema.parse({
    baseUrl: options.baseUrl ?? known?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: options.apiKey,
    model: options.model ?? known?.defaultModel ?? "gpt-4o-mini",
    apiFormat: known?.apiFormat ?? "openai-compatible",
  });
}
