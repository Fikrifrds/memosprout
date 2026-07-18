import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { codexArtifactManifestSchema } from "@/lib/codex/artifact";

describe("Phase 3 artifact compiler contract", () => {
  it("requires observational non-mutating enforcement", async () => {
    const prompt = await readFile(
      join(process.cwd(), "demo/generated-files/prompts/artifact.md"),
      "utf8",
    );

    expect(prompt).toContain("observational, non-mutating executable enforcement");
    expect(prompt).toContain("compare it byte-for-byte");
    expect(prompt).toContain("must never overwrite, regenerate, repair, normalize");
    expect(prompt).toContain("leave the repository unchanged on success and failure");
    expect(prompt).toContain("imports the existing pure generator/rendering logic");
    expect(prompt).toContain("compare the complete strings or Buffers for exact byte equality");
    expect(prompt).toContain("Failure case: `direct-generated-append`");
  });

  it("requires the observational attestation in application validation", () => {
    const base = {
      version: "1",
      sourceSproutId: "sprout_contract_test",
      guidancePath: "AGENTS.md",
      enforcementPath: "scripts/check-generated-files.ts",
      testPath: "tests/generated-policy.test.ts",
      packageScript: "check:generated",
      reusesPureGenerator: true,
      comparisonStrategy: "complete_byte_equality",
      changedPaths: [
        "AGENTS.md",
        "package.json",
        "scripts/check-generated-files.ts",
        "tests/generated-policy.test.ts",
      ],
      summary: "Generated protection.",
    };

    expect(() =>
      codexArtifactManifestSchema.parse({ ...base, observational: false }),
    ).toThrow();
    expect(
      codexArtifactManifestSchema.parse({ ...base, observational: true })
        .observational,
    ).toBe(true);
  });

  it("requires pure-generator reuse and complete byte equality", () => {
    const manifest = {
      version: "1",
      sourceSproutId: "sprout_contract_test",
      guidancePath: "AGENTS.md",
      enforcementPath: "scripts/check-generated-files.ts",
      testPath: "tests/generated-policy.test.ts",
      packageScript: "check:generated",
      observational: true,
      reusesPureGenerator: true,
      comparisonStrategy: "complete_byte_equality",
      changedPaths: [
        "AGENTS.md",
        "package.json",
        "scripts/check-generated-files.ts",
        "tests/generated-policy.test.ts",
      ],
      summary: "Generated protection.",
    };

    expect(codexArtifactManifestSchema.parse(manifest)).toMatchObject({
      reusesPureGenerator: true,
      comparisonStrategy: "complete_byte_equality",
    });
    expect(() =>
      codexArtifactManifestSchema.parse({
        ...manifest,
        comparisonStrategy: "field_subset",
      }),
    ).toThrow();
  });
});
