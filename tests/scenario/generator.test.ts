import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  readCommittedGeneratedClient,
  regenerateClient,
  renderExpectedGeneratedClient,
} from "@/lib/scenario/generated-files";

const templateRoot = join(
  process.cwd(),
  "demo",
  "generated-files",
  "template",
);
const temporaryRepositories: string[] = [];

async function createTemporaryRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "memosprout-generator-"));
  temporaryRepositories.push(repositoryRoot);
  await cp(templateRoot, repositoryRoot, { recursive: true });
  return repositoryRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((repositoryRoot) =>
      rm(repositoryRoot, { recursive: true, force: true }),
    ),
  );
});

describe("generated-files scenario generator", () => {
  it("keeps the clean template consistent with its source schema", async () => {
    const repositoryRoot = await createTemporaryRepository();

    await expect(renderExpectedGeneratedClient(repositoryRoot)).resolves.toBe(
      await readCommittedGeneratedClient(repositoryRoot),
    );
  });

  it("produces byte-stable output across repeated runs", async () => {
    const repositoryRoot = await createTemporaryRepository();

    await regenerateClient(repositoryRoot);
    const firstOutput = await readFile(
      join(repositoryRoot, "generated", "api-client.ts"),
    );
    await regenerateClient(repositoryRoot);
    const secondOutput = await readFile(
      join(repositoryRoot, "generated", "api-client.ts"),
    );

    expect(secondOutput.equals(firstOutput)).toBe(true);
  });
});
