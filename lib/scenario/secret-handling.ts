import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

export const secretHandlingScenarioPaths = {
  service: "src/service.ts",
  secrets: "src/secrets.ts",
  types: "src/types.ts",
  ordinaryTest: "tests/service.test.ts",
  acceptanceTest: "tests/secret-handling.acceptance.test.ts",
  guidance: "AGENTS.md",
} as const;

export const secretHandlingProtectedOnlyPaths = [
  secretHandlingScenarioPaths.guidance,
  secretHandlingScenarioPaths.acceptanceTest,
] as const;

export const secretHandlingGuardedPaths = [
  secretHandlingScenarioPaths.secrets,
  secretHandlingScenarioPaths.types,
  secretHandlingScenarioPaths.acceptanceTest,
] as const;

export const secretHandlingScenario: ScenarioDefinition = {
  id: "secret-handling",
  templateRoot: "demo/secret-handling/template",
  protectedOnlyPaths: secretHandlingProtectedOnlyPaths,
  guardedPaths: secretHandlingGuardedPaths,
  sproutPath: secretHandlingScenarioPaths.guidance,
  acceptanceTestPath: secretHandlingScenarioPaths.acceptanceTest,
  workerOutputSchemaPath:
    "demo/secret-handling/schemas/secret-handling-worker-output.schema.json",
  ordinaryTestCommand: "pnpm exec vitest run tests/service.test.ts",
  acceptanceTestCommand: "pnpm exec vitest run tests/secret-handling.acceptance.test.ts",
};
