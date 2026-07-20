import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OutcomeLedger,
  loadOutcomeLedger,
  saveOutcomeLedger,
} from "@/lib/ledger/ledger";
import { outcomeMetricsForDomain, type OutcomeRecord } from "@/lib/ledger/schema";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

let counter = 0;
function makeRecord(overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  counter += 1;
  return {
    version: "outcome-record-v1",
    outcomeId: `outcome_${counter.toString(16).padStart(16, "0")}`,
    scenario: "idempotency",
    taskId: "idempotency-implement-handler",
    model: "gpt-5.4-mini",
    sproutIds: ["sprout_3f7c9a21b8e04d65"],
    condition: "protected",
    success: true,
    recordedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("OutcomeLedger", () => {
  it("appends and lists records", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord());
    ledger.append(makeRecord());
    expect(ledger.size).toBe(2);
    expect(ledger.list()).toHaveLength(2);
  });

  it("rejects an invalid record", () => {
    const ledger = new OutcomeLedger();
    expect(() => ledger.append(makeRecord({ outcomeId: "bad" }))).toThrow();
  });

  it("queries by scenario, model, condition, and sprout", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "baseline", success: false }));
    ledger.append(makeRecord({ condition: "protected", success: true }));
    ledger.append(
      makeRecord({ scenario: "soft-delete", sproutIds: ["sprout_8c2e5a71d90f3b64"] }),
    );

    expect(ledger.query({ scenario: "idempotency" })).toHaveLength(2);
    expect(ledger.query({ condition: "baseline" })).toHaveLength(1);
    expect(ledger.query({ sproutId: "sprout_8c2e5a71d90f3b64" })).toHaveLength(1);
    expect(ledger.query({ model: "gpt-5.6-sol" })).toHaveLength(0);
  });

  it("computes the success rate with filters", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "baseline", success: false }));
    ledger.append(makeRecord({ condition: "baseline", success: false }));
    ledger.append(makeRecord({ condition: "protected", success: true }));
    ledger.append(makeRecord({ condition: "protected", success: true }));

    expect(ledger.successRate({ condition: "baseline" })).toBe(0);
    expect(ledger.successRate({ condition: "protected" })).toBe(1);
    expect(ledger.successRate()).toBe(0.5);
    expect(ledger.successRate({ scenario: "missing" })).toBe(0);
  });

  it("computes the sprout impact (lift) for a scenario", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "baseline", success: false }));
    ledger.append(makeRecord({ condition: "protected", success: true }));

    const impact = ledger.sproutImpact("idempotency");
    expect(impact.baselineRate).toBe(0);
    expect(impact.protectedRate).toBe(1);
    expect(impact.lift).toBe(1);
  });

  it("summarizes outcomes by scenario", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "baseline", success: false }));
    ledger.append(makeRecord({ condition: "protected", success: true }));
    ledger.append(
      makeRecord({ scenario: "soft-delete", sproutIds: ["sprout_8c2e5a71d90f3b64"] }),
    );

    const summary = ledger.summarizeByScenario();
    expect(summary.map((entry) => entry.scenario)).toEqual(["idempotency", "soft-delete"]);
    const idempotency = summary.find((entry) => entry.scenario === "idempotency");
    expect(idempotency?.records).toBe(2);
    expect(idempotency?.lift).toBe(1);
  });
});

describe("outcome ledger persistence", () => {
  it("round-trips records through save and load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-ledger-"));
    tempDirs.push(dir);
    const path = join(dir, "outcomes.json");

    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "baseline", success: false }));
    ledger.append(makeRecord({ condition: "protected", success: true }));
    await saveOutcomeLedger(ledger, path);

    const loaded = await loadOutcomeLedger(path);
    expect(loaded.list()).toEqual(ledger.list());
    expect(loaded.sproutImpact("idempotency").lift).toBe(1);
  });

  it("loads an empty ledger when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-ledger-"));
    tempDirs.push(dir);
    const loaded = await loadOutcomeLedger(join(dir, "missing.json"));
    expect(loaded.size).toBe(0);
  });
});

describe("domain outcome metrics", () => {
  it("defines outcome metrics per domain", () => {
    expect(outcomeMetricsForDomain("support")).toContain("csat");
    expect(outcomeMetricsForDomain("coding")).toContain("tests_passed");
    expect(outcomeMetricsForDomain("sales")).toContain("conversion");
    expect(outcomeMetricsForDomain("operations")).toContain("sla_violation");
  });

  it("averages a domain metric across matching records", () => {
    const ledger = new OutcomeLedger();
    ledger.append(
      makeRecord({ domain: "support", scenario: "refund", metrics: { csat: 4 } }),
    );
    ledger.append(
      makeRecord({ domain: "support", scenario: "refund", metrics: { csat: 2 } }),
    );
    expect(ledger.averageMetric("csat", { scenario: "refund" })).toBe(3);
  });

  it("returns null when no record carries the metric", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ metrics: { csat: 5 } }));
    expect(ledger.averageMetric("conversion")).toBeNull();
  });
});
