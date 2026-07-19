import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { idempotencyScenarioPaths } from "@/lib/scenario/idempotency";

export interface ScenarioOracleResult {
  passed: boolean;
  reason: string;
}

export interface ScenarioOracle {
  readonly id: string;
  evaluate(repositoryRoot: string): Promise<ScenarioOracleResult>;
}

export interface TestRunOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type TestRunner = (repositoryRoot: string) => Promise<TestRunOutcome>;

export type IdempotencyOracleResult =
  | {
      passed: true;
      reason: "acceptance-suite-passed";
      acceptanceExitCode: number;
    }
  | {
      passed: false;
      reason: "acceptance-suite-failed";
      acceptanceExitCode: number;
    };

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface IdempotencyOracleOptions {
  acceptanceTestSource: string;
  runAcceptanceTests: TestRunner;
}

export class IdempotencyOracle implements ScenarioOracle {
  readonly id = "idempotency-acceptance-v1";

  constructor(private readonly options: IdempotencyOracleOptions) {}

  async evaluate(repositoryRoot: string): Promise<IdempotencyOracleResult> {
    const acceptanceTestPath = join(
      repositoryRoot,
      idempotencyScenarioPaths.acceptanceTest,
    );
    if (!(await pathExists(acceptanceTestPath))) {
      await mkdir(dirname(acceptanceTestPath), { recursive: true });
      await writeFile(acceptanceTestPath, this.options.acceptanceTestSource, "utf8");
    }

    const outcome = await this.options.runAcceptanceTests(repositoryRoot);
    if (outcome.exitCode === 0) {
      return {
        passed: true,
        reason: "acceptance-suite-passed",
        acceptanceExitCode: outcome.exitCode,
      };
    }
    return {
      passed: false,
      reason: "acceptance-suite-failed",
      acceptanceExitCode: outcome.exitCode,
    };
  }
}
