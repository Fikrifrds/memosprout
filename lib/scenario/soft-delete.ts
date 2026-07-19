import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

export const softDeleteScenarioPaths = {
  service: "src/user-service.ts",
  store: "src/user-store.ts",
  types: "src/types.ts",
  ordinaryTest: "tests/service.test.ts",
  acceptanceTest: "tests/soft-delete.acceptance.test.ts",
  guidance: "AGENTS.md",
} as const;

export const softDeleteProtectedOnlyPaths = [
  softDeleteScenarioPaths.guidance,
  softDeleteScenarioPaths.acceptanceTest,
] as const;

export const softDeleteGuardedPaths = [
  softDeleteScenarioPaths.store,
  softDeleteScenarioPaths.types,
  softDeleteScenarioPaths.acceptanceTest,
] as const;

export const softDeleteScenario: ScenarioDefinition = {
  id: "soft-delete",
  templateRoot: "demo/soft-delete/template",
  protectedOnlyPaths: softDeleteProtectedOnlyPaths,
  guardedPaths: softDeleteGuardedPaths,
  sproutPath: softDeleteScenarioPaths.guidance,
  acceptanceTestPath: softDeleteScenarioPaths.acceptanceTest,
  workerOutputSchemaPath: "demo/soft-delete/schemas/soft-delete-worker-output.schema.json",
  ordinaryTestCommand: "pnpm exec vitest run tests/service.test.ts",
  acceptanceTestCommand: "pnpm exec vitest run tests/soft-delete.acceptance.test.ts",
};
