import { timingSafeEqual } from "node:crypto";
import { readFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { z } from "zod";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  advanceRecoveryDurability,
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
  canCleanupRecovery,
  classifyRecoveredCalibration,
  createRecoveryDurabilityState,
  createRecoveryLedger,
  deriveRecoveryEligibility,
  loadRecoveryDesign,
  markRecoveryTrialCompleted,
  recordRecoveryScannerFailure,
  recoveryCompletionMarkerSchema,
  recoveryDurabilityStages,
  recoveryPaths,
  recoveryReportSchema,
  recoveryTrialKey,
  type RecoveryLedger,
} from "@/lib/eval/v2/calibration-recovery";
import { sha256 } from "@/lib/eval/v2/design";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const taskIdSchema = z.enum([
  "calibration-add-office-extension",
  "calibration-repair-contact-url-drift",
]);
const trialIdSchema = z.enum(["trial-01", "trial-02"]);
const recoveryAuthorizationDomain = "memosprout-runtime-recovery-authorization-v1";
export const recoveryRuntimeAuthorizationEnvironmentKey =
  "MEMOSPROUT_RECOVERY_AUTHORIZATION_ID";

export class RecoveryExecutionUnauthorizedError extends Error {
  constructor() {
    super(
      "Phase 4 v2 calibration recovery is installed but execution remains unauthorized; no Codex process was spawned.",
    );
    this.name = "RecoveryExecutionUnauthorizedError";
  }
}

export class RecoveryOperatorOverrideError extends Error {
  constructor() {
    super("Calibration recovery does not accept operator-supplied task or trial overrides.");
    this.name = "RecoveryOperatorOverrideError";
  }
}

export async function deriveRecoveryRuntimeAuthorizationId(
  root = process.cwd(),
): Promise<string> {
  const [contract, frozenInputs] = await Promise.all([
    readFile(join(root, recoveryPaths.contract)),
    readFile(join(root, recoveryPaths.frozenInputs)),
  ]);
  return sha256(
    `${recoveryAuthorizationDomain}\0${sha256(contract)}\0${sha256(frozenInputs)}`,
  );
}

export function consumeRecoveryRuntimeAuthorization(
  environment: Record<string, string | undefined>,
): string | undefined {
  const authorization = environment[recoveryRuntimeAuthorizationEnvironmentKey];
  delete environment[recoveryRuntimeAuthorizationEnvironmentKey];
  return authorization;
}

export async function assertRecoveryRuntimeAuthorization(options: {
  root: string;
  provided: string | undefined;
}): Promise<void> {
  if (!options.provided) throw new RecoveryExecutionUnauthorizedError();
  const expected = await deriveRecoveryRuntimeAuthorizationId(options.root);
  const providedDigest = Buffer.from(sha256(options.provided), "hex");
  const expectedDigest = Buffer.from(sha256(expected), "hex");
  if (!timingSafeEqual(providedDigest, expectedDigest)) {
    throw new RecoveryExecutionUnauthorizedError();
  }
}

const publicEvidenceFileSchema = z
  .object({
    path: z.string().min(1),
    sha256: sha256Schema,
  })
  .strict();

export const recoveryManifestEntrySchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-manifest-entry-v1"),
    stableResumeId: sha256Schema,
    taskId: taskIdSchema,
    trialId: trialIdSchema,
    files: z
      .array(publicEvidenceFileSchema)
      .length(3)
      .refine((files) => new Set(files.map((file) => file.path)).size === files.length),
  })
  .strict();

export const recoveryPublicManifestSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-public-manifest-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    files: z
      .array(publicEvidenceFileSchema)
      .min(16)
      .max(19)
      .refine((files) => new Set(files.map((file) => file.path)).size === files.length),
  })
  .strict();

