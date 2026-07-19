import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  deriveRecoveryRuntimeAuthorizationId,
  deriveRecoveryQueue,
  runRecoveryCli,
  runRecoveryCommand,
} from "@/lib/eval/v2/calibration-recovery-runner";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
  loadRecoveryDesign,
} from "@/lib/eval/v2/calibration-recovery";

const root = process.cwd();
const [recovery, queue] = await Promise.all([
  loadRecoveryDesign(root),
  deriveRecoveryQueue(root),
  assertOriginalCalibrationImmutable(root),
  assertRecoveryFrozenInputs(root),
]);

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
if (
  packageJson.scripts?.["phase4:v2:worker:calibrate:recover-v1"] !==
  "tsx scripts/run-phase4-v2-calibration-recovery.ts"
) {
  throw new Error("The frozen recovery command is missing or points to an unexpected runner.");
}
if (recovery.contract.executionAuthorized !== false) {
  throw new Error("Calibration-recovery execution authorization changed unexpectedly.");
}

const expectedQueue = [
  "calibration-add-office-extension:trial-02",
  "calibration-repair-contact-url-drift:trial-01",
  "calibration-repair-contact-url-drift:trial-02",
];
if (
  JSON.stringify(queue.map((entry) => `${entry.taskId}:${entry.trialId}`)) !==
    JSON.stringify(expectedQueue) ||
  queue.some((entry) => entry.action !== "execute-unstarted")
) {
  throw new Error("Recovery implementation queue differs from the frozen eligibility set.");
}

const boundaryTrials: string[] = [];
function assertBoundaryCount(expected: number, message: string): void {
  if (boundaryTrials.length !== expected) throw new Error(message);
}
const absentResult = await runRecoveryCli({
  root,
  argv: [],
  runtimeAuthorization: undefined,
  spawnTrial: async () => {
    boundaryTrials.push("unexpected-absent-authorization-boundary");
    throw new Error("Codex spawn callback must remain unreachable.");
  },
  scanPublicEvidence: async () => undefined,
  cleanupPreservedRepository: async () => undefined,
});
if (absentResult.exitCode !== 2) {
  throw new Error("Absent recovery authorization did not map to local exit code 2.");
}
assertBoundaryCount(0, "Unauthorized recovery reached the Codex spawn boundary.");

const mismatchResult = await runRecoveryCli({
  root,
  argv: [],
  runtimeAuthorization: "incorrect-runtime-authorization",
  spawnTrial: async () => {
    boundaryTrials.push("unexpected-mismatched-authorization-boundary");
    throw new Error("Codex spawn callback must remain unreachable.");
  },
  scanPublicEvidence: async () => undefined,
  cleanupPreservedRepository: async () => undefined,
});
if (mismatchResult.exitCode !== 2) {
  throw new Error("Mismatched recovery authorization did not map to local exit code 2.");
}
assertBoundaryCount(0, "Mismatched authorization reached the spawn boundary.");

const boundaryReached = new Error("injected-execution-boundary-reached");
await runRecoveryCommand({
  root,
  argv: [],
  runtimeAuthorization: await deriveRecoveryRuntimeAuthorizationId(root),
  spawnTrial: async (trial) => {
    boundaryTrials.push(`${trial.taskId}:${trial.trialId}`);
    if (`${trial.taskId}:${trial.trialId}` !== expectedQueue[0]) {
      throw new Error("Runtime authorization changed frozen queue ordering.");
    }
    throw boundaryReached;
  },
  scanPublicEvidence: async () => undefined,
  cleanupPreservedRepository: async () => undefined,
}).then(
  () => {
    throw new Error("Injected recovery boundary unexpectedly returned.");
  },
  (error: unknown) => {
    if (error !== boundaryReached) throw error;
  },
);
assertBoundaryCount(1, "Correct authorization did not reach exactly one boundary.");

await stat(join(root, recovery.manifest.publicEvidenceRoot)).then(
  () => {
    throw new Error("Unauthorized recovery evidence exists.");
  },
  (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  },
);

process.stdout.write(
  `Phase 4 v2 calibration-recovery implementation verified without model execution: ${queue.length} frozen trials queued, injected boundary count ${boundaryTrials.length}, Codex process count 0.\n`,
);
