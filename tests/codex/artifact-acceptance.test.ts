import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertAllowedChangedPaths,
  codexArtifactManifestSchema,
  protectionArtifactPaths,
  protectionRunSchema,
} from "@/lib/codex/artifact";
import {
  assertProtectionAcceptance,
  runProtectionAcceptanceSuite,
} from "@/lib/codex/acceptance";

describe("Codex-generated protection allowlist", () => {
  it("rejects changes outside the exact artifact allowlist", () => {
    expect(() =>
      assertAllowedChangedPaths([...protectionArtifactPaths, "api/openapi.yaml"]),
    ).toThrow("outside the artifact allowlist");
  });

});

const protectionIsPromoted = existsSync(
  join(
    process.cwd(),
    "demo/generated-files/template/scripts/check-generated-files.ts",
  ),
);

describe.skipIf(!protectionIsPromoted)("promoted Codex protection", () => {
  it("catches five invalid mutations and allows eight valid controls", async () => {
    const results = await runProtectionAcceptanceSuite();

    expect(results.invalid).toHaveLength(5);
    expect(results.valid).toHaveLength(8);
    expect(() => assertProtectionAcceptance(results)).not.toThrow();
    expect(results.invalid.every((result) => result.exitCode !== 0)).toBe(true);
    expect(results.valid.every((result) => result.exitCode === 0)).toBe(true);
  }, 30_000);

  it("validates separate live and seeded provenance records", async () => {
    const evidenceRoot = join(process.cwd(), "demo", "generated-files", "evidence");
    const [live, seeded] = await Promise.all([
      readFile(join(evidenceRoot, "live", "protection-run.json"), "utf8"),
      readFile(join(evidenceRoot, "seeded", "protection-run.json"), "utf8"),
    ]);

    expect(protectionRunSchema.parse(JSON.parse(live)).source).toBe("live");
    expect(protectionRunSchema.parse(JSON.parse(seeded)).source).toBe("seeded");
  });

  const validManifest = {
    version: "1" as const,
    sourceSproutId: "sprout_contract_test",
    guidancePath: "AGENTS.md" as const,
    enforcementPath: "scripts/check-generated-files.ts" as const,
    testPath: "tests/generated-policy.test.ts" as const,
    packageScript: "check:generated" as const,
    observational: true as const,
    reusesPureGenerator: true as const,
    comparisonStrategy: "complete_byte_equality" as const,
    changedPaths: [...protectionArtifactPaths],
    summary: "Generated durable guidance and executable enforcement.",
  };

  it("accepts unique changed paths in application validation", () => {
    expect(codexArtifactManifestSchema.parse(validManifest).changedPaths).toEqual(
      protectionArtifactPaths,
    );
  });

  it("rejects duplicate changed paths in application validation", () => {
    expect(() =>
      codexArtifactManifestSchema.parse({
        ...validManifest,
        changedPaths: [
          "AGENTS.md",
          "package.json",
          "scripts/check-generated-files.ts",
          "scripts/check-generated-files.ts",
        ],
      }),
    ).toThrow("each allowlisted artifact exactly once");
  });

  it("rejects an enforcement result that mutates the repository", () => {
    expect(() =>
      assertProtectionAcceptance({
        invalid: [
          {
            id: "mutation-check",
            expected: "reject",
            observed: "reject",
            exitCode: 1,
            repositoryUnchanged: false,
          },
        ],
        valid: [],
      }),
    ).toThrow("repository unchanged false");
  });
});