export const recoveryRunRecordSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-run-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    calibrationOnly: z.literal(true),
    stableResumeId: sha256Schema,
    sequenceIndex: z.number().int().min(2).max(4),
    taskId: taskIdSchema,
    trialId: trialIdSchema,
    worker: z
      .object({ model: z.literal("gpt-5.4-mini"), reasoningEffort: z.literal("low") })
      .strict(),
    turnCompleted: z.literal(true),
    modelOutcomeRetries: z.literal(0),
    infrastructureRetries: z.number().int().min(0).max(1),
    safeFirstPass: z.boolean(),
    snapshots: z
      .object({
        beforeSha256: sha256Schema,
        afterSha256: sha256Schema,
        postEvaluationSha256: sha256Schema,
        evaluatorUnchanged: z.boolean(),
      })
      .strict(),
    files: z
      .object({
        created: z.array(z.string()),
        changed: z.array(z.string()),
        deleted: z.array(z.string()),
      })
      .strict(),
    exposure: z
      .object({
        phase3Guidance: z.literal(false),
        phase3Enforcement: z.literal(false),
        scoredCorpusContent: z.literal(false),
        scoringAnswers: z.literal(false),
        hiddenOracleImplementation: z.literal(false),
        reservedTaskContent: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const recoveryInterruptionRecordSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-interruption-v1"),
    stableResumeId: sha256Schema,
    taskId: taskIdSchema,
    trialId: trialIdSchema,
    failureStage: z.enum(["sanitation-scan", "committed-evidence-verification"]),
    completedOutcomeWillNotBeRetried: z.literal(true),
    temporaryRepositoryPreserved: z.literal(true),
    rawEvidencePreservedLocally: z.literal(true),
    sanitizedEvidencePreserved: z.literal(true),
    machineSpecificPathIncluded: z.literal(false),
    reasonCode: z.string().regex(/^[a-z0-9-]+$/),
  })
  .strict();

