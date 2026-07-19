import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { z } from "zod";

import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
  loadRecoveryDesign,
} from "@/lib/eval/v2/calibration-recovery";
import {
  assertRecoveryRuntimeAuthorization,
  consumeRecoveryRuntimeAuthorization,
  deriveRecoveryQueue,
  type RecoveryQueueEntry,
} from "@/lib/eval/v2/calibration-recovery-runner";
import { assertPhase4V2Design, sha256 } from "@/lib/eval/v2/design";
import { materializeIsolatedCodexRuntime } from "@/lib/eval/v2/isolated-runtime";

export const recoveryLauncherAmendmentPath =
  "demo/generated-files/evaluation/v2/calibration-recovery/launcher-hotfix/v1/infrastructure-amendment.json";
export const recoveryLauncherManifestPath =
  "demo/generated-files/evaluation/v2/calibration-recovery/launcher-hotfix/v1/manifest.json";

const launchSchema = z
  .object({
    sequence: z.number().int().min(1).max(2),
    nodeVersion: z.string().min(1),
    failureCode: z.enum([
      "node-sqlite-unavailable",
      "inline-tsx-cjs-top-level-await",
    ]),
    queueReached: z.literal(false),
    codexProcessStarted: z.literal(false),
    completedCodexTurns: z.literal(0),
    modelOutcomesObserved: z.literal(0),
    calibrationEvidenceCreated: z.literal(false),
  })
  .strict();

export const recoveryLauncherAmendmentSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-launcher-amendment-v1"),
    sourceTag: z.literal("build-week-phase-4-v2-calibration-recovery-runner"),
    sourceCommit: z.literal("177074eac9b7bd4e7714c27a40b63f242e793ad9"),
    scope: z.literal("infrastructure-only-before-queue-execution"),
    launches: z.tuple([launchSchema, launchSchema]),
    aggregate: z
      .object({
        infrastructureLaunchCount: z.literal(2),
        queueExecutionCount: z.literal(0),
        codexProcessCount: z.literal(0),
        completedCodexTurnCount: z.literal(0),
        modelOutcomeCount: z.literal(0),
        calibrationEvidenceFileCount: z.literal(0),
      })
      .strict(),
    retryAccounting: z
      .object({
        originalInfrastructureRetryAllowanceExhausted: z.literal(true),
        originalCalibrationRetryPolicyReinterpreted: z.literal(false),
        futureCorrectedLaunchAuthorized: z.literal(false),
        separateHumanAuthorizationRequired: z.literal(true),
        futureCorrectedLaunchMaximum: z.literal(1),
      })
      .strict(),
    immutability: z
      .object({
        frozenContractsChanged: z.literal(false),
        frozenHashesRegenerated: z.literal(false),
        existingEvidenceChanged: z.literal(false),
        executionAuthorizedFlagRemainsFalse: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.launches[0].sequence !== 1 || record.launches[1].sequence !== 2) {
      context.addIssue({ code: "custom", message: "Launch order is not immutable." });
    }
  });

export const recoveryLauncherManifestSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-launcher-manifest-v1"),
    files: z.tuple([
      z
        .object({
          path: z.literal(recoveryLauncherAmendmentPath),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ]),
  })
  .strict();

const expectedQueue = [
  "calibration-add-office-extension:trial-02",
  "calibration-repair-contact-url-drift:trial-01",
  "calibration-repair-contact-url-drift:trial-02",
] as const;

export class RecoveryNodeVersionError extends Error {
  constructor() {
    super("Phase 4 v2 calibration recovery requires Node.js 24.x.");
    this.name = "RecoveryNodeVersionError";
  }
}

export function assertRecoveryNode24(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion.split(".")[0] ?? "", 10) !== 24) {
    throw new RecoveryNodeVersionError();
  }
}

function resolveCommand(command: "codex", root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-c", `command -v ${command}`], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      const executable = stdout.trim();
      if (code !== 0 || !executable.startsWith("/")) {
        reject(new Error("Codex CLI is unavailable."));
      } else {
        resolve(executable);
      }
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}

