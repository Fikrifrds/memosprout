import { readFile, stat } from "node:fs/promises";

import { z } from "zod";

import { atomicWriteFile, Mutex } from "@/lib/store/atomic";

export const outcomeEventSchema = z
  .object({
    type: z.enum([
      "context_served",
      // A query that found nothing while the domain did hold active
      // corrections. Recorded because retrieval failing is silent — the
      // caller receives an empty context, not an error — so without this
      // the most common failure leaves no trace at all.
      "context_missed",
      "block_triggered",
      "correction_approved",
      "correction_deprecated",
    ]),
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
    /** Queries that matched nothing although the domain had corrections. */
    queriesWithoutMatch: z.number().int().nonnegative(),
    /**
     * The most recent of those queries, so the gap is actionable: these
     * are the phrasings your trigger keywords do not cover yet.
     */
    unmatchedQueries: z.array(z.string()),
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
  private readonly writeLock = new Mutex();

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

  /** Oldest events are dropped beyond this cap so the file (rewritten
   * wholesale on each event) cannot grow unboundedly. */
  private static readonly MAX_EVENTS = 50_000;

  private async persist(): Promise<void> {
    if (this.events.length > OutcomeTracker.MAX_EVENTS) {
      this.events = this.events.slice(-OutcomeTracker.MAX_EVENTS);
    }
    await atomicWriteFile(this.filePath, `${JSON.stringify(this.events, null, 2)}\n`);
  }

  private async append(events: OutcomeEvent[]): Promise<void> {
    await this.writeLock.run(async () => {
      this.events.push(...events);
      await this.persist();
    });
  }

  async trackContextServed(correctionIds: string[], domain?: string, query?: string): Promise<void> {
    await this.append(correctionIds.map((correctionId) => outcomeEventSchema.parse({
      type: "context_served",
      correctionId,
      domain,
      query,
      timestamp: new Date().toISOString(),
    })));
  }

  async trackContextMissed(domain?: string, query?: string): Promise<void> {
    await this.append([
      {
        type: "context_missed",
        domain,
        query,
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  async trackBlockTriggered(correctionId: string, domain?: string, query?: string): Promise<void> {
    await this.append([outcomeEventSchema.parse({
      type: "block_triggered",
      correctionId,
      domain,
      query,
      timestamp: new Date().toISOString(),
    })]);
  }

  async trackApproval(correctionId: string, domain?: string): Promise<void> {
    await this.append([outcomeEventSchema.parse({
      type: "correction_approved",
      correctionId,
      domain,
      timestamp: new Date().toISOString(),
    })]);
  }

  async trackDeprecation(correctionId: string, domain?: string): Promise<void> {
    await this.append([outcomeEventSchema.parse({
      type: "correction_deprecated",
      correctionId,
      domain,
      timestamp: new Date().toISOString(),
    })]);
  }

  report(domain?: string): OutcomeReport {
    const filtered = domain
      ? this.events.filter((e) => e.domain === domain)
      : this.events;

    const queries = new Set(
      filtered
        .filter((e) => (e.type === "context_served" || e.type === "context_missed") && e.query)
        .map((e) => e.query),
    );

    const missed = filtered.filter((e) => e.type === "context_missed");
    const unmatchedQueries = [
      ...new Set(
        missed
          .slice()
          .reverse()
          .flatMap((event) => (event.query ? [event.query] : [])),
      ),
    ].slice(0, 10);

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
      queriesWithoutMatch: missed.length,
      unmatchedQueries,
      correctionsServed: filtered.filter((e) => e.type === "context_served").length,
      blocksTriggered: filtered.filter((e) => e.type === "block_triggered").length,
      correctionsApproved: filtered.filter((e) => e.type === "correction_approved").length,
      correctionsDeprecated: filtered.filter((e) => e.type === "correction_deprecated").length,
      topCorrections,
    });
  }
}
