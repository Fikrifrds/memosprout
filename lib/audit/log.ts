import { readFile, stat, writeFile } from "node:fs/promises";

import { z } from "zod";

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

  private async persist(): Promise<void> {
    await writeFile(this.filePath, `${JSON.stringify(this.entries, null, 2)}\n`, "utf8");
  }

  async record(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
    this.entries.push(auditEntrySchema.parse({
      ...entry,
      timestamp: new Date().toISOString(),
    }));
    await this.persist();
  }

  history(correctionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.correctionId === correctionId);
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }
}
