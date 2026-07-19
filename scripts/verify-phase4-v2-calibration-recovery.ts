import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  assertRecoveryNode24,
  loadAndVerifyRecoveryLauncherAmendment,
  preflightRecoveryLauncher,
  runRecoveryLauncher,
} from "@/lib/eval/v2/calibration-recovery-launcher";
import {
  deriveRecoveryRuntimeAuthorizationId,
  deriveRecoveryQueue,
  recoveryPublicManifestSchema,
  recoveryRunRecordSchema,
  recoveryRuntimeAuthorizationEnvironmentKey,
} from "@/lib/eval/v2/calibration-recovery-runner";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
  loadRecoveryDesign,
  recoveryReportSchema,
} from "@/lib/eval/v2/calibration-recovery";
import { sha256 } from "@/lib/eval/v2/design";

const root = process.cwd();
const [recovery, queue] = await Promise.all([
  loadRecoveryDesign(root),
  deriveRecoveryQueue(root),
  assertOriginalCalibrationImmutable(root),
  assertRecoveryFrozenInputs(root),
  loadAndVerifyRecoveryLauncherAmendment(root),
]);

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const [launcherSource, processAdapterSource, liveAdapterSource] = await Promise.all([
  readFile(join(root, "scripts/launch-phase4-v2-calibration-recovery-v1.ts"), "utf8"),
  readFile(join(root, "scripts/run-phase4-v2-calibration-recovery.ts"), "utf8"),
  readFile(join(root, "lib/eval/v2/calibration-recovery-live.ts"), "utf8"),
]);
if (
  packageJson.scripts?.["phase4:v2:worker:calibrate:recover-v1"] !==
  "tsx scripts/launch-phase4-v2-calibration-recovery-v1.ts"
) {
  throw new Error("The frozen recovery command is missing or points to an unexpected runner.");
}
if (
  !launcherSource.includes("async function main(): Promise<void>") ||
  !launcherSource.includes("main().catch((error) => {") ||
  launcherSource.match(/^\s*await\s/m) ||
  launcherSource.includes("tsx -e") ||
  !launcherSource.includes("executeRecoveryProcess") ||
  !processAdapterSource.includes("executeLiveRecoveryTrial") ||
  !liveAdapterSource.includes("dirname(process.execPath)")
) {
  throw new Error("The dedicated Node 24 recovery adapter is not fully wired.");
}
if (recovery.contract.executionAuthorized !== false) {
  throw new Error("Calibration-recovery execution authorization changed unexpectedly.");
}

const expectedQueue = [
  "calibration-add-office-extension:trial-02",
  "calibration-repair-contact-url-drift:trial-01",
  "calibration-repair-contact-url-drift:trial-02",
];
assertRecoveryNode24(process.versions.node);
const boundaryEvents: string[] = [];
const getBoundaryCount = (): number => boundaryEvents.length;
const getActualCodexSpawnCount = (): number => 0;
const absentResult = await runRecoveryLauncher({
  root,
  environment: {},
  executeBoundary: async () => {
    boundaryEvents.push("unexpected-absent-boundary");
  },
});
if (absentResult.exitCode !== 2) {
  throw new Error("Absent recovery authorization did not map to local exit code 2.");
}
if (boundaryEvents.length !== 0) throw new Error("Unauthorized recovery reached the execution boundary.");

const mismatchEnvironment: Record<string, string | undefined> = {
  [recoveryRuntimeAuthorizationEnvironmentKey]: "incorrect-runtime-authorization",
};
const mismatchResult = await runRecoveryLauncher({
  root,
  environment: mismatchEnvironment,
  executeBoundary: async () => {
    boundaryEvents.push("unexpected-mismatch-boundary");
  },
});
if (mismatchResult.exitCode !== 2) {
  throw new Error("Mismatched recovery authorization did not map to local exit code 2.");
}
if (boundaryEvents.length !== 0) throw new Error("Mismatched authorization reached the boundary.");

const evidenceRoot = join(root, recovery.manifest.publicEvidenceRoot);
const evidenceExists = await stat(evidenceRoot).then(
  () => true,
  (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return false;
  },
);

