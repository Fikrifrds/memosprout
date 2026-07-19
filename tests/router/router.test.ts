import { describe, expect, it } from "vitest";

import { OutcomeLedger } from "@/lib/ledger/ledger";
import type { OutcomeRecord } from "@/lib/ledger/schema";
import { routePortfolio, routeTask } from "@/lib/router/router";

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

function reliableLedger(): OutcomeLedger {
  const ledger = new OutcomeLedger();
  for (let i = 0; i < 3; i += 1) {
    ledger.append(makeRecord({ condition: "protected", success: true }));
  }
  return ledger;
}

function unreliableLedger(): OutcomeLedger {
  const ledger = new OutcomeLedger();
  for (let i = 0; i < 3; i += 1) {
    ledger.append(makeRecord({ condition: "protected", success: false }));
  }
  return ledger;
}

describe("routeTask", () => {
  it("routes to the cheap model with the sprout when it is reliable", () => {
    const decision = routeTask(reliableLedger(), "idempotency");
    expect(decision.reason).toBe("cheap-reliable");
    expect(decision.model).toBe("gpt-5.4-mini");
    expect(decision.tier).toBe("cheap");
    expect(decision.withSprout).toBe(true);
    expect(decision.protectedRate).toBe(1);
  });

  it("escalates to the frontier model when the cheap model is unreliable", () => {
    const decision = routeTask(unreliableLedger(), "idempotency");
    expect(decision.reason).toBe("escalate-unreliable");
    expect(decision.model).toBe("gpt-5.6-sol");
    expect(decision.tier).toBe("frontier");
    expect(decision.withSprout).toBe(false);
  });

  it("escalates when there is insufficient outcome data", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "protected", success: true }));
    const decision = routeTask(ledger, "idempotency");
    expect(decision.reason).toBe("escalate-insufficient-data");
    expect(decision.model).toBe("gpt-5.6-sol");
    expect(decision.samples).toBe(1);
  });

  it("escalates when no sprout is available for the scenario", () => {
    const decision = routeTask(reliableLedger(), "idempotency", { hasSprout: false });
    expect(decision.reason).toBe("no-sprout-available");
    expect(decision.model).toBe("gpt-5.6-sol");
    expect(decision.withSprout).toBe(false);
  });

  it("respects a custom reliability threshold", () => {
    const ledger = new OutcomeLedger();
    ledger.append(makeRecord({ condition: "protected", success: true }));
    ledger.append(makeRecord({ condition: "protected", success: true }));
    ledger.append(makeRecord({ condition: "protected", success: false }));
    // protectedRate = 2/3 ~= 0.667
    const strict = routeTask(ledger, "idempotency", {
      policy: { minimumReliability: 0.8, minimumSamples: 3 },
    });
    expect(strict.reason).toBe("escalate-unreliable");
    const relaxed = routeTask(ledger, "idempotency", {
      policy: { minimumReliability: 0.6, minimumSamples: 3 },
    });
    expect(relaxed.reason).toBe("cheap-reliable");
  });

  it("respects a pinned cheap model and keeps the sprout", () => {
    const decision = routeTask(reliableLedger(), "idempotency", {
      pinnedModel: "gpt-5.4-mini",
    });
    expect(decision.reason).toBe("pinned");
    expect(decision.model).toBe("gpt-5.4-mini");
    expect(decision.tier).toBe("cheap");
    expect(decision.withSprout).toBe(true);
  });

  it("respects a pinned frontier model without auto-routing", () => {
    // Even though the cheap model is reliable, pinning frontier stays on frontier.
    const decision = routeTask(reliableLedger(), "idempotency", {
      pinnedModel: "gpt-5.6-sol",
    });
    expect(decision.reason).toBe("pinned");
    expect(decision.model).toBe("gpt-5.6-sol");
    expect(decision.tier).toBe("frontier");
    expect(decision.withSprout).toBe(false);
  });
});

describe("routePortfolio", () => {
  it("routes each scenario and reports cost savings versus always-frontier", () => {
    const ledger = new OutcomeLedger();
    for (let i = 0; i < 3; i += 1) {
      ledger.append(makeRecord({ scenario: "idempotency", condition: "protected", success: true }));
      ledger.append(makeRecord({ scenario: "soft-delete", condition: "protected", success: false }));
    }

    const portfolio = routePortfolio(ledger, ["idempotency", "soft-delete"]);
    expect(portfolio.decisions).toHaveLength(2);

    const idempotency = portfolio.decisions.find((d) => d.scenario === "idempotency");
    const softDelete = portfolio.decisions.find((d) => d.scenario === "soft-delete");
    expect(idempotency?.reason).toBe("cheap-reliable");
    expect(softDelete?.reason).toBe("escalate-unreliable");

    // cheap (1) + frontier (10) = 11, versus always-frontier 2 * 10 = 20
    expect(portfolio.totalRelativeCost).toBe(11);
    expect(portfolio.alwaysFrontierCost).toBe(20);
    expect(portfolio.savings).toBe(9);
  });
});
