import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertConvergenceRepositoryIsolation,
  prepareConvergenceRepository,
} from "@/lib/eval/v3/runner";
import { idempotencyProtectedOnlyPaths } from "@/lib/scenario/idempotency";

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

describe("convergence repository materialization", () => {
  it("exposes the sprout only in the cheap-protected condition", async () => {
    for (const condition of ["cheap-baseline", "cheap-protected", "frontier-baseline"] as const) {
      const repositoryRoot = await prepareConvergenceRepository(condition);
      tempDirs.push(repositoryRoot);
      const shouldExpose = condition === "cheap-protected";
      for (const path of idempotencyProtectedOnlyPaths) {
        expect(await pathExists(join(repositoryRoot, path))).toBe(shouldExpose);
      }
    }
  });

  it("keeps the guarded store and types in every condition", async () => {
    for (const condition of ["cheap-baseline", "cheap-protected", "frontier-baseline"] as const) {
      const repositoryRoot = await prepareConvergenceRepository(condition);
      tempDirs.push(repositoryRoot);
      expect(await pathExists(join(repositoryRoot, "src/payment-store.ts"))).toBe(true);
      expect(await pathExists(join(repositoryRoot, "src/types.ts"))).toBe(true);
      expect(await pathExists(join(repositoryRoot, "src/webhook-handler.ts"))).toBe(true);
    }
  });

  it("asserts isolation across all three conditions", async () => {
    await expect(assertConvergenceRepositoryIsolation()).resolves.toBeUndefined();
  });
});
