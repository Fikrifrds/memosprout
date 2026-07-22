/**
 * Embeddings for semantic retrieval.
 *
 * Kept deliberately small: one request shape (OpenAI's `/embeddings`, which
 * every major provider and gateway now speaks), cosine similarity, and a
 * disk cache. Nothing here decides *whether* to embed — that is the store's
 * job — so this module stays a pure transport.
 */

import { z } from "zod";

import { LLMError, type LLMProviderConfig } from "@/lib/llm/provider";

/**
 * Embedding config is separate from the chat config because the two are
 * independent choices: a caller may extract corrections with Claude and
 * embed with OpenAI, or point embeddings at a local Ollama while chat goes
 * to a hosted model. Only `apiKey` is required.
 */
export interface EmbeddingProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface EmbeddingOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * text-embedding-3-small: $0.02 per 1M tokens, 1536 dimensions. The cheapest
 * credible default — an order of magnitude below any chat model, which is
 * what makes per-query embedding affordable at all.
 */
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export function resolveEmbeddingConfig(
  options: EmbeddingOptions,
  fallback: LLMProviderConfig | null,
): EmbeddingProviderConfig {
  const apiKey = options.apiKey ?? fallback?.apiKey;
  if (!apiKey) {
    throw new LLMError(
      "semanticRetrieval needs an API key: set embedding.apiKey, or configure " +
        "llm so the embedding provider can reuse its key.",
    );
  }

  // The chat baseUrl is only a safe default when it speaks the OpenAI wire
  // format — an Anthropic endpoint has no /embeddings route, and Anthropic
  // publishes no embedding model, so inheriting it would fail at the first
  // call with a confusing 404. Fall back to OpenAI instead.
  const inheritable =
    fallback && fallback.apiFormat === "openai-compatible" ? fallback.baseUrl : undefined;

  return {
    baseUrl: options.baseUrl ?? inheritable ?? "https://api.openai.com/v1",
    apiKey,
    model: options.model ?? DEFAULT_EMBEDDING_MODEL,
    timeoutMs: options.timeoutMs ?? fallback?.timeoutMs ?? 30_000,
  };
}

const embeddingResponseSchema = z.object({
  data: z
    .array(z.object({ embedding: z.array(z.number()), index: z.number().int().optional() }))
    .min(1),
});

/**
 * Embed a batch of texts, preserving input order.
 *
 * Providers may return `data` out of order; the `index` field is the
 * authority when present, so results are re-sorted rather than trusted
 * positionally — a silent misalignment would attach every correction to the
 * wrong vector.
 */
export async function embedTexts(
  config: EmbeddingProviderConfig,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const url = `${config.baseUrl.replace(/\/+$/, "")}/embeddings`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({ model: config.model, input: texts }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new LLMError(`Could not reach embedding endpoint ${url}: ${detail}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LLMError(
      `Embedding request failed (${response.status}) at ${url} for model ` +
        `"${config.model}": ${body.slice(0, 200)}`,
      response.status,
    );
  }

  const parsed = embeddingResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new LLMError(
      `Embedding endpoint ${url} returned an unexpected response for model "${config.model}".`,
    );
  }

  const rows = [...parsed.data.data];
  if (rows.every((row) => row.index !== undefined)) {
    rows.sort((a, b) => a.index! - b.index!);
  }
  if (rows.length !== texts.length) {
    throw new LLMError(
      `Embedding endpoint returned ${rows.length} vectors for ${texts.length} inputs.`,
    );
  }
  return rows.map((row) => row.embedding);
}

/**
 * Cosine similarity. Returns 0 for a zero vector or a dimension mismatch
 * rather than NaN — a mismatch means the cache was written by a different
 * model, and 0 lets the caller re-embed instead of propagating NaN into a
 * sort comparator.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * The text a correction is indexed by. Trigger keywords come first because
 * they are the curated statement of what the correction is about; the claim
 * itself follows so a correction with no keywords is still findable.
 *
 * The *wrong* pattern is deliberately included alongside the correct answer:
 * a user asking about a fact often phrases it the way the wrong version
 * does, and that is precisely the query we most need to retrieve on.
 */
export function correctionEmbeddingText(correction: {
  trigger: { keywords: string[]; entities: string[] };
  wrongPattern: string;
  correctAnswer: string;
}): string {
  return [
    ...correction.trigger.keywords,
    ...correction.trigger.entities,
    correction.wrongPattern,
    correction.correctAnswer,
  ]
    .filter(Boolean)
    .join(". ");
}
