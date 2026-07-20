import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

export const tenantIsolationScenarioPaths = {
  service: "src/record-service.ts",
  store: "src/record-store.ts",
  types: "src/types.ts",
  ordinaryTest: "tests/service.test.ts",
  acceptanceTest: "tests/tenant-isolation.acceptance.test.ts",
  guidance: "AGENTS.md",
} as const;

export const tenantIsolationProtectedOnlyPaths = [
  tenantIsolationScenarioPaths.guidance,
  tenantIsolationScenarioPaths.acceptanceTest,
] as const;

export const tenantIsolationGuardedPaths = [
  tenantIsolationScenarioPaths.store,
  tenantIsolationScenarioPaths.types,
  tenantIsolationScenarioPaths.acceptanceTest,
] as const;

export const tenantIsolationScenario: ScenarioDefinition = {
  id: "tenant-isolation",
  templateRoot: "demo/tenant-isolation/template",
  protectedOnlyPaths: tenantIsolationProtectedOnlyPaths,
  guardedPaths: tenantIsolationGuardedPaths,
  sproutPath: tenantIsolationScenarioPaths.guidance,
  acceptanceTestPath: tenantIsolationScenarioPaths.acceptanceTest,
  workerOutputSchemaPath:
    "demo/tenant-isolation/schemas/tenant-isolation-worker-output.schema.json",
  ordinaryTestCommand: "pnpm exec vitest run tests/service.test.ts",
  acceptanceTestCommand: "pnpm exec vitest run tests/tenant-isolation.acceptance.test.ts",
};
