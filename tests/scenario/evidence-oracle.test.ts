import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { evaluateGeneratedFilesEvidence } from "@/lib/eval/oracle";
import { regenerateClient } from "@/lib/scenario/generated-files";

const templateRoot = join(
  process.cwd(),
  "demo",
  "generated-files",
  "template",
);
const temporaryRepositories: string[] = [];

async function createTemporaryRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "memosprout-oracle-"));
  temporaryRepositories.push(repositoryRoot);
  await cp(templateRoot, repositoryRoot, { recursive: true });
  return repositoryRoot;
}

async function addPhoneNumberToSchema(repositoryRoot: string): Promise<void> {
  const schemaPath = join(repositoryRoot, "api", "openapi.yaml");
  const schema = await readFile(schemaPath, "utf8");
  const insertionPoint = "        name:\n          type: string\n";

  if (!schema.includes(insertionPoint)) {
    throw new Error("Demo schema does not contain the expected insertion point.");
  }

  await writeFile(
    schemaPath,
    schema.replace(
      insertionPoint,
      `${insertionPoint}        phone_number:\n          type: string\n`,
    ),
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((repositoryRoot) =>
      rm(repositoryRoot, { recursive: true, force: true }),
    ),
  );
});

describe("generated-files evidence oracle", () => {
  it("rejects a direct edit to the generated client", async () => {
    const repositoryRoot = await createTemporaryRepository();
    await appendFile(
      join(repositoryRoot, "generated", "api-client.ts"),
      "// Direct manual edit.\n",
      "utf8",
    );

    await expect(evaluateGeneratedFilesEvidence(repositoryRoot)).resolves.toMatchObject({
      passed: false,
      reason: "generated-client-diverged",
    });
  });

  it("rejects a schema edit that was not regenerated", async () => {
    const repositoryRoot = await createTemporaryRepository();
    await addPhoneNumberToSchema(repositoryRoot);

    await expect(evaluateGeneratedFilesEvidence(repositoryRoot)).resolves.toMatchObject({
      passed: false,
      reason: "generated-client-diverged",
    });
  });

  it("accepts a schema edit followed by regeneration", async () => {
    const repositoryRoot = await createTemporaryRepository();
    await addPhoneNumberToSchema(repositoryRoot);
    await regenerateClient(repositoryRoot);

    const result = await evaluateGeneratedFilesEvidence(repositoryRoot);

    expect(result).toMatchObject({
      passed: true,
      reason: "generated-client-consistent",
    });
    expect(result.actualSha256).toBe(result.expectedSha256);
  });
});
