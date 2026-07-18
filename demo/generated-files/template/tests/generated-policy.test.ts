import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceCandidateSproutId = "sprout_b9fd056e1923a33a";
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const schemaPath = new URL("../api/openapi.yaml", import.meta.url);
const generatedClientPath = new URL("../generated/api-client.ts", import.meta.url);

function runGeneratedCheck() {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/check-generated-files.ts"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

describe(`generated-file policy (${sourceCandidateSproutId})`, () => {
  it("accepts matching output without changing repository inputs", async () => {
    const schemaBefore = await readFile(schemaPath);
    const generatedBefore = await readFile(generatedClientPath);

    const result = runGeneratedCheck();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(await readFile(schemaPath)).toEqual(schemaBefore);
    expect(await readFile(generatedClientPath)).toEqual(generatedBefore);
  });

  it("rejects appended bytes without repairing the committed client", async () => {
    const generatedBefore = await readFile(generatedClientPath);
    const divergentClient = Buffer.concat([
      generatedBefore,
      Buffer.from("// direct generated append\n", "utf8"),
    ]);

    try {
      await writeFile(generatedClientPath, divergentClient);

      const result = runGeneratedCheck();

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(sourceCandidateSproutId);
      expect(await readFile(generatedClientPath)).toEqual(divergentClient);
    } finally {
      await writeFile(generatedClientPath, generatedBefore);
    }
  });
});
