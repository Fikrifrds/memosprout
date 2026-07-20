import { readFile, stat, writeFile } from "node:fs/promises";

import { z } from "zod";

import { outcomeRecordSchema, type OutcomeRecord } from "@/lib/ledger/schema";

export interface OutcomeFilter {
  scenario?: string;
  sproutId?: string;
  model?: string;
  condition?: "baseline" | "protected";
}

export interface SproutImpact {
  baselineRate: number;
  protectedRate: number;
  lift: number;
}

export interface ScenarioOutcomeSummary extends SproutImpact {
  scenario: string;
  records: number;
}

export class OutcomeLedger {
  private readonly records: OutcomeRecord[] = [];

  append(record: OutcomeRecord): void {
    this.records.push(outcomeRecordSchema.parse(record));
  }

  list(): OutcomeRecord[] {
    return [...this.records];
  }

  get size(): number {
    return this.records.length;
  }

  query(filter: OutcomeFilter = {}): OutcomeRecord[] {
    return this.records.filter((record) => {
      if (filter.scenario !== undefined && record.scenario !== filter.scenario) return false;
      if (filter.model !== undefined && record.model !== filter.model) return false;
      if (filter.condition !== undefined && record.condition !== filter.condition) return false;
      if (filter.sproutId !== undefined && !record.sproutIds.includes(filter.sproutId)) {
        return false;
      }
      return true;
    });
  }

  successRate(filter: OutcomeFilter = {}): number {
    const records = this.query(filter);
    if (records.length === 0) return 0;
    return records.filter((record) => record.success).length / records.length;
  }

  sproutImpact(scenario: string): SproutImpact {
    const baselineRate = this.successRate({ scenario, condition: "baseline" });
    const protectedRate = this.successRate({ scenario, condition: "protected" });
    return { baselineRate, protectedRate, lift: protectedRate - baselineRate };
  }

  summarizeByScenario(): ScenarioOutcomeSummary[] {
    const scenarios = new Set(this.records.map((record) => record.scenario));
    return [...scenarios]
      .sort()
      .map((scenario) => ({
        scenario,
        records: this.query({ scenario }).length,
        ...this.sproutImpact(scenario),
      }));
  }

  averageMetric(metricName: string, filter: OutcomeFilter = {}): number | null {
    const values = this.query(filter)
      .map((record) => record.metrics?.[metricName])
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}

export async function loadOutcomeLedger(path: string): Promise<OutcomeLedger> {
  const ledger = new OutcomeLedger();
  try {
    await stat(path);
  } catch {
    return ledger;
  }
  const records = z.array(outcomeRecordSchema).parse(JSON.parse(await readFile(path, "utf8")));
  for (const record of records) {
    ledger.append(record);
  }
  return ledger;
}

export async function saveOutcomeLedger(ledger: OutcomeLedger, path: string): Promise<void> {
  await writeFile(path, `${JSON.stringify(ledger.list(), null, 2)}\n`, "utf8");
}
