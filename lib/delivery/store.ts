import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { SproutRegistry, validatedSproutSchema } from "@/lib/delivery/registry";

export const sproutStoreSchema = z
  .object({
    version: z.literal("sprout-store-v1"),
    sprouts: z.array(validatedSproutSchema),
  })
  .strict();

export type SproutStore = z.infer<typeof sproutStoreSchema>;

export async function loadSproutStore(path: string): Promise<SproutRegistry> {
  const registry = new SproutRegistry();
  try {
    await stat(path);
  } catch {
    return registry;
  }
  const store = sproutStoreSchema.parse(JSON.parse(await readFile(path, "utf8")));
  for (const sprout of store.sprouts) {
    registry.add(sprout);
  }
  return registry;
}

export async function saveSproutStore(registry: SproutRegistry, path: string): Promise<void> {
  const store: SproutStore = { version: "sprout-store-v1", sprouts: registry.list() };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}