if (!evidenceExists) {
  if (
    JSON.stringify(queue.map((entry) => `${entry.taskId}:${entry.trialId}`)) !==
      JSON.stringify(expectedQueue) ||
    queue.some((entry) => entry.action !== "execute-unstarted")
  ) {
    throw new Error("Recovery implementation queue differs from the frozen eligibility set.");
  }
  const authorization = await deriveRecoveryRuntimeAuthorizationId(root);
  const authorizedEnvironment: Record<string, string | undefined> = {
    ...process.env,
    [recoveryRuntimeAuthorizationEnvironmentKey]: authorization,
  };
  const launch = await runRecoveryLauncher({
    root,
    environment: authorizedEnvironment,
    preflight: preflightRecoveryLauncher,
    executeBoundary: async () => {
      boundaryEvents.push("injected-authorized-boundary");
    },
  });
  if (launch.exitCode !== 0 || getBoundaryCount() !== 1 || getActualCodexSpawnCount() !== 0) {
    throw new Error("Correct authorization did not reach only the injected boundary.");
  }
  if (authorizedEnvironment[recoveryRuntimeAuthorizationEnvironmentKey] !== undefined) {
    throw new Error("Runtime authorization was not consumed before queue derivation.");
  }
  process.stdout.write(
    `Phase 4 v2 calibration-recovery launcher verified without model execution: Node ${process.versions.node}, Codex ${launch.preflight?.codexCliVersion}, authentication ${launch.preflight?.authenticationCategory}, ${queue.length} frozen trials queued, injected boundary count ${boundaryEvents.length}, Codex process count ${getActualCodexSpawnCount()}.\n`,
  );
} else {
  if (queue.length !== 0) throw new Error("Completed recovery evidence leaves trials queued.");
  const [manifestText, reportText, authorization] = await Promise.all([
    readFile(join(evidenceRoot, recovery.manifest.finalManifestFile), "utf8"),
    readFile(join(evidenceRoot, recovery.manifest.finalReportFile), "utf8"),
    deriveRecoveryRuntimeAuthorizationId(root),
  ]);
  const manifest = recoveryPublicManifestSchema.parse(JSON.parse(manifestText));
  const report = recoveryReportSchema.parse(JSON.parse(reportText));
  const contents: string[] = [manifestText, reportText];
  for (const file of manifest.files) {
    const content = await readFile(join(root, file.path), "utf8");
    if (sha256(content) !== file.sha256) {
      throw new Error(`Recovery public evidence hash mismatch: ${file.path}.`);
    }
    assertSanitizedEvidence(content);
    if (content.includes(authorization)) {
      throw new Error("Recovery public evidence contains runtime authorization material.");
    }
    contents.push(content);
  }
  const runs = manifest.files
    .filter((file) => file.path.endsWith("/run.json"))
    .map((file) =>
      recoveryRunRecordSchema.parse(
        JSON.parse(contents[manifest.files.indexOf(file) + 2] ?? "null"),
      ),
    );
  if (
    runs.length !== 3 ||
    new Set(runs.map((run) => `${run.taskId}:${run.trialId}`)).size !== 3 ||
    runs.some(
      (run) =>
        !run.snapshots.evaluatorUnchanged ||
        run.snapshots.afterSha256 !== run.snapshots.postEvaluationSha256 ||
        run.modelOutcomeRetries !== 0 ||
        run.infrastructureRetries > 1,
    )
  ) {
    throw new Error("Recovery run uniqueness, retry, or non-mutation verification failed.");
  }
  if (
    report.fixedFirstOutcome.safeFirstPass !== false ||
    report.fixedFirstOutcome.neverRerun !== true ||
    report.futureOutcomes.length !== 3
  ) {
    throw new Error("Recovery report does not preserve the immutable first outcome.");
  }
  if (manifestText.includes(".memosprout-local") || reportText.includes(".memosprout-local")) {
    throw new Error("Recovery public evidence references local-only raw evidence.");
  }
  process.stdout.write(
    `Phase 4 v2 calibration-recovery evidence verified: ${report.safeFirstPassCount}/4 (${report.safeFirstPassRate}), ${report.classification}, 3 unique recovery runs, evaluator non-mutating.\n`,
  );
}
