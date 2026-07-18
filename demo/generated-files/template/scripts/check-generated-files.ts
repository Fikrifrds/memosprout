import { readFile } from "node:fs/promises";

import { renderGeneratedClient } from "./generator-core";

const sourceCandidateSproutId = "sprout_b9fd056e1923a33a";
const schemaPath = new URL("../api/openapi.yaml", import.meta.url);
const generatedClientPath = new URL("../generated/api-client.ts", import.meta.url);

const schema = await readFile(schemaPath, "utf8");
const expectedClient = Buffer.from(renderGeneratedClient(schema), "utf8");
const committedClient = await readFile(generatedClientPath);

if (!committedClient.equals(expectedClient)) {
  process.stderr.write(
    `generated/api-client.ts differs from api/openapi.yaml (source Candidate Sprout: ${sourceCandidateSproutId}). Run pnpm generate:api and commit the result.\n`,
  );
  process.exitCode = 1;
}
