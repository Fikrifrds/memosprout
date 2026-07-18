import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { renderGeneratedClient } from "./generator-core";

const schemaPath = new URL("../api/openapi.yaml", import.meta.url);
const generatedClientPath = new URL("../generated/api-client.ts", import.meta.url);

export async function generateClient(): Promise<void> {
  const schema = await readFile(schemaPath, "utf8");
  await writeFile(generatedClientPath, renderGeneratedClient(schema), "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateClient();
  process.stdout.write("Generated generated/api-client.ts\n");
}
