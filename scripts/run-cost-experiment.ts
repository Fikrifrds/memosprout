/**
 * Live token-cost experiment (tokens-to-success, BW-044).
 *
 * Measures real token consumption of a real agent tool-loop (read_file / write_file /
 * run_command against a real repository fixture) on the idempotency scenario, comparing:
 *
 *   - cheap-baseline:  gpt-5.4-mini without the sprout
 *   - cheap-protected: gpt-5.4-mini with the validated sprout (AGENTS.md guidance)
 *
 * Each trial allows up to MAX_ATTEMPTS attempts: after a failed oracle run the worker
 * receives the failing test output (as a CI report) and retries in the same repository —
 * the real wrong-attempt → feedback → re-run loop. tokens_to_success is the sum of API
 * token usage across all attempts of a trial. Results are appended to a real Outcome
 * Ledger file and summarized with OutcomeLedger.tokenImpact.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createScenarioOracle, type TestRunner } from "@/lib/eval/engine/oracle";
import { prepareScenarioRepository } from "@/lib/eval/engine/runner";
import { convergenceCases, renderConvergencePrompt } from "@/lib/eval/v3/cases";
import { FrontierApiWorkerAdapter } from "@/lib/eval/v3/frontier-worker";
import type { WorkerTokenUsage } from "@/lib/eval/v3/worker";
import { OutcomeLedger, saveOutcomeLedger } from "@/lib/ledger/ledger";
import { TOKENS_TO_SUCCESS, type OutcomeRecord } from "@/lib/ledger/schema";
import { idempotencyScenario } from "@/lib/scenario/idempotency";
import { idempotencySproutId } from "@/lib/mcp/seed";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "idempotency", "evidence", "cost-experiment");

const MODEL = "gpt-5.4-mini";
const TRIALS_PER_CONDITION = 3;
const MAX_ATTEMPTS = 3;

// gpt-5.4-mini standard pricing, USD per 1M tokens (OpenAI pricing page, 2026-07).
const PRICE_PER_M_INPUT = 0.75;
const PRICE_PER_M_OUTPUT = 4.5;

type Condition = "baseline" | "protected";

interface AttemptResult {
  attempt: number;
  oraclePassed: boolean;
  ordinaryPassed: boolean;
  policyViolation: boolean;
  /** Guarded files whose content the worker actually altered during this attempt. */
  violatedPaths: string[];
  /** Everything dirty in the repository after this attempt, for auditability. */
  repositoryChangedPaths: string[];
  usage: WorkerTokenUsage | null;
  /** Set when the worker turn itself failed (API/tool error), so the attempt is not silently
   * counted as an ordinary failed attempt. */
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
  runVitest(repositoryRoot, "tests/idempotency.acceptance.test.ts");

async function runGitStatus(repositoryRoot: string): Promise<string[]> {
  const result = await new Promise<{ exitCode: number; stdout: string }>((resolvePromise) => {
    const child = spawn("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.on("error", () => resolvePromise({ exitCode: -1, stdout }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? -1, stdout }));
  });
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "");
}

/**
 * Hash the content of every guarded file. A missing file hashes to "absent" so that a worker
 * deleting a guarded file, or creating one it should not, both register as changes.
 */
async function hashGuardedFiles(repositoryRoot: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const path of idempotencyScenario.guardedPaths) {
    try {
      const content = await readFile(join(repositoryRoot, path), "utf8");
      hashes.set(path, createHash("sha256").update(content).digest("hex"));
    } catch {
      hashes.set(path, "absent");
    }
  }
  return hashes;
}

