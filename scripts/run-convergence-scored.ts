import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  type ScenarioControlResult,
  evaluateScenarioControl,
} from "@/lib/eval/engine/runner";
import {
  type ConvergenceCondition,
  convergenceCases,
  convergenceControlIds,
  frozenConvergenceRubricSha256,
} from "@/lib/eval/v3/cases";
import { verifyConvergenceDesign } from "@/lib/eval/v3/contract";
import { FrontierApiWorkerAdapter } from "@/lib/eval/v3/frontier-worker";
import type { TestRunner } from "@/lib/eval/v3/oracle";
import {
  assertConvergenceGate,
  buildConvergenceReport,
  type ConvergenceRun,
} from "@/lib/eval/v3/report";
import { runConvergenceTrial } from "@/lib/eval/v3/runner";
import { idempotencyScenario, idempotencyScenarioPaths } from "@/lib/scenario/idempotency";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "idempotency", "evidence", "convergence", "live");
const evidenceRootRelative = "demo/idempotency/evidence/convergence/live";

const correctIdempotentHandler = `import type { PaymentStore } from "./payment-store";
import type { OrderStatus, PaymentEvent } from "./types";

const statusByType: Record<PaymentEvent["type"], OrderStatus> = {
  payment_pending: "pending",
  payment_succeeded: "paid",
  payment_failed: "failed",
};

export function handlePaymentEvent(store: PaymentStore, event: PaymentEvent): void {
  if (store.hasProcessedEvent(event.eventId)) {
    return;
  }
  store.markEventProcessed(event.eventId);
  const existing = store.getOrder(event.orderId);
  if (existing?.status === "paid" || existing?.status === "failed") {
    return;
  }
  const nextStatus = statusByType[event.type];
  store.upsertOrder({ orderId: event.orderId, status: nextStatus, amountCents: event.amountCents });
  if (nextStatus === "paid") {
    store.recordCharge(event.orderId, event.amountCents);
  }
}
`;

const correctTerminalStateHandler = `import type { PaymentStore } from "./payment-store";
import type { OrderStatus, PaymentEvent } from "./types";

const statusByType: Record<PaymentEvent["type"], OrderStatus> = {
  payment_pending: "pending",
  payment_succeeded: "paid",
  payment_failed: "failed",
};

const terminalStatuses: ReadonlySet<OrderStatus> = new Set(["paid", "failed"]);

export function handlePaymentEvent(store: PaymentStore, event: PaymentEvent): void {
  if (store.hasProcessedEvent(event.eventId)) {
    return;
  }
  const existing = store.getOrder(event.orderId);
  const nextStatus = statusByType[event.type];
  if (existing && terminalStatuses.has(existing.status)) {
    store.markEventProcessed(event.eventId);
    return;
  }
  store.upsertOrder({ orderId: event.orderId, status: nextStatus, amountCents: event.amountCents });
  if (event.type === "payment_succeeded") {
    store.recordCharge(event.orderId, event.amountCents);
  }
  store.markEventProcessed(event.eventId);
}
`;

const controlHandlers: Record<string, string> = {
  "correct-idempotent-handler": correctIdempotentHandler,
  "correct-terminal-state-handler": correctTerminalStateHandler,
};

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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
const runOrdinaryTests: TestRunner = (repositoryRoot) =>
  runVitest(repositoryRoot, "tests/handler.test.ts");

