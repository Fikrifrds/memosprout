import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SproutRegistry } from "@/lib/delivery/registry";
import { loadSproutStore, saveSproutStore } from "@/lib/delivery/store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function seededRegistry(): SproutRegistry {
  const registry = new SproutRegistry();
  registry.add({
    sproutId: "sprout_3f7c9a21b8e04d65",
    scenario: "idempotency",
    guidance: "Use the provider event id as the idempotency key.",
    scopePaths: ["src/webhook-handler.ts"],
  });
  registry.add({
    sproutId: "sprout_8c2e5a71d90f3b64",
    scenario: "soft-delete",
    guidance: "Soft-delete by setting deletedAt.",
    scopePaths: ["src/user-service.ts"],
  });
  return registry;
}

describe("sprout store persistence", () => {
  it("round-trips a registry through save and load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-store-"));
    tempDirs.push(dir);
    const path = join(dir, "sprout-store.json");

    await saveSproutStore(seededRegistry(), path);
    const loaded = await loadSproutStore(path);

    expect(loaded.size).toBe(2);
    expect(loaded.list()).toEqual(seededRegistry().list());
  });

  it("loads an empty registry when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-store-"));
    tempDirs.push(dir);
    const loaded = await loadSproutStore(join(dir, "missing.json"));
    expect(loaded.size).toBe(0);
  });

  it("creates parent directories when saving", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-store-"));
    tempDirs.push(dir);
    const path = join(dir, "nested", "dir", "sprout-store.json");
    await saveSproutStore(seededRegistry(), path);
    const loaded = await loadSproutStore(path);
    expect(loaded.size).toBe(2);
  });
});
