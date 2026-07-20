import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

export const apiConventionsScenarioPaths = {
  target: "src/routes/invoices.ts",
  guidance: "AGENTS.md",
  ordinaryTest: "tests/invoices.test.ts",
  acceptanceTest: "tests/invoices.acceptance.test.ts",
  fixtures: "src/lib/fixtures.ts",
  db: "src/lib/db.ts",
  pagination: "src/lib/pagination.ts",
  response: "src/lib/response.ts",
} as const;

export const apiConventionsProtectedOnlyPaths = [
  apiConventionsScenarioPaths.guidance,
  apiConventionsScenarioPaths.acceptanceTest,
] as const;

/**
 * Shared library and fixture files the worker must not rewrite to make the task pass.
 * The task is to implement the route, not to change the conventions it must follow.
 */
export const apiConventionsGuardedPaths = [
  apiConventionsScenarioPaths.acceptanceTest,
  apiConventionsScenarioPaths.fixtures,
  apiConventionsScenarioPaths.db,
  apiConventionsScenarioPaths.pagination,
  apiConventionsScenarioPaths.response,
] as const;

export const apiConventionsScenario: ScenarioDefinition = {
  id: "api-conventions",
  templateRoot: "demo/api-conventions/template",
  protectedOnlyPaths: apiConventionsProtectedOnlyPaths,
  guardedPaths: apiConventionsGuardedPaths,
  sproutPath: apiConventionsScenarioPaths.guidance,
  acceptanceTestPath: apiConventionsScenarioPaths.acceptanceTest,
  workerOutputSchemaPath: "demo/api-conventions/schemas/api-conventions-worker-output.schema.json",
  ordinaryTestCommand: "pnpm exec vitest run tests/invoices.test.ts",
  acceptanceTestCommand: "pnpm exec vitest run tests/invoices.acceptance.test.ts",
};
