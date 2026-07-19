import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type ConvergenceCondition,
  convergenceCases,
  renderConvergencePrompt,
} from "@/lib/eval/v3/cases";
import { FrontierApiWorkerAdapter } from "@/lib/eval/v3/frontier-worker";
import { prepareConvergenceRepository } from "@/lib/eval/v3/runner";
import { idempotencyScenarioPaths } from "@/lib/scenario/idempotency";

const root = process.cwd();

function runInRepo(
  repositoryRoot: string,
  executable: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) =>
      resolvePromise({ exitCode: -1, stdout, stderr: `${stderr}\n${error.message}` }),
    );
    child.on("close", (code) => resolvePromise({ exitCode: code ?? -1, stdout, stderr }));
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required for the convergence smoke test.");
    process.exit(1);
  }
  const model = process.env.MEMOSPROUT_SMOKE_MODEL?.trim() || "gpt-5.6-sol";
  const condition = (process.env.MEMOSPROUT_SMOKE_CONDITION?.trim() ||
    "cheap-protected") as ConvergenceCondition;
  console.log(`Convergence smoke test: model=${model} condition=${condition}`);

  const repositoryRoot = await prepareConvergenceRepository(condition);
  try {
    const taskTemplate = await readFile(
      join(root, "demo", "idempotency", "evaluation", "prompts", "task.md"),
      "utf8",
    );
    const taskPrompt = renderConvergencePrompt(taskTemplate, convergenceCases[0]!);
    let prompt = taskPrompt;
    if (condition === "cheap-protected") {
      const sprout = await readFile(
        join(repositoryRoot, idempotencyScenarioPaths.guidance),
        "utf8",
      );
      prompt = `Project guidance (AGENTS.md):\n\n${sprout}\n\n${taskPrompt}`;
    }

    const worker = new FrontierApiWorkerAdapter({ model, apiKey });
    const turn = await worker.runTurn({
      repositoryRoot,
      prompt,
      outputSchemaPath: join(
        repositoryRoot,
        ".memosprout",
        "convergence-worker-output.schema.json",
      ),
    });
    console.log(`turnCompleted: ${turn.turnCompleted}`);
    console.log(`finalOutput: ${JSON.stringify(turn.finalOutput)}`);
    console.log(`tool trace:\n${turn.stdout.slice(-4000)}`);
    if (turn.stderr.trim()) console.log(`worker stderr (tail):\n${turn.stderr.slice(-1500)}`);

    // Inject the canonical held-out acceptance suite so every condition is scored
    // against the same reference (mirrors IdempotencyOracle). Overwriting also
    // neutralizes any worker tampering in the protected condition.
    const acceptanceSource = await readFile(
      join(root, "demo", "idempotency", "template", "tests", "idempotency.acceptance.test.ts"),
      "utf8",
    );
    await writeFile(
      join(repositoryRoot, "tests", "idempotency.acceptance.test.ts"),
      acceptanceSource,
      "utf8",
    );

    const acceptance = await runInRepo(repositoryRoot, "pnpm", [
      "exec",
      "vitest",
      "run",
      "tests/idempotency.acceptance.test.ts",
    ]);
    const ordinary = await runInRepo(repositoryRoot, "pnpm", [
      "exec",
      "vitest",
      "run",
      "tests/handler.test.ts",
    ]);
    console.log(`acceptance exit: ${acceptance.exitCode}`);
    console.log(`ordinary exit: ${ordinary.exitCode}`);
    if (acceptance.exitCode !== 0) {
      console.log(`acceptance output (tail):\n${acceptance.stdout.slice(-2000)}`);
    }
    const status = await runInRepo(repositoryRoot, "git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    console.log(`changed paths:\n${status.stdout.trim()}`);
    const passed = turn.turnCompleted && acceptance.exitCode === 0 && ordinary.exitCode === 0;
    console.log(passed ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
    if (!passed) process.exitCode = 1;
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
