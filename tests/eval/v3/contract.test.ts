import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { convergenceEvaluationPaths } from "@/lib/eval/v3/authorization";
import { frozenConvergenceRubricSha256 } from "@/lib/eval/v3/cases";
import { verifyConvergenceDesign } from "@/lib/eval/v3/contract";

const root = process.cwd();
const tempDirs: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), "memosprout-convergence-design-"));
  tempDirs.push(tempRoot);
  await cp(join(root, "demo", "idempotency"), join(tempRoot, "demo", "idempotency"), {
    recursive: true,
  });
  return tempRoot;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("verifyConvergenceDesign", () => {
  it("verifies the frozen design without any model call", async () => {
    const design = await verifyConvergenceDesign(root);
    expect(design.contract.executionAuthorized).toBe(false);
    expect(design.contract.rubricSha256).toBe(frozenConvergenceRubricSha256);
    expect(design.contract.scenario).toBe("idempotency");
    expect(design.manifest.files.length).toBeGreaterThan(0);
  });

  it("rejects a tampered frozen input hash", async () => {
    const tempRoot = await makeTempRoot();
    const promptPath = join(tempRoot, convergenceEvaluationPaths.promptTemplate);
    await writeFile(promptPath, "{{TASK}}\n tampered content\n", "utf8");
    await expect(verifyConvergenceDesign(tempRoot)).rejects.toThrow(/hash mismatch/i);
  });

  it("rejects a contract whose authorization flag was flipped", async () => {
    const tempRoot = await makeTempRoot();
    const contractPath = join(tempRoot, convergenceEvaluationPaths.contract);
    const contract = JSON.parse(await readFile(contractPath, "utf8")) as Record<string, unknown>;
    contract.executionAuthorized = true;
    await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    await expect(verifyConvergenceDesign(tempRoot)).rejects.toThrow();
  });
});
