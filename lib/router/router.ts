import { z } from "zod";

import type { OutcomeLedger } from "@/lib/ledger/ledger";
import {
  type ModelTier,
  cheapestModel,
  findModel,
  modelCatalog,
  mostCapableModel,
} from "@/lib/router/models";

export interface RoutingPolicy {
  minimumReliability: number;
  minimumSamples: number;
}

export const defaultRoutingPolicy: RoutingPolicy = {
  minimumReliability: 0.8,
  minimumSamples: 3,
};

export const routingDecisionSchema = z
  .object({
    scenario: z.string().min(1),
    model: z.string().min(1),
    tier: z.enum(["cheap", "frontier"]),
    withSprout: z.boolean(),
    reason: z.enum([
      "pinned",
      "cheap-reliable",
      "escalate-unreliable",
      "escalate-insufficient-data",
      "no-sprout-available",
    ]),
    protectedRate: z.number().min(0).max(1).nullable(),
    samples: z.number().int().nonnegative(),
  })
  .strict();

export type RoutingDecision = z.infer<typeof routingDecisionSchema>;

export interface RouteTaskOptions {
  policy?: RoutingPolicy;
  catalog?: ModelTier[];
  hasSprout?: boolean;
  /**
   * Pin an explicit model. When set, the router respects the choice and does
   * not auto-route on cost — the predictable default for users who want to
   * know exactly which model handles their task.
   */
  pinnedModel?: string;
}

export function routeTask(
  ledger: OutcomeLedger,
  scenario: string,
  options: RouteTaskOptions = {},
): RoutingDecision {
  const policy = options.policy ?? defaultRoutingPolicy;
  const catalog = options.catalog ?? modelCatalog;
  const cheap = cheapestModel(catalog);
  const frontier = mostCapableModel(catalog);
  const hasSprout = options.hasSprout ?? true;

  if (options.pinnedModel !== undefined) {
    const pinned = findModel(options.pinnedModel, catalog);
    const tier = pinned?.tier ?? "frontier";
    const samples = ledger.query({ scenario, condition: "protected" }).length;
    const protectedRate =
      samples > 0 ? ledger.successRate({ scenario, condition: "protected" }) : null;
    return {
      scenario,
      model: options.pinnedModel,
      tier,
      withSprout: hasSprout && tier === "cheap",
      reason: "pinned",
      protectedRate,
      samples,
    };
  }

  if (!hasSprout) {
    return {
      scenario,
      model: frontier.id,
      tier: "frontier",
      withSprout: false,
      reason: "no-sprout-available",
      protectedRate: null,
      samples: 0,
    };
  }

  const samples = ledger.query({ scenario, condition: "protected" }).length;
  const protectedRate = samples > 0 ? ledger.successRate({ scenario, condition: "protected" }) : null;

  if (samples < policy.minimumSamples) {
    return {
      scenario,
      model: frontier.id,
      tier: "frontier",
      withSprout: false,
      reason: "escalate-insufficient-data",
      protectedRate,
      samples,
    };
  }

  if ((protectedRate ?? 0) >= policy.minimumReliability) {
    return {
      scenario,
      model: cheap.id,
      tier: "cheap",
      withSprout: true,
      reason: "cheap-reliable",
      protectedRate,
      samples,
    };
  }

  return {
    scenario,
    model: frontier.id,
    tier: "frontier",
    withSprout: false,
    reason: "escalate-unreliable",
    protectedRate,
    samples,
  };
}

export interface PortfolioRouting {
  decisions: RoutingDecision[];
  totalRelativeCost: number;
  alwaysFrontierCost: number;
  savings: number;
}

export interface RoutePortfolioOptions extends RouteTaskOptions {
  hasSproutFor?: (scenario: string) => boolean;
}

export function routePortfolio(
  ledger: OutcomeLedger,
  scenarios: string[],
  options: RoutePortfolioOptions = {},
): PortfolioRouting {
  const catalog = options.catalog ?? modelCatalog;
  const frontier = mostCapableModel(catalog);
  const decisions = scenarios.map((scenario) =>
    routeTask(ledger, scenario, {
      ...options,
      hasSprout: options.hasSproutFor?.(scenario) ?? options.hasSprout ?? true,
    }),
  );
  const totalRelativeCost = decisions.reduce((sum, decision) => {
    const model = findModel(decision.model, catalog);
    return sum + (model?.relativeCost ?? frontier.relativeCost);
  }, 0);
  const alwaysFrontierCost = scenarios.length * frontier.relativeCost;
  return {
    decisions,
    totalRelativeCost,
    alwaysFrontierCost,
    savings: alwaysFrontierCost - totalRelativeCost,
  };
}
