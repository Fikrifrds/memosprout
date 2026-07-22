/**
 * On-disk embedding cache for semantic retrieval.
 *
 * Corrections change rarely and are queried often, so every vector is
 * computed once and reused. Each entry is keyed by correction id and
 * fingerprinted by the hash of the text that produced it, which makes
 * invalidation automatic: edit a correction's keywords or claim and the
 * fingerprint no longer matches, so the entry is re-embedded on the next
 * call. Nothing has to remember to bust the cache.
 *
 * The file is a plain JSON sidecar in the corrections directory. It is
 * derived data — deleting it costs one re-embed, never a correction.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { atomicWriteFile, Mutex } from "@/lib/store/atomic";
import {
  cosineSimilarity,
  embedTexts,
  type EmbeddingProviderConfig,
} from "@/lib/llm/embedding";

interface CacheEntry {
  /** sha256 of the embedded text — the invalidation signal. */
  fingerprint: string;
  /** Recorded so a model switch invalidates rather than silently mixes vector spaces. */
  model: string;
  vector: number[];
}

function fingerprintText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export class EmbeddingIndex {
  private entries = new Map<string, CacheEntry>();
  private loaded = false;
  private readonly writeLock = new Mutex();

  constructor(
    private readonly filePath: string,
    private readonly config: EmbeddingProviderConfig,
  ) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [id, entry] of Object.entries(parsed)) {
        // Tolerate a hand-edited or partially written file: a malformed
        // entry is dropped and re-embedded, never allowed to crash startup.
        if (
          typeof entry?.fingerprint === "string" &&
          typeof entry?.model === "string" &&
          Array.isArray(entry?.vector)
        ) {
          this.entries.set(id, entry);
        }
      }
    } catch {
      // No cache yet, or unreadable — start empty.
    }
  }

  private async persist(): Promise<void> {
    const payload = Object.fromEntries(this.entries);
    await this.writeLock.run(async () => {
      await atomicWriteFile(this.filePath, JSON.stringify(payload));
    });
  }

  /**
   * Return the cached vector for each item, embedding any that are missing
   * or stale in a single batched request. Order matches the input.
   */
  private async vectorsFor(
    items: Array<{ id: string; text: string }>,
  ): Promise<Map<string, number[]>> {
    await this.load();

    const stale = items.filter((item) => {
      const entry = this.entries.get(item.id);
      return (
        !entry ||
        entry.model !== this.config.model ||
        entry.fingerprint !== fingerprintText(item.text)
      );
    });

    if (stale.length > 0) {
      const vectors = await embedTexts(
        this.config,
        stale.map((item) => item.text),
      );
      stale.forEach((item, index) => {
        this.entries.set(item.id, {
          fingerprint: fingerprintText(item.text),
          model: this.config.model,
          vector: vectors[index]!,
        });
      });
      await this.persist();
    }

    const result = new Map<string, number[]>();
    for (const item of items) {
      const entry = this.entries.get(item.id);
      if (entry) result.set(item.id, entry.vector);
    }
    return result;
  }

  /**
   * Rank `candidates` against `query` by cosine similarity, returning those
   * at or above `threshold`, best first.
   *
   * Costs one embedding call for the query plus, on a cold cache, one
   * batched call for the candidates. On a warm cache it is one call.
   */
  async rank(
    query: string,
    candidates: Array<{ id: string; text: string }>,
    threshold: number,
  ): Promise<Array<{ id: string; score: number }>> {
    if (candidates.length === 0) return [];

    const [queryVector] = await embedTexts(this.config, [query]);
    if (!queryVector) return [];

    const vectors = await this.vectorsFor(candidates);

    return candidates
      .map((candidate) => {
        const vector = vectors.get(candidate.id);
        return {
          id: candidate.id,
          score: vector ? cosineSimilarity(queryVector, vector) : 0,
        };
      })
      .filter((scored) => scored.score >= threshold)
      .sort((a, b) => b.score - a.score);
  }
}
