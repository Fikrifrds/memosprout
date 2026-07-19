import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { createScenarioOracle, type TestRunner } from "@/lib/eval/engine/oracle";
import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";

interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCommand(
  executable: string,
  args: string[],
  options: { cwd?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.environment ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) =>
      resolvePromise({
        command: [executable, ...args].join(" "),
        exitCode: code ?? -1,
        stdout,
        stderr,
      }),
    );
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface PreparedScenarioRepository {
  repositoryRoot: string;
  outputSchemaPath: string;
}

export async function prepareScenarioRepository(options: {
  scenario: ScenarioDefinition;
  exposeProtection: boolean;
  root?: string;
}): Promise<PreparedScenarioRepository> {
  const root = options.root ?? process.cwd();
  const { scenario } = options;
  const repositoryRoot = await mkdtemp(join(tmpdir(), `memosprout-${scenario.id}-`));
  await cp(join(root, scenario.templateRoot), repositoryRoot, {
    recursive: true,
    filter: (source) => !source.endsWith("/node_modules"),
  });

  if (!options.exposeProtection) {
    for (const path of scenario.protectedOnlyPaths) {
      await rm(join(repositoryRoot, path), { force: true });
    }
  }

  await mkdir(join(repositoryRoot, ".memosprout"), { recursive: true });
  const outputSchemaPath = join(repositoryRoot, ".memosprout", "worker-output.schema.json");
  await cp(join(root, scenario.workerOutputSchemaPath), outputSchemaPath);
  await writeFile(join(repositoryRoot, ".gitignore"), "node_modules\n.memosprout\n", "utf8");
  await symlink(join(root, "node_modules"), join(repositoryRoot, "node_modules"));

  const gitEnvironment = {
    ...process.env,
    GIT_AUTHOR_NAME: "MemoSprout Validation Engine",
    GIT_AUTHOR_EMAIL: "evaluation@example.invalid",
    GIT_COMMITTER_NAME: "MemoSprout Validation Engine",
    GIT_COMMITTER_EMAIL: "evaluation@example.invalid",
  };
  for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "scenario fixture"]]) {
    const result = await runCommand("git", args, {
      cwd: repositoryRoot,
      environment: gitEnvironment,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Scenario repository setup failed: ${result.stderr}`);
    }
  }

  return { repositoryRoot, outputSchemaPath };
}

export async function assertScenarioIsolation(
  scenario: ScenarioDefinition,
  root: string = process.cwd(),
): Promise<void> {
  for (const exposeProtection of [false, true]) {
    const { repositoryRoot } = await prepareScenarioRepository({
      scenario,
      exposeProtection,
      root,
    });
    try {
      const artifactPresence = await Promise.all(
        scenario.protectedOnlyPaths.map((path) => pathExists(join(repositoryRoot, path))),
      );
      if (artifactPresence.some((present) => present !== exposeProtection)) {
        throw new Error(
          `${scenario.id} materialization violates protection isolation (exposeProtection=${exposeProtection}).`,
        );
      }
      for (const forbiddenDirectory of ["knowledge", "evidence"]) {
        if (await pathExists(join(repositoryRoot, forbiddenDirectory))) {
          throw new Error(`${scenario.id} repository exposes non-promoted evaluation knowledge.`);
        }
      }
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  }
}

export interface ScenarioControlResult {
  id: string;
  expected: "allow";
  observed: "allow" | "reject";
  passed: boolean;
}

export async function evaluateScenarioControl(options: {
  scenario: ScenarioDefinition;
  controlId: string;
  implementationPath: string;
  correctSource: string;
  runAcceptanceTests: TestRunner;
  root?: string;
}): Promise<ScenarioControlResult> {
  const root = options.root ?? process.cwd();
  const { repositoryRoot } = await prepareScenarioRepository({
    scenario: options.scenario,
    exposeProtection: false,
    root,
  });
  try {
    await writeFile(
      join(repositoryRoot, options.implementationPath),
      options.correctSource,
      "utf8",
    );
    const oracle = await createScenarioOracle({
      scenario: options.scenario,
      runAcceptanceTests: options.runAcceptanceTests,
      root,
    });
    const result = await oracle.evaluate(repositoryRoot);
    const observed: "allow" | "reject" = result.passed ? "allow" : "reject";
    return {
      id: options.controlId,
      expected: "allow",
      observed,
      passed: observed === "allow",
    };
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

export function scenarioOutputSchemaBasename(scenario: ScenarioDefinition): string {
  return basename(scenario.workerOutputSchemaPath);
}
