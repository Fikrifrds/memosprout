import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

export const outcomeEventSchema = z
  .object({
    type: z.enum(["context_served", "block_triggered", "correction_approved", "correction_deprecated"]),
    correctionId: z.string().optional(),
    domain: z.string().optional(),
    query: z.string().optional(),
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict();

export type OutcomeEvent = z.infer<typeof outcomeEventSchema>;

export const outcomeReportSchema = z
  .object({
    totalQueries: z.number().int().nonnegative(),
    correctionsServed: z.number().int().nonnegative(),
    blocksTriggered: z.number().int().nonnegative(),
    correctionsApproved: z.number().int().nonnegative(),
    correctionsDeprecated: z.number().int().nonnegative(),
    topCorrections: z.array(
      z.object({
        correctionId: z.string(),
        timesServed: z.number().int().nonnegative(),
        timesBlocked: z.number().int().nonnegative(),
      }),
    ),
  })
  .strict();

export type OutcomeReport = z.infer<typeof outcomeReportSchema>;

export class OutcomeTracker {
  private events: OutcomeEvent[] = [];

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    try {
      await stat(this.filePath);
      const raw = JSON.parse(await readFile(this.filePath, "utf8"));
      this.events = z.array(outcomeEventSchema).parse(raw);
    } catch {
      this.events = [];
    }
  }

  private async persist(): Promise<void> {
    await writeFile(this.filePath, `${JSON.stringify(this.events, null, 2)}\n`, "utf8");
  }

  async trackContextServed(correctionIds: string[], domain?: string, query?: string): Promise<void> {
    for (const correctionId of correctionIds) {
      this.events.push(outcomeEventSchema.parse({
        type: "context_served",
        correctionId,
        domain,
        query,
        timestamp: new Date().toISOString(),
      }));
    }
    await this.persist();
  }

  async trackBlockTriggered(correctionId: string, domain?: string, query?: string): Promise<void> {
    this.events.push(outcomeEventSchema.parse({
      type: "block_triggered",
      correctionId,
      domain,
      query,
      timestamp: new Date().toISOString(),
    }));
    await this.persist();
  }

  async trackApproval(correctionId: string, domain?: string): Promise<void> {
    this.events.push(outcomeEventSchema.parse({
      type: "correction_approved",
      correctionId,
      domain,
      timestamp: new Date().toISOString(),
    }));
    await this.persist();
  }

  async trackDeprecation(correctionId: string, domain?: string): Promise<void> {
    this.events.push(outcomeEventSchema.parse({
      type: "correction_deprecated",
      correctionId,
      domain,
      timestamp: new Date().toISOString(),
    }));
    await this.persist();
  }

  report(domain?: string): OutcomeReport {
    const filtered = domain
      ? this.events.filter((e) => e.domain === domain)
      : this.events;

    const queries = new Set(
      filtered.filter((e) => e.type === "context_served" && e.query).map((e) => e.query),
    );

    const perCorrection = new Map<string, { served: number; blocked: number }>();
    for (const event of filtered) {
      if (!event.correctionId) continue;
      const entry = perCorrection.get(event.correctionId) ?? { served: 0, blocked: 0 };
      if (event.type === "context_served") entry.served++;
      if (event.type === "block_triggered") entry.blocked++;
      perCorrection.set(event.correctionId, entry);
    }

    const topCorrections = [...perCorrection.entries()]
      .map(([correctionId, counts]) => ({
        correctionId,
        timesServed: counts.served,
        timesBlocked: counts.blocked,
      }))
      .sort((a, b) => (b.timesServed + b.timesBlocked) - (a.timesServed + a.timesBlocked))
      .slice(0, 10);

    return outcomeReportSchema.parse({
      totalQueries: queries.size,
      correctionsServed: filtered.filter((e) => e.type === "context_served").length,
      blocksTriggered: filtered.filter((e) => e.type === "block_triggered").length,
      correctionsApproved: filtered.filter((e) => e.type === "correction_approved").length,
      correctionsDeprecated: filtered.filter((e) => e.type === "correction_deprecated").length,
      topCorrections,
    });
  }
}
