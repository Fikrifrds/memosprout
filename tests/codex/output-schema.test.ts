import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { runCodexExec } from "@/lib/codex/exec";
import { assertCodexOutputSchema } from "@/lib/codex/output-schema";

describe("Codex output schema preflight", () => {
  it("rejects const-only fields without an explicit type", () => {
    expect(() =>
      assertCodexOutputSchema({
        type: "object",
        additionalProperties: false,
        required: ["version"],
        properties: { version: { const: "1" } },
      }),
    ).toThrow("$.properties.version.type: explicit type is required");
  });

  it("accepts the corrected committed artifact schema", async () => {
    const schema = JSON.parse(
      await readFile(
        join(
          process.cwd(),
          "demo/generated-files/schemas/codex-artifact.schema.json",
        ),
        "utf8",
      ),
    ) as unknown;

    expect(() => assertCodexOutputSchema(schema)).not.toThrow();
  });

  it("rejects uniqueItems through the provider keyword allowlist", () => {
    expect(() =>
      assertCodexOutputSchema({
        type: "array",
        uniqueItems: true,
        items: { type: "string" },
      }),
    ).toThrow("$.uniqueItems: unsupported provider schema keyword");
  });

  it("rejects any unknown provider schema keyword", () => {
    expect(() =>
      assertCodexOutputSchema({
        type: "string",
        minLength: 1,
      }),
    ).toThrow("$.minLength: unsupported provider schema keyword");
  });

  it("checks nested object properties and array items recursively", () => {
    expect(() =>
      assertCodexOutputSchema({
        type: "object",
        additionalProperties: false,
        required: ["nested"],
        properties: {
          nested: {
            type: "object",
            additionalProperties: false,
            required: ["values"],
            properties: {
              values: {
                type: "array",
                items: { enum: ["safe"] },
              },
            },
          },
        },
      }),
    ).toThrow("$.properties.nested.properties.values.items.type");
  });

  it("fails preflight before attempting to spawn Codex", async () => {
    const directory = await mkdtemp(join(tmpdir(), "memosprout-schema-test-"));
    const schemaPath = join(directory, "invalid-schema.json");
    await writeFile(
      schemaPath,
      JSON.stringify({
        type: "object",
        additionalProperties: false,
        required: ["version"],
        properties: { version: { const: "1" } },
      }),
      "utf8",
    );

    await expect(
      runCodexExec({
        executablePath: "/does/not/exist/codex",
        repositoryRoot: directory,
        prompt: "unused",
        outputSchemaPath: schemaPath,
        outputSchema: z.object({ version: z.literal("1") }),
      }),
    ).rejects.toThrow("$.properties.version.type: explicit type is required");
  });
});
