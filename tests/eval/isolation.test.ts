import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareEvaluationRepository } from "@/lib/eval/runner";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("baseline and protected repository isolation", () => {
  it("removes every promoted protection artifact from baseline", async () => {
    const root = await prepareEvaluationRepository("baseline");
    try {
      await expect(exists(join(root, "AGENTS.md"))).resolves.toBe(false);
      await expect(exists(join(root, "scripts", "check-generated-files.ts"))).resolves.toBe(false);
      await expect(exists(join(root, "tests", "generated-policy.test.ts"))).resolves.toBe(false);
      const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      };
      expect(packageJson.scripts["check:generated"]).toBeUndefined();
      expect(await exists(join(root, "knowledge"))).toBe(false);
      expect(await exists(join(root, "evidence"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("materializes only the promoted durable guidance and executable protection", async () => {
    const root = await prepareEvaluationRepository("protected");
    try {
      await expect(exists(join(root, "AGENTS.md"))).resolves.toBe(true);
      await expect(exists(join(root, "scripts", "check-generated-files.ts"))).resolves.toBe(true);
      await expect(exists(join(root, "tests", "generated-policy.test.ts"))).resolves.toBe(true);
      const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      };
      expect(packageJson.scripts["check:generated"]).toBe("tsx scripts/check-generated-files.ts");
      expect(await exists(join(root, "knowledge"))).toBe(false);
      expect(await exists(join(root, "evidence"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