export async function loadAndVerifyRecoveryLauncherAmendment(root = process.cwd()) {
  const [amendmentText, manifestText] = await Promise.all([
    readFile(join(root, recoveryLauncherAmendmentPath), "utf8"),
    readFile(join(root, recoveryLauncherManifestPath), "utf8"),
  ]);
  const amendment = recoveryLauncherAmendmentSchema.parse(JSON.parse(amendmentText));
  const manifest = recoveryLauncherManifestSchema.parse(JSON.parse(manifestText));
  if (manifest.files[0].sha256 !== sha256(amendmentText)) {
    throw new Error("Recovery launcher amendment hash verification failed.");
  }
  return { amendment, manifest };
}

export interface RecoveryLauncherPreflightResult {
  queue: RecoveryQueueEntry[];
  codexCliVersion: string;
  authenticationCategory: "auth-file" | "environment";
}

export async function preflightRecoveryLauncher(
  root = process.cwd(),
): Promise<RecoveryLauncherPreflightResult> {
  const [recovery, queue, codexExecutable, design] = await Promise.all([
    loadRecoveryDesign(root),
    deriveRecoveryQueue(root),
    resolveCommand("codex", root),
    assertPhase4V2Design(root),
  ]);
  await Promise.all([
    assertOriginalCalibrationImmutable(root),
    assertRecoveryFrozenInputs(root),
    loadAndVerifyRecoveryLauncherAmendment(root),
  ]);
  if (recovery.contract.executionAuthorized !== false) {
    throw new Error("Frozen recovery executionAuthorized flag changed unexpectedly.");
  }
  if (
    JSON.stringify(queue.map((entry) => `${entry.taskId}:${entry.trialId}`)) !==
      JSON.stringify(expectedQueue) ||
    queue.some((entry) => entry.action !== "execute-unstarted" || entry.sequenceIndex === 1)
  ) {
    throw new Error("Recovery launcher queue differs from the frozen three-trial order.");
  }
  if (
    (await pathExists(join(root, recovery.manifest.publicEvidenceRoot))) ||
    (await pathExists(join(root, recovery.manifest.localOnlyRawEvidenceRoot)))
  ) {
    throw new Error("Unexpected calibration-recovery evidence exists before corrected launch.");
  }
  await access(codexExecutable, constants.X_OK);
  const runtime = await materializeIsolatedCodexRuntime();
  try {
    return {
      queue,
      codexCliVersion: design.workerConfig.codexCliVersion,
      authenticationCategory: runtime.authenticationMode,
    };
  } finally {
    await runtime.cleanup();
  }
}

export interface RecoveryLauncherResult {
  exitCode: 0 | 2;
  diagnostic?: string;
  preflight?: RecoveryLauncherPreflightResult;
}

export async function runRecoveryLauncher(options: {
  root?: string;
  argv?: string[];
  environment: Record<string, string | undefined>;
  nodeVersion?: string;
  preflight?: (root: string) => Promise<RecoveryLauncherPreflightResult>;
  executeBoundary: (authorization: string) => Promise<void>;
}): Promise<RecoveryLauncherResult> {
  const root = options.root ?? process.cwd();
  assertRecoveryNode24(options.nodeVersion ?? process.versions.node);
  const authorization = consumeRecoveryRuntimeAuthorization(options.environment);
  try {
    await assertRecoveryRuntimeAuthorization({ root, provided: authorization });
  } catch (error) {
    return {
      exitCode: 2,
      diagnostic: error instanceof Error ? error.message : "Recovery authorization failed.",
    };
  }
  const preflight = await (options.preflight ?? preflightRecoveryLauncher)(root);
  await options.executeBoundary(authorization as string);
  return { exitCode: 0, preflight };
}

export function sanitizeRecoveryLauncherError(error: unknown): string {
  if (error instanceof RecoveryNodeVersionError) return error.message;
  return "Phase 4 v2 calibration-recovery launcher failed before a completed model turn.";
}
