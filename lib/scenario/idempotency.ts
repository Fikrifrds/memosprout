import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

export const idempotencyScenarioPaths = {
  handler: "src/webhook-handler.ts",
  store: "src/payment-store.ts",
  types: "src/types.ts",
  ordinaryTest: "tests/handler.test.ts",
  acceptanceTest: "tests/idempotency.acceptance.test.ts",
  guidance: "AGENTS.md",
} as const;

export const idempotencyProtectedOnlyPaths = [
  idempotencyScenarioPaths.guidance,
  idempotencyScenarioPaths.acceptanceTest,
] as const;

export const idempotencyGuardedPaths = [
  idempotencyScenarioPaths.store,
  idempotencyScenarioPaths.types,
  idempotencyScenarioPaths.acceptanceTest,
] as const;

export function idempotencyTemplateRoot(root: string = process.cwd()): string {
  return join(root, "demo", "idempotency", "template");
}

export async function readHeldOutAcceptanceTest(root: string = process.cwd()): Promise<string> {
  return readFile(
    join(idempotencyTemplateRoot(root), idempotencyScenarioPaths.acceptanceTest),
    "utf8",
  );
}

export const idempotencyScenario: ScenarioDefinition = {
  id: "idempotency",
  templateRoot: "demo/idempotency/template",
  protectedOnlyPaths: idempotencyProtectedOnlyPaths,
  guardedPaths: idempotencyGuardedPaths,
  sproutPath: idempotencyScenarioPaths.guidance,
  acceptanceTestPath: idempotencyScenarioPaths.acceptanceTest,
  workerOutputSchemaPath: "demo/idempotency/schemas/convergence-worker-output.schema.json",
  ordinaryTestCommand: "pnpm exec vitest run tests/handler.test.ts",
  acceptanceTestCommand: "pnpm exec vitest run tests/idempotency.acceptance.test.ts",
};
