import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertScenarioIsolation,
  prepareScenarioRepository,
} from "@/lib/eval/engine/runner";
import {
  idempotencyProtectedOnlyPaths,
  idempotencyScenario,
} from "@/lib/scenario/idempotency";

const tempDirs: string[] = [];

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("scenario repository materialization (idempotency)", () => {
  it("exposes the sprout only in the protected condition", async () => {
    for (const exposeProtection of [false, true]) {
      const { repositoryRoot } = await prepareScenarioRepository({
        scenario: idempotencyScenario,
        exposeProtection,
      });
      tempDirs.push(repositoryRoot);
      for (const path of idempotencyProtectedOnlyPaths) {
        expect(await pathExists(join(repositoryRoot, path))).toBe(exposeProtection);
      }
    }
  });

  it("keeps the guarded store and types in every condition", async () => {
    for (const exposeProtection of [false, true]) {
      const { repositoryRoot } = await prepareScenarioRepository({
        scenario: idempotencyScenario,
        exposeProtection,
      });
      tempDirs.push(repositoryRoot);
      expect(await pathExists(join(repositoryRoot, "src/payment-store.ts"))).toBe(true);
      expect(await pathExists(join(repositoryRoot, "src/types.ts"))).toBe(true);
      expect(await pathExists(join(repositoryRoot, "src/webhook-handler.ts"))).toBe(true);
    }
  });

  it("asserts isolation across both materialization modes", async () => {
    await expect(assertScenarioIsolation(idempotencyScenario)).resolves.toBeUndefined();
  });
});