/** Extract only failure summary lines from vitest output — a CI-style report, not the
 * held-out test source. */
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
    scenario: idempotencyScenario,
    exposeProtection: condition === "protected",
    root,
  });

  try {
    const promptTemplate = await readFile(
      join(root, "demo", "idempotency", "evaluation", "prompts", "task.md"),
      "utf8",
    );
    const renderedTask = renderConvergencePrompt(promptTemplate, convergenceCases[0]);
    let prompt = renderedTask;
    if (condition === "protected") {
      const sprout = await readFile(
        join(repositoryRoot, idempotencyScenario.sproutPath),
        "utf8",
      );
      prompt = `Project guidance (AGENTS.md):\n\n${sprout}\n\n${renderedTask}`;
    }
    prompt += `\n\nFor the final structured response, use taskId ${convergenceCases[0].id} and version 1.`;

    const oracle = await createScenarioOracle({
      scenario: idempotencyScenario,
      runAcceptanceTests,
      root,
    });

    const attempts: AttemptResult[] = [];
    const totalUsage: WorkerTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let success = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const guardedBefore = await hashGuardedFiles(repositoryRoot);
      const worker = new FrontierApiWorkerAdapter({ model: MODEL, apiKey });
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

      // Attribute a policy violation only when the worker actually altered a guarded file.
      // Comparing content hashes taken immediately before and after the worker turn is
      // unambiguous: it cannot be confused by the oracle materializing the held-out
      // acceptance test into the repository (which it does whenever that file is absent,
      // i.e. in every baseline attempt), nor by that file persisting into later attempts.
      const guardedAfter = await hashGuardedFiles(repositoryRoot);
      const violatedPaths = [...guardedAfter.keys()].filter(
        (path) => guardedAfter.get(path) !== guardedBefore.get(path),
      );
      const policyViolation = violatedPaths.length > 0;
      const repositoryChangedPaths = await runGitStatus(repositoryRoot);

      const oracleResult = await oracle.evaluate(repositoryRoot);
      const ordinary = await runVitest(repositoryRoot, "tests/handler.test.ts");
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
          "Your previous implementation of src/webhook-handler.ts does not pass review. " +
          "CI reports the following failures. Fix the implementation and run the tests again.\n\n" +
          `CI report:\n${failureSummary(
            `${acceptance.stdout}\n${ordinary.stdout}`,
            `${acceptance.stderr}\n${ordinary.stderr}`,
          )}\n\nFor the final structured response, use taskId ${convergenceCases[0].id} and version 1.`;
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

async function main(): Promise<void> {
  console.log(
    `Live cost experiment: model=${MODEL} trials=${TRIALS_PER_CONDITION}/condition ` +
      `maxAttempts=${MAX_ATTEMPTS} scenario=${idempotencyScenario.id}`,
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
      scenario: idempotencyScenario.id,
      domain: "coding",
      taskId: convergenceCases[0].id,
      model: MODEL,
      sproutIds: result.condition === "protected" ? [idempotencySproutId] : [],
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

  const impact = ledger.tokenImpact(idempotencyScenario.id);
  const byCondition = (condition: Condition) => results.filter((r) => r.condition === condition);
  const sums = (condition: Condition) => {
    const rows = byCondition(condition);
    return {
      successes: rows.filter((r) => r.success).length,
      trials: rows.length,
      attempts: rows.reduce((sum, r) => sum + r.attempts.length, 0),
      inputTokens: rows.reduce((sum, r) => sum + r.totalUsage.inputTokens, 0),
      outputTokens: rows.reduce((sum, r) => sum + r.totalUsage.outputTokens, 0),
      totalTokens: rows.reduce((sum, r) => sum + r.totalUsage.totalTokens, 0),
    };
  };
  const baseline = sums("baseline");
  const protectedSums = sums("protected");

  const report = {
    version: "cost-experiment-report-v1",
    generatedAt: recordedAt,
    model: MODEL,
    scenario: idempotencyScenario.id,
    trialsPerCondition: TRIALS_PER_CONDITION,
    maxAttempts: MAX_ATTEMPTS,
    pricingUsdPerMTokens: { input: PRICE_PER_M_INPUT, output: PRICE_PER_M_OUTPUT },
    conditions: {
      baseline: { ...baseline, estimatedUsd: usd(baseline.inputTokens, baseline.outputTokens) },
      protected: {
        ...protectedSums,
        estimatedUsd: usd(protectedSums.inputTokens, protectedSums.outputTokens),
      },
    },
    tokenImpact: impact,
    trials: results,
  };
  await writeFile(
    join(evidenceRoot, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log("\n=== Cost experiment report ===");
  console.log(
    `baseline : success ${baseline.successes}/${baseline.trials}, attempts ${baseline.attempts}, ` +
      `tokens ${baseline.totalTokens.toLocaleString("en-US")}, ` +
      `est $${usd(baseline.inputTokens, baseline.outputTokens).toFixed(4)}`,
  );
  console.log(
    `protected: success ${protectedSums.successes}/${protectedSums.trials}, attempts ${protectedSums.attempts}, ` +
      `tokens ${protectedSums.totalTokens.toLocaleString("en-US")}, ` +
      `est $${usd(protectedSums.inputTokens, protectedSums.outputTokens).toFixed(4)}`,
  );
  if (impact) {
    console.log(
      `tokenImpact: baseline avg ${Math.round(impact.baselineTokens).toLocaleString("en-US")} → ` +
        `protected avg ${Math.round(impact.protectedTokens).toLocaleString("en-US")} ` +
        `(savings ${(impact.savingsRate * 100).toFixed(1)}%)`,
    );
  } else {
    console.log("tokenImpact: not computable (missing usage data in one condition).");
  }
  console.log(`Evidence written to ${evidenceRoot}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
