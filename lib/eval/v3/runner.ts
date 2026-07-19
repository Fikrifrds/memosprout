import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
import { join, relative } from "node:path";

import { sanitizeCodexText } from "@/lib/codex/sanitize";
import {
  type ConvergenceCase,
  type ConvergenceCondition,
  frozenConvergenceRubricSha256,
  renderConvergencePrompt,
} from "@/lib/eval/v3/cases";
import { IdempotencyOracle, type TestRunner } from "@/lib/eval/v3/oracle";
import { convergenceRunSchema, type ConvergenceRun } from "@/lib/eval/v3/report";
import type { WorkerAdapter } from "@/lib/eval/v3/worker";
import {
  idempotencyGuardedPaths,
  idempotencyProtectedOnlyPaths,
  idempotencyTemplateRoot,
  readHeldOutAcceptanceTest,
} from "@/lib/scenario/idempotency";

const root = process.cwd();
const outputSchemaSource = join(
  root,
  "demo",
  "idempotency",
  "schemas",
  "convergence-worker-output.schema.json",
);

export const convergenceOrdinaryTestCommand = "pnpm exec vitest run tests/handler.test.ts";
export const convergenceAcceptanceTestCommand =
  "pnpm exec vitest run tests/idempotency.acceptance.test.ts";

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
  return new Promise((resolve, reject) => {
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
      resolve({ command: [executable, ...args].join(" "), exitCode: code ?? -1, stdout, stderr }),
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

export async function prepareConvergenceRepository(
  condition: ConvergenceCondition,
): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `memosprout-convergence-${condition}-`));
  await cp(idempotencyTemplateRoot(root), repositoryRoot, {
    recursive: true,
    filter: (source) => !source.endsWith("/node_modules"),
  });

  const exposesProtection = condition === "cheap-protected";
  if (!exposesProtection) {
    for (const path of idempotencyProtectedOnlyPaths) {
      await rm(join(repositoryRoot, path), { force: true });
    }
  }

  await mkdir(join(repositoryRoot, ".memosprout"), { recursive: true });
  await cp(
    outputSchemaSource,
    join(repositoryRoot, ".memosprout", "convergence-worker-output.schema.json"),
  );
  await writeFile(join(repositoryRoot, ".gitignore"), "node_modules\n.memosprout\n", "utf8");
  await symlink(join(root, "node_modules"), join(repositoryRoot, "node_modules"));

  const gitEnvironment = {
    ...process.env,
    GIT_AUTHOR_NAME: "MemoSprout Convergence Evaluation",
    GIT_AUTHOR_EMAIL: "evaluation@example.invalid",
    GIT_COMMITTER_NAME: "MemoSprout Convergence Evaluation",
    GIT_COMMITTER_EMAIL: "evaluation@example.invalid",
  };
  for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "convergence fixture"]]) {
    const result = await runCommand("git", args, {
      cwd: repositoryRoot,
      environment: gitEnvironment,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Convergence repository setup failed: ${result.stderr}`);
    }
  }
  return repositoryRoot;
}

export async function assertConvergenceRepositoryIsolation(): Promise<void> {
  for (const condition of ["cheap-baseline", "cheap-protected", "frontier-baseline"] as const) {
    const repositoryRoot = await prepareConvergenceRepository(condition);
    try {
      const artifactPresence = await Promise.all(
        idempotencyProtectedOnlyPaths.map((path) => pathExists(join(repositoryRoot, path))),
      );
      const shouldExposeProtection = condition === "cheap-protected";
      if (artifactPresence.some((present) => present !== shouldExposeProtection)) {
        throw new Error(`${condition} repository materialization violates protection isolation.`);
      }
      for (const forbiddenDirectory of ["knowledge", "evidence"]) {
        if (await pathExists(join(repositoryRoot, forbiddenDirectory))) {
          throw new Error(`${condition} repository exposes non-promoted evaluation knowledge.`);
        }
      }
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  }
}

async function getChangedPaths(repositoryRoot: string): Promise<string[]> {
  const status = await runCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
  });
  if (status.exitCode !== 0) {
    throw new Error("Could not inspect convergence repository status.");
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
    throw new Error("Could not capture convergence patch.");
  }
  return result.stdout;
}

export async function runConvergenceTrial(options: {
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
  const repositoryRoot = await prepareConvergenceRepository(options.condition);
  const started = new Date();
  const prompt = `${renderConvergencePrompt(options.promptTemplate, options.testCase)}\n\n` +
    `For the final structured response, use taskId ${options.testCase.id} and version 1.`;
  const outputSchemaPath = join(
    repositoryRoot,
    ".memosprout",
    "convergence-worker-output.schema.json",
  );

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

    const guarded = new Set<string>(idempotencyGuardedPaths);
    const policyViolation = changedPaths.some((path) => guarded.has(path));

    const oracle = new IdempotencyOracle({
      acceptanceTestSource: await readHeldOutAcceptanceTest(effectiveRoot),
      runAcceptanceTests: options.runAcceptanceTests,
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
          command: convergenceOrdinaryTestCommand,
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
