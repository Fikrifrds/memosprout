import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

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

export type AcceptanceSuiteOracleResult =
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

export interface AcceptanceSuiteOracleOptions {
  acceptanceTestPath: string;
  acceptanceTestSource: string;
  runAcceptanceTests: TestRunner;
}

export class AcceptanceSuiteOracle implements ScenarioOracle {
  readonly id: string;

  constructor(private readonly options: AcceptanceSuiteOracleOptions) {
    this.id = `acceptance-suite:${options.acceptanceTestPath}`;
  }

  async evaluate(repositoryRoot: string): Promise<AcceptanceSuiteOracleResult> {
    const acceptanceTestPath = join(repositoryRoot, this.options.acceptanceTestPath);
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

export async function createScenarioOracle(options: {
  scenario: ScenarioDefinition;
  runAcceptanceTests: TestRunner;
  root?: string;
}): Promise<AcceptanceSuiteOracle> {
  const root = options.root ?? process.cwd();
  const acceptanceTestSource = await readFile(
    join(root, options.scenario.templateRoot, options.scenario.acceptanceTestPath),
    "utf8",
  );
  return new AcceptanceSuiteOracle({
    acceptanceTestPath: options.scenario.acceptanceTestPath,
    acceptanceTestSource,
    runAcceptanceTests: options.runAcceptanceTests,
  });
}
