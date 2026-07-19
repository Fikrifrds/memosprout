import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
