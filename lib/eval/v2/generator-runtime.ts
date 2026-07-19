export const generatorRuntimeVersions = {
  "phase4-v2-generator-runtime-v1": "tsx scripts/generate-client.ts",
  "phase4-v2-generator-runtime-v2": "node --import tsx scripts/generate-client.ts",
} as const;

export type GeneratorRuntimeVersion = keyof typeof generatorRuntimeVersions;

export const historicalGeneratorRuntimeVersion: GeneratorRuntimeVersion =
  "phase4-v2-generator-runtime-v1";

export const correctedGeneratorRuntimeVersion: GeneratorRuntimeVersion =
  "phase4-v2-generator-runtime-v2";

export function assertExplicitGeneratorRuntimeVersion(
  version: unknown,
): GeneratorRuntimeVersion {
  if (
    version !== historicalGeneratorRuntimeVersion &&
    version !== correctedGeneratorRuntimeVersion
  ) {
    throw new Error(
      "A repository materialization requires an explicit generator runtime version; no default is applied.",
    );
  }
  return version as GeneratorRuntimeVersion;
}

export function applyGeneratorRuntime(
  scripts: Record<string, string>,
  version: GeneratorRuntimeVersion,
): Record<string, string> {
  if (scripts["generate:api"] !== generatorRuntimeVersions[historicalGeneratorRuntimeVersion]) {
    throw new Error("Repository generator script differs from the historical runtime baseline.");
  }
  return { ...scripts, "generate:api": generatorRuntimeVersions[version] };
}