function modelForCondition(
  condition: ConvergenceCondition,
  cheapModel: string,
  frontierModel: string,
): string {
  return condition === "frontier-baseline" ? frontierModel : cheapModel;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required for the scored convergence run.");
    process.exit(1);
  }

  const design = await verifyConvergenceDesign(root, { allowExistingEvidence: true });
  const cheapModel = design.contract.worker.cheapModel;
  const frontierModel = design.contract.worker.frontierModel;
  const trialsPerCase = design.contract.trialsPerCase;
  const conditions = design.contract.conditions;
  const promptTemplate = await readFile(
    join(root, "demo", "idempotency", "evaluation", "prompts", "task.md"),
    "utf8",
  );

  console.log(
    `Scored convergence run: cheap=${cheapModel} frontier=${frontierModel} ` +
      `trialsPerCase=${trialsPerCase} conditions=${conditions.join(",")}`,
  );

  await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });

  const runs: ConvergenceRun[] = [];
  for (const testCase of convergenceCases) {
    for (const condition of conditions) {
      const model = modelForCondition(condition, cheapModel, frontierModel);
      for (let trial = 1; trial <= trialsPerCase; trial += 1) {
        const trialId = `trial-${trial.toString().padStart(2, "0")}`;
        const worker = new FrontierApiWorkerAdapter({ model, apiKey });
        const run = await runConvergenceTrial({
          scenario: idempotencyScenario,
          testCase,
          trialId,
          condition,
          worker,
          runAcceptanceTests,
          runOrdinaryTests,
          evidenceDirectory: evidenceRoot,
          promptTemplate,
        });
        console.log(
          `${condition} ${trialId}: taskSuccess=${run.outcome.taskSuccess} ` +
            `policyViolation=${run.outcome.policyViolation} firstPass=${run.outcome.firstPass}`,
        );
        runs.push(run);
      }
    }
  }

  const controls: ScenarioControlResult[] = [];
  for (const controlId of convergenceControlIds) {
    const handlerSource = controlHandlers[controlId];
    if (!handlerSource) throw new Error(`No reference handler for control ${controlId}.`);
    const control = await evaluateScenarioControl({
      scenario: idempotencyScenario,
      controlId,
      implementationPath: idempotencyScenarioPaths.handler,
      correctSource: handlerSource,
      runAcceptanceTests,
    });
    console.log(`control ${control.id}: observed=${control.observed} passed=${control.passed}`);
    controls.push(control);
  }

  await writeFile(
    join(evidenceRoot, "controls.json"),
    `${JSON.stringify(controls, null, 2)}\n`,
    "utf8",
  );

  const manifestEntries: Array<{ path: string; sha256: string }> = [];
  for (const run of runs) {
    const runDir = join(evidenceRoot, run.case.id, run.trialId, run.condition);
    const runJsonRelative = relative(root, join(runDir, "run.json"));
    manifestEntries.push({ path: runJsonRelative, sha256: sha256Hex(await readFile(join(runDir, "run.json"))) });
    for (const artifactPath of [run.artifacts.trace, run.artifacts.patch]) {
      manifestEntries.push({ path: artifactPath, sha256: sha256Hex(await readFile(join(root, artifactPath))) });
    }
  }
  manifestEntries.push({
    path: `${evidenceRootRelative}/controls.json`,
    sha256: sha256Hex(await readFile(join(evidenceRoot, "controls.json"))),
  });
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    version: "convergence-evidence-manifest-v1",
    generatedAt: new Date().toISOString(),
    rubricSha256: frozenConvergenceRubricSha256,
    entries: manifestEntries,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(evidenceRoot, "manifest.json"), manifestText, "utf8");
  const evidenceManifestSha256 = sha256Hex(manifestText);

  const report = buildConvergenceReport({
    source: "live",
    createdAt: new Date().toISOString(),
    rubricSha256: frozenConvergenceRubricSha256,
    rubricPath: "demo/idempotency/evaluation/rubric.json",
    runs,
    controls,
    evidenceManifestPath: `${evidenceRootRelative}/manifest.json`,
    evidenceManifestSha256,
  });
  await writeFile(
    join(evidenceRoot, "convergence-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log("\nmetrics:", JSON.stringify(report.metrics, null, 2));
  try {
    assertConvergenceGate(report);
    console.log("CONVERGENCE GATE PASSED");
  } catch (error) {
    console.log(`CONVERGENCE GATE FAILED: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
