import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderGeneratedClient } from "@/demo/generated-files/template/scripts/generator-core";

export const generatedFilesScenarioPaths = {
  schema: "api/openapi.yaml",
  generatedClient: "generated/api-client.ts",
} as const;

export async function renderExpectedGeneratedClient(
  repositoryRoot: string,
): Promise<string> {
  const schema = await readFile(
    join(repositoryRoot, generatedFilesScenarioPaths.schema),
    "utf8",
  );

  return renderGeneratedClient(schema);
}

export async function readCommittedGeneratedClient(
  repositoryRoot: string,
): Promise<string> {
  return readFile(
    join(repositoryRoot, generatedFilesScenarioPaths.generatedClient),
    "utf8",
  );
}

export async function regenerateClient(repositoryRoot: string): Promise<string> {
  const renderedClient = await renderExpectedGeneratedClient(repositoryRoot);
  await writeFile(
    join(repositoryRoot, generatedFilesScenarioPaths.generatedClient),
    renderedClient,
    "utf8",
  );

  return renderedClient;
}