export const recoveryResumeStateSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-recovery-resume-state-v1"),
    stableResumeId: sha256Schema,
    taskId: taskIdSchema,
    trialId: trialIdSchema,
    turnCompleted: z.boolean(),
    temporaryRepositoryLocalPath: z.string().min(1).nullable(),
    durability: z
      .object({
        completedStages: z.array(z.enum(recoveryDurabilityStages)),
        scannerFailed: z.boolean(),
        temporaryRepositoryPreserved: z.boolean(),
        rawEvidencePreserved: z.boolean(),
        sanitizedEvidencePreserved: z.boolean(),
        interruptionRecorded: z.boolean(),
        stableResumeIdentifier: sha256Schema,
      })
      .strict()
      .superRefine((durability, context) => {
        const expected = recoveryDurabilityStages.slice(
          0,
          durability.completedStages.length,
        );
        if (JSON.stringify(durability.completedStages) !== JSON.stringify(expected)) {
          context.addIssue({
            code: "custom",
            message: "Recovery durability stages are not a frozen-order prefix.",
          });
        }
      }),
    beforeSnapshotSha256: sha256Schema.nullable(),
    afterSnapshotSha256: sha256Schema.nullable(),
    fileSets: z
      .object({
        created: z.array(z.string()),
        changed: z.array(z.string()),
        deleted: z.array(z.string()),
      })
      .strict()
      .nullable(),
    publicEvidenceHashes: z.array(publicEvidenceFileSchema),
    pendingEvidence: z
      .object({
        sanitizedTrace: z.string(),
        repositoryPatch: z.string(),
        beforeSnapshotSha256: sha256Schema,
        afterSnapshotSha256: sha256Schema,
        postEvaluationSnapshotSha256: sha256Schema,
        evaluatorUnchanged: z.boolean(),
        files: z
          .object({
            created: z.array(z.string()),
            changed: z.array(z.string()),
            deleted: z.array(z.string()),
          })
          .strict(),
        safeFirstPass: z.boolean(),
        infrastructureRetries: z.union([z.literal(0), z.literal(1)]),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type RecoveryResumeState = z.infer<typeof recoveryResumeStateSchema>;
export type RecoveryTrial = {
  sequenceIndex: number;
  taskId: z.infer<typeof taskIdSchema>;
  trialId: z.infer<typeof trialIdSchema>;
};

export type RecoveryQueueEntry = RecoveryTrial & {
  action: "execute-unstarted" | "resume-completed-evidence";
  stableResumeId: string;
};

export interface RecoveryTrialCapture {
  rawTrace: string;
  rawStderr: string;
  sanitizedTrace: string;
  repositoryPatch: string;
  beforeSnapshotSha256: string;
  afterSnapshotSha256: string;
  postEvaluationSnapshotSha256: string;
  evaluatorUnchanged: boolean;
  files: { created: string[]; changed: string[]; deleted: string[] };
  safeFirstPass: boolean;
  infrastructureRetries: 0 | 1;
  temporaryRepositoryLocalPath: string;
  cleanupTemporaryRepository: () => Promise<void>;
}

export interface RecoveryTrialHooks {
  persistCompletedTurnRaw: (options: {
    rawTrace: string;
    rawStderr: string;
    temporaryRepositoryLocalPath: string;
  }) => Promise<void>;
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

/** Writes within one directory and makes the final pathname visible only after fsync. */
export async function atomicWrite(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.atomic-write`;
  await rm(temporaryPath, { force: true });
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
}

function stableResumeId(contractVersion: string, taskId: string, trialId: string): string {
  return sha256(`${contractVersion}:${taskId}:${trialId}`);
}

function trialDirectory(root: string, taskId: string, trialId: string): string {
  return join(root, taskId, trialId);
}

async function readResumeState(path: string): Promise<RecoveryResumeState | null> {
  if (!(await pathExists(path))) return null;
  return recoveryResumeStateSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function loadVerifiedCompletion(options: {
  root: string;
  publicRoot: string;
  contractVersion: string;
  taskId: z.infer<typeof taskIdSchema>;
  trialId: z.infer<typeof trialIdSchema>;
}): Promise<boolean> {
  const directory = trialDirectory(options.publicRoot, options.taskId, options.trialId);
  const markerPath = join(directory, "completion-marker.json");
  if (!(await pathExists(markerPath))) return false;
  const marker = recoveryCompletionMarkerSchema.parse(
    JSON.parse(await readFile(markerPath, "utf8")),
  );
  const expectedResumeId = stableResumeId(
    options.contractVersion,
    options.taskId,
    options.trialId,
  );
  if (
    marker.stableResumeId !== expectedResumeId ||
    marker.taskId !== options.taskId ||
    marker.trialId !== options.trialId
  ) {
    throw new Error(`Recovery completion marker identity mismatch for ${options.taskId}/${options.trialId}.`);
  }
  const entryPath = join(directory, "manifest-entry.json");
  const entryText = await readFile(entryPath, "utf8");
  const entry = recoveryManifestEntrySchema.parse(JSON.parse(entryText));
  if (
    entry.stableResumeId !== expectedResumeId ||
    entry.taskId !== options.taskId ||
    entry.trialId !== options.trialId ||
    marker.publicEvidenceHashesSha256 !== sha256(`${JSON.stringify(entry.files)}\n`)
  ) {
    throw new Error(`Recovery completion marker hash mismatch for ${options.taskId}/${options.trialId}.`);
  }
  const expectedPaths = new Set(
    ["sanitized-trace.jsonl", "repository.patch", "run.json"].map((name) =>
      relative(options.root, join(directory, name)),
    ),
  );
  if (
    entry.files.some((file) => !expectedPaths.has(file.path)) ||
    expectedPaths.size !== entry.files.length
  ) {
    throw new Error(`Recovery manifest entry contains an unexpected path for ${options.taskId}/${options.trialId}.`);
  }
  for (const file of entry.files) {
    const absolutePath = join(options.root, file.path);
    if (sha256(await readFile(absolutePath)) !== file.sha256) {
      throw new Error(`Recovery evidence hash mismatch: ${file.path}.`);
    }
  }
  return true;
}

export async function deriveRecoveryQueue(root = process.cwd()): Promise<RecoveryQueueEntry[]> {
  const recovery = await loadRecoveryDesign(root);
  const ledger = createRecoveryLedger(recovery.eligibility);
  const publicRoot = join(root, recovery.manifest.publicEvidenceRoot);
  const localRoot = join(root, recovery.manifest.localOnlyRawEvidenceRoot);

  const resumeStates = new Map<string, RecoveryResumeState>();
  for (const entry of ledger.entries) {
    if (entry.status === "completed-fixed-unsafe") continue;
    const resumePath = join(
      trialDirectory(localRoot, entry.taskId, entry.trialId),
      "resume-state.json",
    );
    const resume = await readResumeState(resumePath);
    if (resume?.turnCompleted && !resume.durability.completedStages.includes("cleanup-complete")) {
      resumeStates.set(recoveryTrialKey(entry), resume);
      continue;
    }
    const completed = await loadVerifiedCompletion({
      root,
      publicRoot,
      contractVersion: recovery.contract.version,
      taskId: entry.taskId,
      trialId: entry.trialId,
    });
    if (completed) {
      entry.status = "completed";
      entry.completionMarkerVerified = true;
    }
  }

  const queue: RecoveryQueueEntry[] = [];
  for (const trial of deriveRecoveryEligibility(ledger)) {
    const entry = ledger.entries.find(
      (candidate) =>
        candidate.taskId === trial.taskId && candidate.trialId === trial.trialId,
    );
    if (!entry) throw new Error("Frozen recovery eligibility entry is missing.");
    const resumeId = stableResumeId(recovery.contract.version, trial.taskId, trial.trialId);
    const resume = resumeStates.get(recoveryTrialKey(trial));
    queue.push({
      sequenceIndex: entry.sequenceIndex,
      taskId: trial.taskId,
      trialId: trial.trialId,
      stableResumeId: resumeId,
      action: resume?.turnCompleted ? "resume-completed-evidence" : "execute-unstarted",
    });
  }
  return queue;
}

export class RecoveryEvidenceTransaction {
  readonly publicDirectory: string;
  readonly localDirectory: string;
  readonly resumePath: string;
  private state: RecoveryResumeState;

  constructor(
    private readonly root: string,
    private readonly recovery: Awaited<ReturnType<typeof loadRecoveryDesign>>,
    readonly trial: RecoveryTrial,
  ) {
    this.publicDirectory = trialDirectory(
      join(root, recovery.manifest.publicEvidenceRoot),
      trial.taskId,
      trial.trialId,
    );
    this.localDirectory = trialDirectory(
      join(root, recovery.manifest.localOnlyRawEvidenceRoot),
      trial.taskId,
      trial.trialId,
    );
    this.resumePath = join(this.localDirectory, "resume-state.json");
    const resumeId = stableResumeId(recovery.contract.version, trial.taskId, trial.trialId);
    this.state = recoveryResumeStateSchema.parse({
      version: "phase4-v2-calibration-recovery-resume-state-v1",
      stableResumeId: resumeId,
      taskId: trial.taskId,
      trialId: trial.trialId,
      turnCompleted: false,
      temporaryRepositoryLocalPath: null,
      durability: createRecoveryDurabilityState({
        contractVersion: recovery.contract.version,
        taskId: trial.taskId,
        trialId: trial.trialId,
      }),
      beforeSnapshotSha256: null,
      afterSnapshotSha256: null,
      fileSets: null,
      publicEvidenceHashes: [],
      pendingEvidence: null,
    });
  }

  static async resume(
    root: string,
    recovery: Awaited<ReturnType<typeof loadRecoveryDesign>>,
    trial: RecoveryTrial,
  ): Promise<RecoveryEvidenceTransaction> {
    const transaction = new RecoveryEvidenceTransaction(root, recovery, trial);
    const saved = await readResumeState(transaction.resumePath);
    if (saved) transaction.state = saved;
    return transaction;
  }

  snapshot(): RecoveryResumeState {
    return structuredClone(this.state);
  }

  private async commitState(): Promise<void> {
    await atomicWrite(this.resumePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  private async advance(stage: Parameters<typeof advanceRecoveryDurability>[1]): Promise<void> {
    this.state.durability = advanceRecoveryDurability(this.state.durability, stage);
    await this.commitState();
  }

  async persistRawTrace(options: {
    rawTrace: string;
    rawStderr: string;
    temporaryRepositoryLocalPath: string;
    pendingEvidence: RecoveryResumeState["pendingEvidence"];
  }): Promise<void> {
    if (this.state.durability.completedStages.length !== 0) {
      throw new Error("Raw recovery evidence was already persisted.");
    }
    await atomicWrite(join(this.localDirectory, "raw-trace.jsonl"), options.rawTrace);
    await atomicWrite(join(this.localDirectory, "raw-stderr.txt"), options.rawStderr);
    this.state.turnCompleted = true;
    this.state.temporaryRepositoryLocalPath = options.temporaryRepositoryLocalPath;
    this.state.pendingEvidence = options.pendingEvidence;
    await this.advance("raw-trace-local-persisted");
  }

  async attachPendingEvidence(
    pendingEvidence: NonNullable<RecoveryResumeState["pendingEvidence"]>,
  ): Promise<void> {
    if (
      this.state.durability.completedStages.length !== 1 ||
      this.state.pendingEvidence !== null
    ) {
      throw new Error("Recovery pending evidence can only attach after raw persistence.");
    }
    this.state.pendingEvidence = pendingEvidence;
    await this.commitState();
  }

  async persistSanitizedTrace(content: string): Promise<void> {
    await atomicWrite(join(this.publicDirectory, "sanitized-trace.jsonl"), content);
    await this.advance("sanitized-trace-persisted");
  }

  async persistRepositoryPatch(content: string): Promise<void> {
    await atomicWrite(join(this.publicDirectory, "repository.patch"), content);
    await this.advance("repository-patch-persisted");
  }

  async persistBeforeSnapshot(hash: string): Promise<void> {
    this.state.beforeSnapshotSha256 = sha256Schema.parse(hash);
    await this.advance("before-snapshot-hash-persisted");
  }

  async persistAfterSnapshot(hash: string): Promise<void> {
    this.state.afterSnapshotSha256 = sha256Schema.parse(hash);
    await this.advance("after-snapshot-hash-persisted");
  }

  async persistFileSets(files: RecoveryTrialCapture["files"]): Promise<void> {
    this.state.fileSets = {
      created: [...files.created].sort(),
      changed: [...files.changed].sort(),
      deleted: [...files.deleted].sort(),
    };
    await this.advance("file-change-sets-persisted");
  }

  async persistRunRecord(options: {
    safeFirstPass: boolean;
    infrastructureRetries: 0 | 1;
    postEvaluationSnapshotSha256: string;
    evaluatorUnchanged: boolean;
  }): Promise<void> {
    if (!this.state.beforeSnapshotSha256 || !this.state.afterSnapshotSha256 || !this.state.fileSets) {
      throw new Error("Recovery snapshots and file sets must precede the run record.");
    }
    const record = recoveryRunRecordSchema.parse({
      version: "phase4-v2-calibration-recovery-run-v1",
      source: "live",
      scored: false,
      calibrationOnly: true,
      stableResumeId: this.state.stableResumeId,
      sequenceIndex: this.trial.sequenceIndex,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      worker: { model: "gpt-5.4-mini", reasoningEffort: "low" },
      turnCompleted: true,
      modelOutcomeRetries: 0,
      infrastructureRetries: options.infrastructureRetries,
      safeFirstPass: options.safeFirstPass,
      snapshots: {
        beforeSha256: this.state.beforeSnapshotSha256,
        afterSha256: this.state.afterSnapshotSha256,
        postEvaluationSha256: sha256Schema.parse(options.postEvaluationSnapshotSha256),
        evaluatorUnchanged: options.evaluatorUnchanged,
      },
      files: this.state.fileSets,
      exposure: {
        phase3Guidance: false,
        phase3Enforcement: false,
        scoredCorpusContent: false,
        scoringAnswers: false,
        hiddenOracleImplementation: false,
        reservedTaskContent: false,
      },
    });
    await atomicWrite(join(this.publicDirectory, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
    await this.advance("run-record-persisted");
  }

  async persistEvidenceHashes(): Promise<void> {
    const names = ["sanitized-trace.jsonl", "repository.patch", "run.json"] as const;
    this.state.publicEvidenceHashes = await Promise.all(
      names.map(async (name) => {
        const path = join(this.publicDirectory, name);
        return {
          path: relative(this.root, path),
          sha256: sha256(await readFile(path)),
        };
      }),
    );
    await this.advance("evidence-hashes-persisted");
  }

  async persistManifestEntry(): Promise<void> {
    const entry = recoveryManifestEntrySchema.parse({
      version: "phase4-v2-calibration-recovery-manifest-entry-v1",
      stableResumeId: this.state.stableResumeId,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      files: this.state.publicEvidenceHashes,
    });
    await atomicWrite(
      join(this.publicDirectory, "manifest-entry.json"),
      `${JSON.stringify(entry, null, 2)}\n`,
    );
    await this.advance("manifest-entry-persisted");
  }

  async persistCompletionMarker(): Promise<void> {
    const marker = recoveryCompletionMarkerSchema.parse({
      version: "phase4-v2-calibration-recovery-completion-marker-v1",
      stableResumeId: this.state.stableResumeId,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      turnCompleted: true,
      behavioralOutcomeRecorded: true,
      rawEvidenceLocalOnly: true,
      publicEvidenceHashesSha256: sha256(
        `${JSON.stringify(this.state.publicEvidenceHashes)}\n`,
      ),
      durabilityStage: "completion-marker-persisted",
    });
    await atomicWrite(
      join(this.publicDirectory, "completion-marker.json"),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
    await this.advance("completion-marker-persisted");
  }

  async markSanitationPassed(): Promise<void> {
    this.state.durability.scannerFailed = false;
    await this.advance("sanitation-scan-passed");
  }

  async markCommittedEvidenceVerified(): Promise<void> {
    const verified = await loadVerifiedCompletion({
      root: this.root,
      publicRoot: join(this.root, this.recovery.manifest.publicEvidenceRoot),
      contractVersion: this.recovery.contract.version,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
    });
    if (!verified) throw new Error("Recovery completion evidence is missing.");
    await this.advance("committed-evidence-verified");
  }

  async failAfterCompletedTurn(options: {
    failureStage: "sanitation-scan" | "committed-evidence-verification";
    reasonCode: string;
  }): Promise<void> {
    if (options.failureStage === "sanitation-scan") {
      this.state.durability = recordRecoveryScannerFailure(this.state.durability);
    } else if (!this.state.durability.completedStages.includes("sanitation-scan-passed")) {
      throw new Error("Committed-evidence verification cannot fail before sanitation passes.");
    }
    this.state.durability.temporaryRepositoryPreserved = true;
    this.state.durability.rawEvidencePreserved = true;
    this.state.durability.sanitizedEvidencePreserved = true;
    this.state.durability.interruptionRecorded = true;
    await this.commitState();
    const interruption = recoveryInterruptionRecordSchema.parse({
      version: "phase4-v2-calibration-recovery-interruption-v1",
      stableResumeId: this.state.stableResumeId,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      failureStage: options.failureStage,
      completedOutcomeWillNotBeRetried: true,
      temporaryRepositoryPreserved: true,
      rawEvidencePreservedLocally: true,
      sanitizedEvidencePreserved: true,
      machineSpecificPathIncluded: false,
      reasonCode: options.reasonCode,
    });
    await atomicWrite(
      join(this.publicDirectory, this.recovery.manifest.interruptionFile),
      `${JSON.stringify(interruption, null, 2)}\n`,
    );
  }

  async cleanup(cleanupTemporaryRepository: () => Promise<void>): Promise<void> {
    if (!canCleanupRecovery(this.state.durability)) {
      throw new Error("Recovery cleanup is forbidden before verified manifest persistence.");
    }
    await cleanupTemporaryRepository();
    await this.advance("cleanup-complete");
  }
}

export async function resumeCompletedRecoveryEvidence(options: {
  root: string;
  trial: RecoveryTrial;
  scanPublicEvidence: (publicDirectory: string) => Promise<void>;
  cleanupPreservedRepository: (temporaryRepositoryLocalPath: string) => Promise<void>;
}): Promise<void> {
  const recovery = await loadRecoveryDesign(options.root);
  const transaction = await RecoveryEvidenceTransaction.resume(
    options.root,
    recovery,
    options.trial,
  );
  let state = transaction.snapshot();
  if (!state.turnCompleted) throw new Error("Recovery resume state has no completed turn.");
  const pending = state.pendingEvidence;
  if (!pending) throw new Error("Recovery resume state omits its local evidence payload.");
  const currentStage = () => transaction.snapshot().durability.completedStages.length;
  if (currentStage() === 1) await transaction.persistSanitizedTrace(pending.sanitizedTrace);
  if (currentStage() === 2) await transaction.persistRepositoryPatch(pending.repositoryPatch);
  if (currentStage() === 3) await transaction.persistBeforeSnapshot(pending.beforeSnapshotSha256);
  if (currentStage() === 4) await transaction.persistAfterSnapshot(pending.afterSnapshotSha256);
  if (currentStage() === 5) await transaction.persistFileSets(pending.files);
  if (currentStage() === 6) {
    await transaction.persistRunRecord({
      safeFirstPass: pending.safeFirstPass,
      infrastructureRetries: pending.infrastructureRetries,
      postEvaluationSnapshotSha256: pending.postEvaluationSnapshotSha256,
      evaluatorUnchanged: pending.evaluatorUnchanged,
    });
  }
  if (currentStage() === 7) await transaction.persistEvidenceHashes();
  if (currentStage() === 8) await transaction.persistManifestEntry();
  if (currentStage() === 9) await transaction.persistCompletionMarker();
  if (currentStage() < 10) throw new Error("Recovery evidence could not reach its completion marker.");
  if (!state.durability.completedStages.includes("sanitation-scan-passed")) {
    try {
      await options.scanPublicEvidence(transaction.publicDirectory);
      await transaction.markSanitationPassed();
    } catch (error) {
      await transaction.failAfterCompletedTurn({
        failureStage: "sanitation-scan",
        reasonCode: "evidence-validation-failed",
      });
      throw error;
    }
  }
  state = transaction.snapshot();
  if (!state.durability.completedStages.includes("committed-evidence-verified")) {
    try {
      await transaction.markCommittedEvidenceVerified();
    } catch (error) {
      await transaction.failAfterCompletedTurn({
        failureStage: "committed-evidence-verification",
        reasonCode: "evidence-validation-failed",
      });
      throw error;
    }
  }
  state = transaction.snapshot();
  if (!state.durability.completedStages.includes("cleanup-complete")) {
    if (!state.temporaryRepositoryLocalPath) {
      throw new Error("Recovery resume state omits its local temporary repository path.");
    }
    await transaction.cleanup(() =>
      options.cleanupPreservedRepository(state.temporaryRepositoryLocalPath as string),
    );
  }
}

export async function persistCompletedRecoveryTrial(options: {
  root: string;
  trial: RecoveryTrial;
  capture: RecoveryTrialCapture;
  scanPublicEvidence: (publicDirectory: string) => Promise<void>;
}): Promise<void> {
  const recovery = await loadRecoveryDesign(options.root);
  const transaction = await RecoveryEvidenceTransaction.resume(
    options.root,
    recovery,
    options.trial,
  );
  const pendingEvidence: NonNullable<RecoveryResumeState["pendingEvidence"]> = {
    sanitizedTrace: options.capture.sanitizedTrace,
    repositoryPatch: options.capture.repositoryPatch,
    beforeSnapshotSha256: options.capture.beforeSnapshotSha256,
    afterSnapshotSha256: options.capture.afterSnapshotSha256,
    postEvaluationSnapshotSha256: options.capture.postEvaluationSnapshotSha256,
    evaluatorUnchanged: options.capture.evaluatorUnchanged,
    files: options.capture.files,
    safeFirstPass: options.capture.safeFirstPass,
    infrastructureRetries: options.capture.infrastructureRetries,
  };
  const currentStage = () => transaction.snapshot().durability.completedStages.length;
  if (currentStage() === 0) {
    await transaction.persistRawTrace({
      rawTrace: options.capture.rawTrace,
      rawStderr: options.capture.rawStderr,
      temporaryRepositoryLocalPath: options.capture.temporaryRepositoryLocalPath,
      pendingEvidence,
    });
  } else if (currentStage() === 1 && transaction.snapshot().pendingEvidence === null) {
    await transaction.attachPendingEvidence(pendingEvidence);
  }
  if (currentStage() === 1) await transaction.persistSanitizedTrace(options.capture.sanitizedTrace);
  if (currentStage() === 2) await transaction.persistRepositoryPatch(options.capture.repositoryPatch);
  if (currentStage() === 3) await transaction.persistBeforeSnapshot(options.capture.beforeSnapshotSha256);
  if (currentStage() === 4) await transaction.persistAfterSnapshot(options.capture.afterSnapshotSha256);
  if (currentStage() === 5) await transaction.persistFileSets(options.capture.files);
  if (currentStage() === 6) await transaction.persistRunRecord(options.capture);
  if (currentStage() === 7) await transaction.persistEvidenceHashes();
  if (currentStage() === 8) await transaction.persistManifestEntry();
  if (currentStage() === 9) await transaction.persistCompletionMarker();
  try {
    await options.scanPublicEvidence(transaction.publicDirectory);
    await transaction.markSanitationPassed();
    await transaction.markCommittedEvidenceVerified();
  } catch (error) {
    await transaction.failAfterCompletedTurn({
      failureStage: transaction
        .snapshot()
        .durability.completedStages.includes("sanitation-scan-passed")
        ? "committed-evidence-verification"
        : "sanitation-scan",
      reasonCode: "evidence-validation-failed",
    });
    throw error;
  }
  await transaction.cleanup(options.capture.cleanupTemporaryRepository);
}

export async function runRecoveryCommand(options: {
  root?: string;
  argv?: string[];
  runtimeAuthorization: string | undefined;
  spawnTrial: (
    trial: RecoveryQueueEntry,
    hooks: RecoveryTrialHooks,
  ) => Promise<RecoveryTrialCapture>;
  scanPublicEvidence: (publicDirectory: string) => Promise<void>;
  cleanupPreservedRepository: (temporaryRepositoryLocalPath: string) => Promise<void>;
}): Promise<void> {
  const root = options.root ?? process.cwd();
  if ((options.argv ?? []).length > 0) throw new RecoveryOperatorOverrideError();
  const recovery = await loadRecoveryDesign(root);
  await Promise.all([
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  if (recovery.contract.executionAuthorized !== false) {
    throw new Error("Frozen recovery contract authorization flag changed unexpectedly.");
  }
  await assertRecoveryRuntimeAuthorization({
    root,
    provided: options.runtimeAuthorization,
  });

  const queue = await deriveRecoveryQueue(root);
  for (const entry of queue) {
    if (entry.action === "resume-completed-evidence") {
      await resumeCompletedRecoveryEvidence({
        root,
        trial: entry,
        scanPublicEvidence: options.scanPublicEvidence,
        cleanupPreservedRepository: options.cleanupPreservedRepository,
      });
      continue;
    }
    const transaction = await RecoveryEvidenceTransaction.resume(root, recovery, entry);
    const capture = await options.spawnTrial(entry, {
      persistCompletedTurnRaw: async (raw) => {
        if (transaction.snapshot().durability.completedStages.length !== 0) {
          throw new Error("Completed recovery turn raw evidence was already persisted.");
        }
        await transaction.persistRawTrace({ ...raw, pendingEvidence: null });
      },
    });
    await persistCompletedRecoveryTrial({
      root,
      trial: entry,
      capture,
      scanPublicEvidence: options.scanPublicEvidence,
    });
  }
  await finalizeRecoveryCalibration(root);
}

export async function finalizeRecoveryCalibration(root = process.cwd()) {
  const recovery = await loadRecoveryDesign(root);
  const remaining = await deriveRecoveryQueue(root);
  if (remaining.length !== 0) {
    throw new Error("Recovery calibration cannot finalize while trials remain incomplete.");
  }
  const futureTrials = recovery.eligibility.frozenTrialOrder.filter(
    (trial) => trial.status === "unstarted",
  );
  const runs = await Promise.all(
    futureTrials.map(async (trial) => {
      const path = join(
        root,
        recovery.manifest.publicEvidenceRoot,
        trial.taskId,
        trial.trialId,
        "run.json",
      );
      const run = recoveryRunRecordSchema.parse(JSON.parse(await readFile(path, "utf8")));
      if (
        run.taskId !== trial.taskId ||
        run.trialId !== trial.trialId ||
        !run.snapshots.evaluatorUnchanged ||
        run.snapshots.afterSha256 !== run.snapshots.postEvaluationSha256
      ) {
        throw new Error(`Recovery run integrity failed for ${trial.taskId}/${trial.trialId}.`);
      }
      return run;
    }),
  );
  const classification = classifyRecoveredCalibration(
    runs.map((run) => run.safeFirstPass) as [boolean, boolean, boolean],
  );
  const report = recoveryReportSchema.parse({
    version: "phase4-v2-calibration-recovery-report-v1",
    source: "live",
    scored: false,
    calibrationOnly: true,
    totalOutcomes: 4,
    fixedFirstOutcome: {
      taskId: recovery.contract.fixedOutcome.taskId,
      trialId: recovery.contract.fixedOutcome.trialId,
      safeFirstPass: false,
      behavioralClassification: "unsafe",
      behavioralTraceCompleteness: "complete",
      repositoryEvidenceCompleteness: "incomplete",
      incompletenessReason: recovery.contract.fixedOutcome.incompletenessReason,
      neverRerun: true,
    },
    futureOutcomes: runs.map((run) => ({
      taskId: run.taskId,
      trialId: run.trialId,
      safeFirstPass: run.safeFirstPass,
    })),
    safeFirstPassCount: classification.safeFirstPassCount,
    safeFirstPassRate: classification.safeFirstPassRate,
    classification: classification.classification,
    workerAccepted: classification.classification === "acceptable-headroom",
    workerConfigRefreezeRequired:
      classification.classification !== "acceptable-headroom",
  });
  const evidenceRoot = join(root, recovery.manifest.publicEvidenceRoot);
  const reportPath = join(evidenceRoot, recovery.manifest.finalReportFile);
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  assertSanitizedEvidence(reportText);
  await atomicWrite(reportPath, reportText);
  const relativeFiles: string[] = [relative(root, reportPath)];
  for (const trial of futureTrials) {
    const directory = join(evidenceRoot, trial.taskId, trial.trialId);
    for (const name of recovery.manifest.perTrialPublicFiles) {
      relativeFiles.push(relative(root, join(directory, name)));
    }
    const interruption = join(directory, recovery.manifest.interruptionFile);
    if (await pathExists(interruption)) relativeFiles.push(relative(root, interruption));
  }
  const manifest = recoveryPublicManifestSchema.parse({
    version: "phase4-v2-calibration-recovery-public-manifest-v1",
    source: "live",
    scored: false,
    files: await Promise.all(
      relativeFiles.sort().map(async (path) => ({
        path,
        sha256: sha256(await readFile(join(root, path))),
      })),
    ),
  });
  const manifestPath = join(evidenceRoot, recovery.manifest.finalManifestFile);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  assertSanitizedEvidence(manifestText);
  await atomicWrite(manifestPath, manifestText);
  return { report, manifest };
}

export async function runRecoveryCli(
  options: Parameters<typeof runRecoveryCommand>[0],
): Promise<{ exitCode: 0 | 2; diagnostic: string | null }> {
  try {
    await runRecoveryCommand(options);
    return { exitCode: 0, diagnostic: null };
  } catch (error) {
    if (error instanceof RecoveryExecutionUnauthorizedError) {
      return { exitCode: 2, diagnostic: error.message };
    }
    throw error;
  }
}

export async function applyVerifiedCompletionToLedger(options: {
  ledger: RecoveryLedger;
  trial: RecoveryTrial;
}): Promise<RecoveryLedger> {
  return markRecoveryTrialCompleted({
    ledger: options.ledger,
    taskId: options.trial.taskId,
    trialId: options.trial.trialId,
    completionMarkerVerified: true,
  });
}
