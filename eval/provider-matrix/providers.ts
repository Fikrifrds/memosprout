/**
 * Provider roster for the live matrix, loaded from the gitignored
 * `.provider_list_to_test`.
 *
 * Secret handling: the API key is read into memory and handed to the LLM
 * client, and nothing else. It is never logged, never written to a report,
 * and never returned by any function that produces reportable data. Every
 * error is reduced to a category before it can carry a URL, a header, or a
 * key fragment into the output.
 */
import { readFileSync } from "node:fs";

import { resolveProviderConfig, type LLMProviderConfig } from "@/lib/llm/provider";

/** Everything about a provider that is safe to publish. */
export interface ProviderLabel {
  /** Stable id used in reports: "qwen/qwen3.8-max-preview". */
  id: string;
  provider: string;
  model: string;
}

export interface ProviderEntry extends ProviderLabel {
  /** Resolved config, including the key. Never serialize this. */
  config: LLMProviderConfig;
}

export const providerListPath = ".provider_list_to_test";

function parseBlocks(raw: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (Object.keys(current).length > 0) blocks.push(current);
      current = {};
      continue;
    }
    const match = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    current[match[1]!] = match[2]!.trim();
  }
  if (Object.keys(current).length > 0) blocks.push(current);
  return blocks;
}

/**
 * Reads the roster. A block naming MEMOSPROUT_LLM_PROVIDER is an explicit
 * entry; a bare OPENAI_API_KEY is the shorthand OpenAI entry.
 */
export function loadProviders(path: string = providerListPath): ProviderEntry[] {
  const blocks = parseBlocks(readFileSync(path, "utf8"));
  const entries: ProviderEntry[] = [];

  for (const block of blocks) {
    const provider = block.MEMOSPROUT_LLM_PROVIDER;
    const apiKey = block.MEMOSPROUT_LLM_API_KEY ?? block.OPENAI_API_KEY;
    if (!apiKey) continue;

    const options = provider
      ? {
          provider,
          baseUrl: block.MEMOSPROUT_LLM_BASE_URL,
          apiKey,
          model: block.MEMOSPROUT_LLM_MODEL,
          timeoutMs: 60_000,
        }
      : { provider: "openai", apiKey, timeoutMs: 60_000 };

    // A provider name the library rejects is a reportable outcome, not a
    // reason to swap in something that happens to work.
    const config = resolveProviderConfig(options);
    entries.push({
      id: `${options.provider}/${config.model}`,
      provider: options.provider,
      model: config.model,
      config,
    });
  }

  return entries;
}

export type ErrorCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "model_not_found"
  | "bad_request"
  | "server_error"
  | "network"
  | "unknown";

/**
 * Collapses an error to a category. The message itself is discarded: a
 * provider is free to echo the request URL, the model id, or an
 * `Authorization` header back at us, and none of that belongs in a report.
 */
export function categorizeError(error: unknown): ErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/\b401\b|\b403\b|unauthor|invalid api key|authentication/.test(message)) return "auth";
  if (/\b429\b|rate limit|quota|too many requests/.test(message)) return "rate_limit";
  if (/timed out|timeout|abort/.test(message)) return "timeout";
  if (/\b404\b|model not found|unknown model|does not exist/.test(message)) return "model_not_found";
  if (/\b400\b|\b422\b|invalid request|bad request/.test(message)) return "bad_request";
  if (/\b5\d\d\b|server error|overloaded|unavailable/.test(message)) return "server_error";
  if (/fetch failed|econnrefused|enotfound|network|socket/.test(message)) return "network";
  return "unknown";
}

/** Strips the config so only publishable fields remain. */
export function toLabel(entry: ProviderEntry): ProviderLabel {
  return { id: entry.id, provider: entry.provider, model: entry.model };
}
