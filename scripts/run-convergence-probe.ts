import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { prepareScenarioRepository } from "@/lib/eval/engine/runner";
import type { ConvergenceCondition } from "@/lib/eval/v3/cases";
import { FrontierApiWorkerAdapter } from "@/lib/eval/v3/frontier-worker";
import { idempotencyScenario } from "@/lib/scenario/idempotency";

const root = process.cwd();

const DE_HINTED_TASK =
  "Implement the payment webhook handler in src/webhook-handler.ts. " +
  "The handler receives provider payment events and must update the corresponding orders in the store. " +
  "Run the tests to check your work.";

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

interface TrialResult {
  trial: number;
  passed: boolean;
  acceptanceExit: number;
  ordinaryExit: number;
  turnCompleted: boolean;
  submitted: boolean;
}

async function runTrial(options: {
  model: string;
  apiKey: string;
  condition: ConvergenceCondition;
  task: string;
  trial: number;
}): Promise<TrialResult> {
  const { repositoryRoot, outputSchemaPath } = await prepareScenarioRepository({
    scenario: idempotencyScenario,
    exposeProtection: options.condition === "cheap-protected",
  });
  try {
    let prompt = options.task;
    if (options.condition === "cheap-protected") {
      const sprout = await readFile(
        join(repositoryRoot, idempotencyScenario.sproutPath),
        "utf8",
      );
      prompt = `Project guidance (AGENTS.md):\n\n${sprout}\n\n${options.task}`;
    }

    const worker = new FrontierApiWorkerAdapter({ model: options.model, apiKey: options.apiKey });
    const turn = await worker.runTurn({
      repositoryRoot,
      prompt,
      outputSchemaPath,
    });

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

    return {
      trial: options.trial,
      passed: acceptance.exitCode === 0 && ordinary.exitCode === 0,
      acceptanceExit: acceptance.exitCode,
      ordinaryExit: ordinary.exitCode,
      turnCompleted: turn.turnCompleted,
      submitted: turn.finalOutput !== null,
    };
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required for the convergence probe.");
    process.exit(1);
  }
  const model = process.env.MEMOSPROUT_PROBE_MODEL?.trim() || "gpt-5.4-mini";
  const condition = (process.env.MEMOSPROUT_PROBE_CONDITION?.trim() ||
    "cheap-baseline") as ConvergenceCondition;
  const trials = Number(process.env.MEMOSPROUT_PROBE_TRIALS || "3");

  console.log(`Convergence probe: model=${model} condition=${condition} trials=${trials}`);
  console.log(`task: ${DE_HINTED_TASK}\n`);

  let passCount = 0;
  for (let trial = 1; trial <= trials; trial += 1) {
    const result = await runTrial({
      model,
      apiKey,
      condition,
      task: DE_HINTED_TASK,
      trial,
    });
    if (result.passed) passCount += 1;
    console.log(
      `trial ${result.trial}: passed=${result.passed} acceptanceExit=${result.acceptanceExit} ` +
        `ordinaryExit=${result.ordinaryExit} turnCompleted=${result.turnCompleted} submitted=${result.submitted}`,
    );
  }

  console.log(`\nSUCCESS RATE: ${passCount}/${trials} = ${(passCount / trials).toFixed(2)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
