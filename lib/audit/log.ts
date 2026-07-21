import { readFile, stat } from "node:fs/promises";

import { z } from "zod";

import { atomicWriteFile, Mutex } from "@/lib/store/atomic";

export const auditEntrySchema = z
  .object({
    correctionId: z.string(),
    action: z.enum([
      "created",
      "confirmed",
      "approved",
      "activated",
      "quarantined",
      "deprecated",
      "revalidated",
    ]),
    actor: z.string(),
    reason: z.string().default(""),
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict();

export type AuditEntry = z.infer<typeof auditEntrySchema>;

export class AuditLog {
  private entries: AuditEntry[] = [];
  private readonly writeLock = new Mutex();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    try {
      await stat(this.filePath);
      const raw = JSON.parse(await readFile(this.filePath, "utf8"));
      this.entries = z.array(auditEntrySchema).parse(raw);
    } catch {
      this.entries = [];
    }
  }

  /** Oldest entries are dropped beyond this cap so the file (rewritten
   * wholesale on each record) cannot grow unboundedly. */
  private static readonly MAX_ENTRIES = 50_000;

  private async persist(): Promise<void> {
    if (this.entries.length > AuditLog.MAX_ENTRIES) {
      this.entries = this.entries.slice(-AuditLog.MAX_ENTRIES);
    }
    await atomicWriteFile(this.filePath, `${JSON.stringify(this.entries, null, 2)}\n`);
  }

  async record(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
    await this.writeLock.run(async () => {
      this.entries.push(auditEntrySchema.parse({
        ...entry,
        timestamp: new Date().toISOString(),
      }));
      await this.persist();
    });
  }

  history(correctionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.correctionId === correctionId);
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }
}
