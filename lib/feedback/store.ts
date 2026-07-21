import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { feedbackRecordSchema, type FeedbackRecord, type FeedbackSummary } from "@/lib/feedback/schema";

export class FeedbackStore {
  private readonly records = new Map<string, FeedbackRecord>();
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
    this.records.clear();
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(await readFile(join(this.directory, file), "utf8"));
        const record = feedbackRecordSchema.parse(raw);
        this.records.set(record.feedbackId, record);
      } catch {
        // Skip invalid files.
      }
    }
  }

  async save(record: FeedbackRecord): Promise<void> {
    const validated = feedbackRecordSchema.parse(record);
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      join(this.directory, `${validated.feedbackId}.json`),
      `${JSON.stringify(validated, null, 2)}\n`,
      "utf8",
    );
    this.records.set(validated.feedbackId, validated);
  }

  get(feedbackId: string): FeedbackRecord | undefined {
    return this.records.get(feedbackId);
  }

  list(filter: { domain?: string; status?: string; topic?: string } = {}): FeedbackRecord[] {
    let results = [...this.records.values()];
    if (filter.domain) results = results.filter((r) => r.domain === filter.domain);
    if (filter.status) results = results.filter((r) => r.status === filter.status);
    if (filter.topic) {
      const topic = filter.topic.toLowerCase();
      results = results.filter((r) => r.topic.toLowerCase().includes(topic));
    }
    return results.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  summarize(domain?: string): FeedbackSummary[] {
    const records = this.list({ domain, status: "pending" });
    const byTopic = new Map<string, FeedbackRecord[]>();

    for (const record of records) {
      const key = record.topic.toLowerCase();
      const existing = byTopic.get(key) ?? [];
      existing.push(record);
      byTopic.set(key, existing);
    }

    return [...byTopic.entries()]
      .map(([topic, records]) => ({
        topic: records[0].topic,
        count: records.length,
        latestMessage: records[0].message,
        latestAt: records[0].submittedAt,
        status: "pending" as const,
      }))
      .sort((a, b) => b.count - a.count);
  }

  get size(): number {
    return this.records.size;
  }
}
