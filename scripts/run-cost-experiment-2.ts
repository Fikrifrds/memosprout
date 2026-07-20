/**
 * Live token-cost experiment 2: a repository large enough that exploration costs real tokens.
 *
 * Experiment 1 measured a 9.2% saving on a 164-line repository, where an agent can read the
 * whole codebase cheaply and a retry costs little. This experiment tests the actual thesis:
 * when conventions are spread across a multi-file repository, does delivering them just in
 * time save more tokens than the sprout costs to send?
 *
 * Conditions (same model both sides, gpt-5.4-mini):
 *   - baseline:  no sprout. The conventions are discoverable by reading the codebase.
 *   - protected: the sprout (AGENTS.md) is prepended to the prompt.
 *
 * Each trial allows up to MAX_ATTEMPTS attempts; after a failed oracle run the worker gets a
 * CI-style failure report and retries in the same repository. tokens_to_success sums API
 * token usage across every attempt of a trial. Policy violations are detected by hashing
 * guarded files before and after each turn, so the oracle materializing its own held-out
 * test can never be attributed to the worker.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createScenarioOracle, type TestRunner } from "@/lib/eval/engine/oracle";
import { prepareScenarioRepository } from "@/lib/eval/engine/runner";
import { buildFrontierTools, FrontierApiWorkerAdapter } from "@/lib/eval/v3/frontier-worker";
import type { WorkerTokenUsage } from "@/lib/eval/v3/worker";
import { OutcomeLedger, saveOutcomeLedger } from "@/lib/ledger/ledger";
import { TOKENS_TO_SUCCESS, type OutcomeRecord } from "@/lib/ledger/schema";
import { apiConventionsScenario } from "@/lib/scenario/api-conventions";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "api-conventions", "evidence", "cost-experiment");

const MODEL = "gpt-5.4-mini";
const TRIALS_PER_CONDITION = 8;
const MAX_ATTEMPTS = 3;
const TASK_ID = "api-conventions-list-invoices";

// gpt-5.4-mini standard pricing, USD per 1M tokens (OpenAI pricing page, 2026-07).
const PRICE_PER_M_INPUT = 0.75;
const PRICE_PER_M_OUTPUT = 4.5;

const TASK =
  "Implement the `listInvoices` route in `src/routes/invoices.ts`. It lists invoices for " +
  "the authenticated tenant and supports the same paging query parameters as the other " +
  "list endpoints in this API. Follow the conventions this repository already uses. " +
  "Run `pnpm exec vitest run tests/invoices.test.ts` to check your work.";

const tools = buildFrontierTools([TASK_ID]);

function validateOutput(value: unknown): {
  version: "1";
  taskId: "api-conventions-list-invoices";
  summary: string;
  commandsRun: string[];
} {
  const record = value as Record<string, unknown>;
  if (
    record?.version !== "1" ||
    record?.taskId !== TASK_ID ||
    typeof record?.summary !== "string" ||
    !Array.isArray(record?.commandsRun)
  ) {
    throw new Error("worker output did not satisfy the schema");
  }
  return {
    version: "1",
    taskId: TASK_ID,
    summary: record.summary,
    commandsRun: record.commandsRun as string[],
  };
}

type Condition = "baseline" | "protected";

interface AttemptResult {
  attempt: number;
  oraclePassed: boolean;
  ordinaryPassed: boolean;
  policyViolation: boolean;
  violatedPaths: string[];
  repositoryChangedPaths: string[];
  usage: WorkerTokenUsage | null;
  workerError: string | null;
}

interface TrialResult {
  condition: Condition;
  trial: number;
  success: boolean;
  attempts: AttemptResult[];
  totalUsage: WorkerTokenUsage;
}

function runVitest(repositoryRoot: string, testFile: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolvePromise) => {
    const child = spawn("pnpm", ["exec", "vitest", "run", testFile], {
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

const runAcceptanceTests: TestRunner = (repositoryRoot) =>
  runVitest(repositoryRoot, "tests/invoices.acceptance.test.ts");

async function runGitStatus(repositoryRoot: string): Promise<string[]> {
  const result = await new Promise<string>((resolvePromise) => {
    const child = spawn("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.on("error", () => resolvePromise(""));
    child.on("close", () => resolvePromise(stdout));
  });
  return result
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "");
}

async function hashGuardedFiles(repositoryRoot: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const path of apiConventionsScenario.guardedPaths) {
    try {
      const content = await readFile(join(repositoryRoot, path), "utf8");
      hashes.set(path, createHash("sha256").update(content).digest("hex"));
    } catch {
      hashes.set(path, "absent");
    }
  }
  return hashes;
}

function failureSummary(stdout: string, stderr: string): string {
  const lines = `${stdout}\n${stderr}`
    .split("\n")
    .filter((line) => /✕|✗|FAIL|AssertionError|expected|Tests {2}/.test(line))
    .slice(0, 30);
  return lines.join("\n").slice(0, 3000) || "Tests failed (no summary captured).";
}

async function runTrial(condition: Condition, trial: number): Promise<TrialResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");

  const { repositoryRoot } = await prepareScenarioRepository({
    scenario: apiConventionsScenario,
    exposeProtection: condition === "protected",
    root,
  });

  try {
    let prompt = TASK;
    if (condition === "protected") {
      const sprout = await readFile(
        join(repositoryRoot, apiConventionsScenario.sproutPath),
        "utf8",
      );
      prompt = `Project guidance (AGENTS.md):\n\n${sprout}\n\n${TASK}`;
    }
    prompt += `\n\nFor the final structured response, use taskId ${TASK_ID} and version 1.`;

    const oracle = await createScenarioOracle({
      scenario: apiConventionsScenario,
      runAcceptanceTests,
      root,
    });

    const attempts: AttemptResult[] = [];
    const totalUsage: WorkerTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let success = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const guardedBefore = await hashGuardedFiles(repositoryRoot);
      const worker = new FrontierApiWorkerAdapter({
        model: MODEL,
        apiKey,
        tools,
        validateOutput,
        instructions:
          "You are an autonomous coding agent working inside a single repository. " +
          "Use read_file, write_file, and run_command to complete the task, then call " +
          "submit_result exactly once. Implement the task in src/routes/invoices.ts; do not " +
          "modify the shared library files or the tests.",
      });
      let turnUsage: WorkerTokenUsage | null = null;
      let workerError: string | null = null;
      try {
        const turn = await worker.runTurn({
          repositoryRoot,
          prompt,
          outputSchemaPath: join(repositoryRoot, ".memosprout", "worker-output.schema.json"),
        });
        turnUsage = turn.usage ?? null;
      } catch (error) {
        workerError = error instanceof Error ? error.message : String(error);
        console.error(`  attempt ${attempt} worker error: ${workerError}`);
      }
      if (turnUsage) {
        totalUsage.inputTokens += turnUsage.inputTokens;
        totalUsage.outputTokens += turnUsage.outputTokens;
        totalUsage.totalTokens += turnUsage.totalTokens;
      }

      const guardedAfter = await hashGuardedFiles(repositoryRoot);
      const violatedPaths = [...guardedAfter.keys()].filter(
        (path) => guardedAfter.get(path) !== guardedBefore.get(path),
      );
      const policyViolation = violatedPaths.length > 0;
      const repositoryChangedPaths = await runGitStatus(repositoryRoot);

      const oracleResult = await oracle.evaluate(repositoryRoot);
      const ordinary = await runVitest(repositoryRoot, "tests/invoices.test.ts");
      const ordinaryPassed = ordinary.exitCode === 0;

      attempts.push({
        attempt,
        oraclePassed: oracleResult.passed,
        ordinaryPassed,
        policyViolation,
        violatedPaths,
        repositoryChangedPaths,
        usage: turnUsage,
        workerError,
      });
      console.log(
        `  ${condition} trial ${trial} attempt ${attempt}: oracle=${oracleResult.passed} ` +
          `ordinary=${ordinaryPassed} violation=${policyViolation}` +
          (policyViolation ? `[${violatedPaths.join(" ")}]` : "") +
          ` tokens=${turnUsage?.totalTokens ?? "unknown"}`,
      );

      if (oracleResult.passed && ordinaryPassed && !policyViolation) {
        success = true;
        break;
      }

      if (attempt < MAX_ATTEMPTS) {
        const acceptance = await runAcceptanceTests(repositoryRoot);
        prompt =
          "Your implementation of src/routes/invoices.ts does not pass review. CI reports " +
          "the following failures. Fix the implementation and run the tests again.\n\n" +
          `CI report:\n${failureSummary(
            `${acceptance.stdout}\n${ordinary.stdout}`,
            `${acceptance.stderr}\n${ordinary.stderr}`,
          )}\n\nFor the final structured response, use taskId ${TASK_ID} and version 1.`;
      }
    }

    return { condition, trial, success, attempts, totalUsage };
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function usd(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * PRICE_PER_M_INPUT + (tokensOut / 1_000_000) * PRICE_PER_M_OUTPUT;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

async function main(): Promise<void> {
  console.log(
    `Cost experiment 2: model=${MODEL} trials=${TRIALS_PER_CONDITION}/condition ` +
      `maxAttempts=${MAX_ATTEMPTS} scenario=${apiConventionsScenario.id}`,
  );
  await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });

  const results: TrialResult[] = [];
  for (const condition of ["baseline", "protected"] as const) {
    for (let trial = 1; trial <= TRIALS_PER_CONDITION; trial += 1) {
      console.log(`Running ${condition} trial ${trial}...`);
      results.push(await runTrial(condition, trial));
    }
  }

  const ledger = new OutcomeLedger();
  const recordedAt = new Date().toISOString();
  for (const result of results) {
    const record: OutcomeRecord = {
      version: "outcome-record-v1",
      outcomeId: `outcome_${createHash("sha256")
        .update(`${result.condition}:${result.trial}:${recordedAt}`)
        .digest("hex")
        .slice(0, 16)}`,
      scenario: apiConventionsScenario.id,
      domain: "coding",
      taskId: TASK_ID,
      model: MODEL,
      sproutIds: [],
      condition: result.condition,
      success: result.success,
      metrics: {
        [TOKENS_TO_SUCCESS]: result.totalUsage.totalTokens,
        attempts: result.attempts.length,
        input_tokens: result.totalUsage.inputTokens,
        output_tokens: result.totalUsage.outputTokens,
      },
      recordedAt,
    };
    ledger.append(record);
  }
  await saveOutcomeLedger(ledger, join(evidenceRoot, "ledger.json"));

  const summarize = (condition: Condition) => {
    const rows = results.filter((result) => result.condition === condition);
    const tokens = rows.map((row) => row.totalUsage.totalTokens);
    const successTokens = rows.filter((r) => r.success).map((r) => r.totalUsage.totalTokens);
    return {
      trials: rows.length,
      successes: rows.filter((row) => row.success).length,
      attempts: rows.reduce((sum, row) => sum + row.attempts.length, 0),
      firstAttemptSuccesses: rows.filter(
        (row) => row.success && row.attempts.length === 1,
      ).length,
      inputTokens: rows.reduce((sum, row) => sum + row.totalUsage.inputTokens, 0),
      outputTokens: rows.reduce((sum, row) => sum + row.totalUsage.outputTokens, 0),
      totalTokens: tokens.reduce((sum, value) => sum + value, 0),
      meanTokens: tokens.reduce((sum, value) => sum + value, 0) / (tokens.length || 1),
      medianTokens: median(tokens),
      stdDevTokens: standardDeviation(tokens),
      meanTokensOnSuccess:
        successTokens.reduce((sum, value) => sum + value, 0) / (successTokens.length || 1),
      medianTokensOnSuccess: median(successTokens),
    };
  };
  const baseline = summarize("baseline");
  const protectedSide = summarize("protected");

  const report = {
    version: "cost-experiment-report-v2",
    generatedAt: recordedAt,
    model: MODEL,
    scenario: apiConventionsScenario.id,
    task: TASK,
    trialsPerCondition: TRIALS_PER_CONDITION,
    maxAttempts: MAX_ATTEMPTS,
    pricingUsdPerMTokens: { input: PRICE_PER_M_INPUT, output: PRICE_PER_M_OUTPUT },
    conditions: {
      baseline: { ...baseline, estimatedUsd: usd(baseline.inputTokens, baseline.outputTokens) },
      protected: {
        ...protectedSide,
        estimatedUsd: usd(protectedSide.inputTokens, protectedSide.outputTokens),
      },
    },
    tokenImpact: ledger.tokenImpact(apiConventionsScenario.id),
    trials: results,
  };
  await writeFile(
    join(evidenceRoot, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const line = (label: string, s: ReturnType<typeof summarize>) =>
    `${label}: success ${s.successes}/${s.trials} (first-attempt ${s.firstAttemptSuccesses}), ` +
    `attempts ${s.attempts}, mean ${Math.round(s.meanTokens).toLocaleString("en-US")} ` +
    `median ${Math.round(s.medianTokens).toLocaleString("en-US")} ` +
    `sd ${Math.round(s.stdDevTokens).toLocaleString("en-US")}, ` +
    `est $${usd(s.inputTokens, s.outputTokens).toFixed(4)}`;

  console.log("\n=== Cost experiment 2 report ===");
  console.log(line("baseline ", baseline));
  console.log(line("protected", protectedSide));
  const impact = report.tokenImpact;
  if (impact) {
    console.log(
      `tokenImpact (mean): ${Math.round(impact.baselineTokens).toLocaleString("en-US")} → ` +
        `${Math.round(impact.protectedTokens).toLocaleString("en-US")} ` +
        `(savings ${(impact.savingsRate * 100).toFixed(1)}%)`,
    );
  }
  console.log(`Evidence written to ${evidenceRoot}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
