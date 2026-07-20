import { OutcomeLedger, type TokenImpact } from "@/lib/ledger/ledger";
import { TOKENS_TO_SUCCESS, type OutcomeRecord } from "@/lib/ledger/schema";
import { seedDemoRegistry } from "@/lib/mcp/seed";
import { routePortfolio, type PortfolioRouting } from "@/lib/router/router";
import type { ScenarioOutcomeSummary } from "@/lib/ledger/ledger";
import type { ValidatedSprout } from "@/lib/delivery/registry";

export interface ScenarioInfo {
  id: string;
  title: string;
  trap: string;
  guidance: string;
}

export const scenarioCatalog: ScenarioInfo[] = [
  {
    id: "idempotency",
    title: "Payment idempotency",
    trap: "Double-charging on duplicate callbacks and downgrading terminal order states.",
    guidance: "Use the provider event id as the idempotency key and protect terminal states.",
  },
  {
    id: "soft-delete",
    title: "User soft-delete",
    trap: "Hard-deleting records and losing the audit trail.",
    guidance: "Soft-delete by setting deletedAt; never hard-delete a user record.",
  },
  {
    id: "tenant-isolation",
    title: "Tenant isolation",
    trap: "Returning every record regardless of tenant, leaking data across tenants.",
    guidance: "Scope every query by tenantId; never return another tenant's records.",
  },
  {
    id: "secret-handling",
    title: "Secret handling",
    trap: "Logging or returning the raw API key.",
    guidance: "Mask secrets with maskSecret; never emit a raw secret.",
  },
];

export interface ScenarioTokenImpact extends TokenImpact {
  scenario: string;
}

export interface DashboardData {
  scenarios: ScenarioInfo[];
  sprouts: ValidatedSprout[];
  scenarioSummaries: ScenarioOutcomeSummary[];
  tokenImpacts: ScenarioTokenImpact[];
  routing: PortfolioRouting;
}

export function buildDashboardData(): DashboardData {
  const registry = seedDemoRegistry();
  const ledger = new OutcomeLedger();
  let counter = 0;
  const record = (overrides: Partial<OutcomeRecord>): OutcomeRecord => {
    counter += 1;
    return {
      version: "outcome-record-v1",
      outcomeId: `outcome_${counter.toString(16).padStart(16, "0")}`,
      scenario: "idempotency",
      taskId: "implement-handler",
      model: "gpt-5.4-mini",
      sproutIds: ["sprout_3f7c9a21b8e04d65"],
      condition: "protected",
      success: true,
      recordedAt: "2026-07-20T00:00:00.000Z",
      ...overrides,
    };
  };

  // Illustrative demo values: baseline runs are expensive because failures force retries;
  // protected runs succeed on the first try.
  for (let i = 0; i < 3; i += 1) {
    ledger.append(
      record({
        scenario: "idempotency",
        condition: "baseline",
        success: false,
        metrics: { [TOKENS_TO_SUCCESS]: 420_000 },
      }),
    );
    ledger.append(
      record({
        scenario: "idempotency",
        condition: "protected",
        success: true,
        metrics: { [TOKENS_TO_SUCCESS]: 60_000 },
      }),
    );
  }
  for (let i = 0; i < 3; i += 1) {
    ledger.append(
      record({
        scenario: "soft-delete",
        sproutIds: ["sprout_8c2e5a71d90f3b64"],
        condition: "baseline",
        success: false,
        metrics: { [TOKENS_TO_SUCCESS]: 310_000 },
      }),
    );
    ledger.append(
      record({
        scenario: "soft-delete",
        sproutIds: ["sprout_8c2e5a71d90f3b64"],
        condition: "protected",
        success: true,
        metrics: { [TOKENS_TO_SUCCESS]: 55_000 },
      }),
    );
  }

  const demoScenarios = ["idempotency", "soft-delete"];
  return {
    scenarios: scenarioCatalog,
    sprouts: registry.list(),
    scenarioSummaries: ledger.summarizeByScenario(),
    tokenImpacts: demoScenarios.flatMap((scenario) => {
      const impact = ledger.tokenImpact(scenario);
      return impact === null ? [] : [{ scenario, ...impact }];
    }),
    routing: routePortfolio(ledger, demoScenarios),
  };
}
