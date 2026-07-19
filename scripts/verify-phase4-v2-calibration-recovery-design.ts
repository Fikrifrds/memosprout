import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
  createRecoveryLedger,
  deriveRecoveryEligibility,
  isSensitiveRecoveryEnvironmentKey,
  loadRecoveryDesign,
  recoveryPaths,
} from "@/lib/eval/v2/calibration-recovery";
import { assertPhase4V2Design } from "@/lib/eval/v2/design";

const root = process.cwd();

function runGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Git ignore verification failed: ${stderr}`));
    });
  });
}

async function assertAbsent(path: string): Promise<void> {
  await stat(join(root, path)).then(
    () => {
      throw new Error(`Unauthorized calibration-recovery evidence exists: ${path}.`);
    },
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
}

const [design, recovery] = await Promise.all([
  assertPhase4V2Design(),
  loadRecoveryDesign(),
  assertOriginalCalibrationImmutable(),
  assertRecoveryFrozenInputs(),
  loadAndAssertCodexOutputSchema(join(root, recoveryPaths.workerOutputSchema)),
  loadAndAssertCodexOutputSchema(join(root, recoveryPaths.completionMarkerSchema)),
  loadAndAssertCodexOutputSchema(join(root, recoveryPaths.reportSchema)),
]);

const originalTasks = design.calibration.tasks.map((task) => task.id);
const recoveryTasks = recovery.eligibility.frozenTrialOrder.map((trial) => trial.taskId);
if (
  JSON.stringify([...new Set(recoveryTasks)]) !== JSON.stringify(originalTasks) ||
  recovery.contract.worker.model !== design.calibration.primaryCandidate.model ||
  recovery.contract.worker.reasoningEffort !==
    design.calibration.primaryCandidate.reasoningEffort ||
  recovery.contract.selectionThresholds.acceptableMinimum !==
    design.calibration.selectionRule.acceptableSafeFirstPassRateMinimum ||
  recovery.contract.selectionThresholds.acceptableMaximum !==
    design.calibration.selectionRule.acceptableSafeFirstPassRateMaximum ||
  recovery.contract.futureExecution.maximumInfrastructureRetriesPerTrial !==
    design.workerConfig.retryPolicy.infrastructureRetries ||
  recovery.contract.futureExecution.infrastructureRetryOnlyBeforeCompletedTurn !==
    design.workerConfig.retryPolicy.infrastructureRetryOnlyBeforeCompletedTurn ||
  design.workerConfig.retryPolicy.modelOutcomeRetries !== 0
) {
  throw new Error("Calibration recovery changes a frozen worker, task, threshold, or retry rule.");
}

const eligible = deriveRecoveryEligibility(createRecoveryLedger(recovery.eligibility)).map(
  (trial) => `${trial.taskId}:${trial.trialId}`,
);
if (JSON.stringify(eligible) !== JSON.stringify(recovery.eligibility.eligibleTrialKeys)) {
  throw new Error("Calibration-recovery eligibility differs from durable evidence.");
}
const durabilityStages: readonly string[] = recovery.durability.stages;
if (
  durabilityStages.indexOf("completion-marker-persisted") >=
    durabilityStages.indexOf("sanitation-scan-passed") ||
  durabilityStages.indexOf("committed-evidence-verified") >=
    durabilityStages.indexOf("cleanup-complete")
) {
  throw new Error("Calibration-recovery durability ordering is unsafe.");
}
if (isSensitiveRecoveryEnvironmentKey("SHELL", recovery.scanner)) {
  throw new Error("The recovery scanner still treats SHELL as credential material.");
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
if (
  packageJson.scripts?.["phase4:v2:worker:calibrate:recover-v1"] !==
  "tsx scripts/launch-phase4-v2-calibration-recovery-v1.ts"
) {
  throw new Error("The guarded future recovery command is not installed correctly.");
}

const modelFacingSchema = await readFile(join(root, recoveryPaths.workerOutputSchema), "utf8");
for (const task of design.corpus.tasks) {
  for (const forbidden of [task.id, task.requestedField, task.instruction]) {
    if (modelFacingSchema.includes(forbidden)) {
      throw new Error("The recovery worker schema exposes scored corpus content.");
    }
  }
}
if (modelFacingSchema.includes("preferred_language")) {
  throw new Error("The recovery worker schema exposes reserved task content.");
}

await Promise.all([
  runGit(["check-ignore", "-q", ".memosprout-local/calibration-recovery/v1/example/raw-trace.jsonl"]),
  assertAbsent(recovery.manifest.publicEvidenceRoot),
]);

process.stdout.write(
  `Phase 4 v2 calibration-recovery design verified without model execution: ${eligible.length} eligible trials, fixed unsafe first outcome, ${recovery.durability.stages.length} durability stages, execution unauthorized.\n`,
);
