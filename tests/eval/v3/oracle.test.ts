import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AcceptanceSuiteOracle, type TestRunner } from "@/lib/eval/v3/oracle";
import { idempotencyScenarioPaths } from "@/lib/scenario/idempotency";

const acceptanceSource = "// held-out acceptance suite placeholder\n";
const tempDirs: string[] = [];

async function makeTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "memosprout-oracle-test-"));
  tempDirs.push(dir);
  return dir;
}

function makeOracle(runAcceptanceTests: TestRunner): AcceptanceSuiteOracle {
  return new AcceptanceSuiteOracle({
    acceptanceTestPath: idempotencyScenarioPaths.acceptanceTest,
    acceptanceTestSource: acceptanceSource,
    runAcceptanceTests,
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AcceptanceSuiteOracle", () => {
  it("maps a passing acceptance run to a passing result", async () => {
    const repositoryRoot = await makeTempRepo();
    const runner: TestRunner = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const oracle = makeOracle(runner);

    const result = await oracle.evaluate(repositoryRoot);
    expect(result).toEqual({
      passed: true,
      reason: "acceptance-suite-passed",
      acceptanceExitCode: 0,
    });
  });

  it("maps a failing acceptance run to a failing result", async () => {
    const repositoryRoot = await makeTempRepo();
    const runner: TestRunner = async () => ({ exitCode: 1, stdout: "", stderr: "assertion failed" });
    const oracle = makeOracle(runner);

    const result = await oracle.evaluate(repositoryRoot);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("acceptance-suite-failed");
    expect(result.acceptanceExitCode).toBe(1);
  });

  it("injects the held-out acceptance suite when it is missing", async () => {
    const repositoryRoot = await makeTempRepo();
    const runner: TestRunner = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const oracle = makeOracle(runner);

    await oracle.evaluate(repositoryRoot);

    const injected = await readFile(
      join(repositoryRoot, idempotencyScenarioPaths.acceptanceTest),
      "utf8",
    );
    expect(injected).toBe(acceptanceSource);
  });

  it("does not overwrite an acceptance suite the worker already has", async () => {
    const repositoryRoot = await makeTempRepo();
    await mkdir(join(repositoryRoot, "tests"), { recursive: true });
    const existing = "// worker-provided acceptance suite\n";
    await writeFile(
      join(repositoryRoot, idempotencyScenarioPaths.acceptanceTest),
      existing,
      "utf8",
    );
    const runner: TestRunner = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const oracle = makeOracle(runner);

    await oracle.evaluate(repositoryRoot);

    const preserved = await readFile(
      join(repositoryRoot, idempotencyScenarioPaths.acceptanceTest),
      "utf8",
    );
    expect(preserved).toBe(existing);
  });
});
