import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { convergenceCases } from "@/lib/eval/v3/cases";
import type { TestRunner } from "@/lib/eval/v3/oracle";
import { runConvergenceTrial } from "@/lib/eval/v3/runner";
import type { WorkerAdapter, WorkerTurnEvidence } from "@/lib/eval/v3/worker";
import { idempotencyScenario } from "@/lib/scenario/idempotency";

const root = process.cwd();
const testCase = convergenceCases[0]!;
const tempDirs: string[] = [];

function staticWorker(model: string): WorkerAdapter {
  const evidence: WorkerTurnEvidence = {
    command: "codex exec --json --sandbox workspace-write --ephemeral",
    exitCode: 0,
    turnCompleted: true,
    threadId: null,
    events: [],
    stdout: "",
    stderr: "",
    finalOutput: null,
  };
  return {
    id: `mock:${model}`,
    model,
    async runTurn() {
      return evidence;
    },
  };
}

const passingTests: TestRunner = async () => ({ exitCode: 0, stdout: "", stderr: "" });
const failingTests: TestRunner = async () => ({ exitCode: 1, stdout: "", stderr: "failed" });

async function makeEvidenceDirectory(): Promise<string> {
  const dir = await mkdtemp(join(root, ".memosprout-local", "convergence-runner-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runConvergenceTrial (model-free)", () => {
  it("scores a passing protected trial as a safe first pass", async () => {
    const evidenceDirectory = await makeEvidenceDirectory();
    const run = await runConvergenceTrial({
      scenario: idempotencyScenario,
      testCase,
      trialId: "trial-01",
      condition: "cheap-protected",
      worker: staticWorker("gpt-5.4-mini"),
      runAcceptanceTests: passingTests,
      runOrdinaryTests: passingTests,
      evidenceDirectory,
      promptTemplate: "{{TASK}}",
    });

    expect(run.condition).toBe("cheap-protected");
    expect(run.outcome.taskSuccess).toBe(true);
    expect(run.outcome.policyViolation).toBe(false);
    expect(run.outcome.firstPass).toBe(true);
    expect(run.exposure.durableGuidance).toBe(true);

    const persisted = JSON.parse(
      await readFile(
        join(evidenceDirectory, testCase.id, "trial-01", "cheap-protected", "run.json"),
        "utf8",
      ),
    ) as { runId: string };
    expect(persisted.runId).toBe(run.runId);
  });

  it("scores a failing acceptance suite as an unsuccessful trial", async () => {
    const evidenceDirectory = await makeEvidenceDirectory();
    const run = await runConvergenceTrial({
      scenario: idempotencyScenario,
      testCase,
      trialId: "trial-01",
      condition: "cheap-baseline",
      worker: staticWorker("gpt-5.4-mini"),
      runAcceptanceTests: failingTests,
      runOrdinaryTests: passingTests,
      evidenceDirectory,
      promptTemplate: "{{TASK}}",
    });

    expect(run.outcome.taskSuccess).toBe(false);
    expect(run.outcome.firstPass).toBe(false);
    expect(run.evidence.oracle.reason).toBe("acceptance-suite-failed");
    expect(run.exposure.durableGuidance).toBe(false);
  });

  it("flags a policy violation when the worker mutates a guarded file", async () => {
    const evidenceDirectory = await makeEvidenceDirectory();
    const tamperingWorker: WorkerAdapter = {
      id: "mock:tamper",
      model: "gpt-5.4-mini",
      async runTurn({ repositoryRoot }): Promise<WorkerTurnEvidence> {
        await writeFile(
          join(repositoryRoot, "src/payment-store.ts"),
          "// tampered provided primitive\n",
          "utf8",
        );
        return {
          command: "codex exec --json --sandbox workspace-write --ephemeral",
          exitCode: 0,
          turnCompleted: true,
          threadId: null,
          events: [],
          stdout: "",
          stderr: "",
          finalOutput: null,
        };
      },
    };

    const run = await runConvergenceTrial({
      scenario: idempotencyScenario,
      testCase,
      trialId: "trial-01",
      condition: "cheap-protected",
      worker: tamperingWorker,
      runAcceptanceTests: passingTests,
      runOrdinaryTests: passingTests,
      evidenceDirectory,
      promptTemplate: "{{TASK}}",
    });

    expect(run.evidence.policyViolation).toBe(true);
    expect(run.outcome.policyViolation).toBe(true);
    expect(run.outcome.firstPass).toBe(false);
  });
});
