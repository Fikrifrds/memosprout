import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteFile, Mutex } from "@/lib/store/atomic";
import { normalizeText } from "@/lib/correction/matching";

import {
  correctionFilename,
  parseCorrectionMarkdown,
  renderCorrectionMarkdown,
} from "@/lib/correction/render";
import {
  correctionRecordSchema,
  type CorrectionFilter,
  type CorrectionRecord,
} from "@/lib/correction/schema";

export class CorrectionStore {
  private readonly corrections = new Map<string, CorrectionRecord>();
  private readonly writeLock = new Mutex();
  private initialized = false;

  constructor(private readonly directory: string) {}

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    if (!this.initialized) {
      await this.reload();
      this.initialized = true;
    }
  }

  async reload(): Promise<void> {
    this.corrections.clear();
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const markdown = await readFile(join(this.directory, file), "utf8");
      try {
        const record = parseCorrectionMarkdown(markdown);
        this.corrections.set(record.correctionId, record);
      } catch {
        // Skip files that do not parse as valid corrections.
      }
    }
  }

  async save(correction: CorrectionRecord): Promise<void> {
    const record = correctionRecordSchema.parse(correction);
    await this.writeLock.run(async () => {
      await mkdir(this.directory, { recursive: true });
      const markdown = renderCorrectionMarkdown(record);
      await atomicWriteFile(join(this.directory, correctionFilename(record.correctionId)), markdown);
      this.corrections.set(record.correctionId, record);
    });
  }

  get(correctionId: string): CorrectionRecord | undefined {
    return this.corrections.get(correctionId);
  }

  list(filter: CorrectionFilter = {}): CorrectionRecord[] {
    let results = [...this.corrections.values()];
    if (filter.status !== undefined) {
      results = results.filter((record) => record.status === filter.status);
    }
    if (filter.domain !== undefined) {
      results = results.filter((record) => record.domain === filter.domain);
    }
    if (filter.keyword !== undefined) {
      const keyword = filter.keyword.toLowerCase();
      results = results.filter(
        (record) =>
          record.trigger.keywords.some((k) => k.toLowerCase().includes(keyword)) ||
          record.wrongPattern.toLowerCase().includes(keyword) ||
          record.correctAnswer.toLowerCase().includes(keyword),
      );
    }
    return results.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  get size(): number {
    return this.corrections.size;
  }

  match(query: string, domain?: string): CorrectionRecord[] {
    const normalizedQuery = normalizeText(query);
    const tokens = normalizedQuery.split(" ");
    const tokenSet = new Set(tokens);
    const active = this.list({ status: "active", domain });

    return active
      .map((correction) => {
        let score = 0;
        for (const keyword of correction.trigger.keywords) {
          const needle = keyword.toLowerCase();
          // Short keywords must match a token exactly — substring matching
          // on 1-2 char keywords would match nearly every query.
          const hit =
            needle.length >= 3
              ? tokens.some((token) => token.includes(needle))
              : tokenSet.has(needle);
          if (hit) score += 2;
        }
        for (const entity of correction.trigger.entities) {
          if (normalizedQuery.includes(entity.toLowerCase())) {
            score += 3;
          }
        }
        // Content fallback: corrections stay findable even when trigger
        // keywords were never set at capture time. Requires at least two
        // overlapping tokens so a single shared word is not enough.
        const contentTokens = new Set(
          `${normalizeText(correction.wrongPattern)} ${normalizeText(correction.correctAnswer)}`
            .split(" ")
            .filter((token) => token.length >= 3),
        );
        let contentHits = 0;
        for (const token of tokenSet) {
          if (token.length >= 3 && contentTokens.has(token)) contentHits += 1;
        }
        if (contentHits >= 2) score += contentHits;
        return { correction, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.correction);
  }
}
