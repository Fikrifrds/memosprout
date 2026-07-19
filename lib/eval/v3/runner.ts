import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { sanitizeCodexText } from "@/lib/codex/sanitize";
import { createScenarioOracle, type TestRunner } from "@/lib/eval/engine/oracle";
import { prepareScenarioRepository } from "@/lib/eval/engine/runner";
import type { ScenarioDefinition } from "@/lib/eval/engine/scenario";
import {
  type ConvergenceCase,
  type ConvergenceCondition,
  frozenConvergenceRubricSha256,
  renderConvergencePrompt,
} from "@/lib/eval/v3/cases";
import { convergenceRunSchema, type ConvergenceRun } from "@/lib/eval/v3/report";
import type { WorkerAdapter } from "@/lib/eval/v3/worker";

const root = process.cwd();

interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function runCommand(
  executable: string,
  args: string[],
  options: { cwd?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? root,
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

async function getChangedPaths(repositoryRoot: string): Promise<string[]> {
  const status = await runCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
  });
  if (status.exitCode !== 0) {
    throw new Error("Could not inspect scenario repository status.");
  }
  return status.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "")
    .filter((path) => path !== "node_modules")
    .sort();
}

async function getPatch(repositoryRoot: string): Promise<string> {
  await runCommand("git", ["add", "-N", "."], { cwd: repositoryRoot });
  const result = await runCommand("git", ["diff", "--binary", "--no-ext-diff"], {
    cwd: repositoryRoot,
  });
  if (result.exitCode !== 0) {
    throw new Error("Could not capture scenario patch.");
  }
  return result.stdout;
}

export async function runConvergenceTrial(options: {
  scenario: ScenarioDefinition;
  testCase: ConvergenceCase;
  trialId: string;
  condition: ConvergenceCondition;
  worker: WorkerAdapter;
  runAcceptanceTests: TestRunner;
  runOrdinaryTests: TestRunner;
  evidenceDirectory: string;
  promptTemplate: string;
  root?: string;
}): Promise<ConvergenceRun> {
  const effectiveRoot = options.root ?? root;
  const { scenario } = options;
  const { repositoryRoot, outputSchemaPath } = await prepareScenarioRepository({
    scenario,
    exposeProtection: options.condition === "cheap-protected",
    root: effectiveRoot,
  });
  const started = new Date();
  const renderedTask = renderConvergencePrompt(options.promptTemplate, options.testCase);
  let prompt = renderedTask;
  if (options.condition === "cheap-protected") {
    const sprout = await readFile(join(repositoryRoot, scenario.sproutPath), "utf8");
    prompt = `Project guidance (AGENTS.md):\n\n${sprout}\n\n${renderedTask}`;
  }
  prompt += `\n\nFor the final structured response, use taskId ${options.testCase.id} and version 1.`;

  try {
    const turn = await options.worker.runTurn({
      repositoryRoot,
      prompt,
      outputSchemaPath,
    });

    const [changedPaths, patch, ordinary] = await Promise.all([
      getChangedPaths(repositoryRoot),
      getPatch(repositoryRoot),
      options.runOrdinaryTests(repositoryRoot),
    ]);

    const guarded = new Set<string>(scenario.guardedPaths);
    const policyViolation = changedPaths.some((path) => guarded.has(path));

    const oracle = await createScenarioOracle({
      scenario,
      runAcceptanceTests: options.runAcceptanceTests,
      root: effectiveRoot,
    });
    const oracleResult = await oracle.evaluate(repositoryRoot);

    const ordinaryTestsPassed = ordinary.exitCode === 0;
    const taskSuccess = oracleResult.passed && ordinaryTestsPassed;
    const completed = new Date();
    const runId = `convrun_${hash(
      `${options.condition}:${options.testCase.id}:${options.trialId}:${started.toISOString()}:${
        turn.threadId ?? "failed"
      }`,
    ).slice(0, 16)}`;

    const runDirectory = join(
      options.evidenceDirectory,
      options.testCase.id,
      options.trialId,
      options.condition,
    );
    await mkdir(runDirectory, { recursive: true });
    const tracePath = relative(effectiveRoot, join(runDirectory, "worker-trace.jsonl"));
    const patchPath = relative(effectiveRoot, join(runDirectory, "repository.patch"));
    const sanitizedTrace = sanitizeCodexText(turn.stdout || turn.stderr, {
      temporaryRepository: repositoryRoot,
    });
    const sanitizedPatch = sanitizeCodexText(patch, { temporaryRepository: repositoryRoot });
    await Promise.all([
      writeFile(join(effectiveRoot, tracePath), sanitizedTrace, "utf8"),
      writeFile(join(effectiveRoot, patchPath), sanitizedPatch, "utf8"),
    ]);

    const run = convergenceRunSchema.parse({
      version: "1",
      source: "live",
      runId,
      case: options.testCase,
      trialId: options.trialId,
      condition: options.condition,
      rubricSha256: frozenConvergenceRubricSha256,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      durationMs: completed.getTime() - started.getTime(),
      worker: {
        adapterId: options.worker.id,
        model: options.worker.model,
        command: turn.command,
        exitCode: turn.exitCode,
        turnCompleted: turn.turnCompleted,
        threadId: turn.threadId,
        finalOutput: turn.finalOutput,
      },
      exposure: {
        durableGuidance: options.condition === "cheap-protected",
        executableProtection: options.condition === "cheap-protected",
      },
      evidence: {
        changedPaths,
        repositoryMutated: changedPaths.length > 0,
        patchSha256: hash(sanitizedPatch),
        oracle: oracleResult,
        ordinaryTests: {
          command: scenario.ordinaryTestCommand,
          exitCode: ordinary.exitCode,
          passed: ordinaryTestsPassed,
        },
        policyViolation,
      },
      outcome: {
        taskSuccess,
        policyViolation,
        firstPass: turn.turnCompleted && taskSuccess && !policyViolation,
      },
      artifacts: { trace: tracePath, patch: patchPath },
    });
    await writeFile(join(runDirectory, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    return run;
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
