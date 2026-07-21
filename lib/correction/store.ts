import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
    await mkdir(this.directory, { recursive: true });
    const markdown = renderCorrectionMarkdown(record);
    await writeFile(join(this.directory, correctionFilename(record.correctionId)), markdown, "utf8");
    this.corrections.set(record.correctionId, record);
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
    const tokens = query.toLowerCase().split(/\s+/);
    const active = this.list({ status: "active", domain });

    return active
      .map((correction) => {
        let score = 0;
        for (const keyword of correction.trigger.keywords) {
          if (tokens.some((token) => token.includes(keyword.toLowerCase()))) {
            score += 2;
          }
        }
        for (const entity of correction.trigger.entities) {
          if (query.toLowerCase().includes(entity.toLowerCase())) {
            score += 3;
          }
        }
        return { correction, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.correction);
  }
}
