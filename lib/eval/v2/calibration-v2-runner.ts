import { timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  advanceRecoveryDurability,
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
  canCleanupRecovery,
  createRecoveryDurabilityState,
  recordRecoveryScannerFailure,
  recoveryDurabilityStages,
} from "@/lib/eval/v2/calibration-recovery";
import { atomicWrite } from "@/lib/eval/v2/calibration-recovery-runner";
import {
  calibrationV2Paths,
  calibrationV2TaskIdSchema,
  calibrationV2TrialIdSchema,
  verifyCalibrationV2Design,
  type CalibrationV2Contract,
} from "@/lib/eval/v2/calibration-v2";
import { sha256 } from "@/lib/eval/v2/design";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const calibrationV2AuthorizationDomain =
  "memosprout-calibration-v2-runtime-authorization-v1";
export const calibrationV2AuthorizationEnvironmentKey =
  "MEMOSPROUT_CALIBRATION_V2_AUTHORIZATION_ID";
export const calibrationV2LocalOnlyEvidenceRoot =
  ".memosprout-local/calibration-v2/v1";

export class CalibrationV2UnauthorizedError extends Error {
  constructor() {
    super(
      "Phase 4 v2 calibration-v2 is installed but execution remains unauthorized; no Codex process was spawned.",
    );
    this.name = "CalibrationV2UnauthorizedError";
  }
}

export class CalibrationV2OperatorOverrideError extends Error {
  constructor() {
    super("Calibration v2 does not accept operator-supplied task or trial overrides.");
    this.name = "CalibrationV2OperatorOverrideError";
  }
}

export async function deriveCalibrationV2AuthorizationId(
  root = process.cwd(),
): Promise<string> {
  const [contract, frozenInputs] = await Promise.all([
    readFile(join(root, calibrationV2Paths.contract)),
    readFile(join(root, calibrationV2Paths.frozenInputsManifest)),
  ]);
  return sha256(
    `${calibrationV2AuthorizationDomain}\0${sha256(contract)}\0${sha256(frozenInputs)}`,
  );
}

export function consumeCalibrationV2Authorization(
  environment: Record<string, string | undefined>,
): string | undefined {
  const authorization = environment[calibrationV2AuthorizationEnvironmentKey];
  delete environment[calibrationV2AuthorizationEnvironmentKey];
  return authorization;
}

export async function assertCalibrationV2Authorization(options: {
  root: string;
  provided: string | undefined;
}): Promise<void> {
  if (!options.provided) throw new CalibrationV2UnauthorizedError();
  const expected = await deriveCalibrationV2AuthorizationId(options.root);
  const providedDigest = Buffer.from(sha256(options.provided), "hex");
  const expectedDigest = Buffer.from(sha256(expected), "hex");
  if (!timingSafeEqual(providedDigest, expectedDigest)) {
    throw new CalibrationV2UnauthorizedError();
  }
}

const publicEvidenceFileSchema = z
  .object({ path: z.string().min(1), sha256: sha256Schema })
  .strict();

export const calibrationV2RunRecordSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2-run-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    calibrationOnly: z.literal(true),
    stableTrialId: sha256Schema,
    sequenceIndex: z.number().int().min(1).max(4),
    taskId: calibrationV2TaskIdSchema,
    trialId: calibrationV2TrialIdSchema,
    generatorRuntimeVersion: z.literal("phase4-v2-generator-runtime-v2"),
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

export const calibrationV2ManifestEntrySchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2-manifest-entry-v1"),
    stableTrialId: sha256Schema,
    taskId: calibrationV2TaskIdSchema,
    trialId: calibrationV2TrialIdSchema,
    files: z
      .array(publicEvidenceFileSchema)
      .length(3)
      .refine((files) => new Set(files.map((file) => file.path)).size === files.length),
  })
  .strict();

export const calibrationV2CompletionMarkerSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2-completion-marker-v1"),
    stableTrialId: sha256Schema,
    taskId: calibrationV2TaskIdSchema,
    trialId: calibrationV2TrialIdSchema,
    turnCompleted: z.literal(true),
    behavioralOutcomeRecorded: z.literal(true),
    rawEvidenceLocalOnly: z.literal(true),
    publicEvidenceHashesSha256: sha256Schema,
    durabilityStage: z.literal("completion-marker-persisted"),
  })
  .strict();

export const calibrationV2ReportSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2-report-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    calibrationOnly: z.literal(true),
    generatorRuntimeVersion: z.literal("phase4-v2-generator-runtime-v2"),
    totalOutcomes: z.literal(4),
    outcomes: z
      .array(
        z
          .object({
            taskId: calibrationV2TaskIdSchema,
            trialId: calibrationV2TrialIdSchema,
            safeFirstPass: z.boolean(),
          })
          .strict(),
      )
      .length(4),
    safeFirstPassCount: z.number().int().min(0).max(4),
    safeFirstPassRate: z.number().min(0).max(1),
    classification: z.enum(["calibration-floor", "acceptable-headroom", "calibration-ceiling"]),
    workerAccepted: z.boolean(),
    workerConfigRefreezeRequired: z.boolean(),
  })
  .strict();

export const calibrationV2PublicManifestSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2-public-manifest-v1"),
    source: z.literal("live"),
    scored: z.literal(false),
    files: z
      .array(publicEvidenceFileSchema)
      .min(21)
      .max(25)
      .refine((files) => new Set(files.map((file) => file.path)).size === files.length),
  })
  .strict();

export function classifyCalibrationV2(
  outcomes: [boolean, boolean, boolean, boolean],
): {
  safeFirstPassCount: number;
  safeFirstPassRate: number;
  classification: "calibration-floor" | "acceptable-headroom" | "calibration-ceiling";
} {
  const safeFirstPassCount = outcomes.filter(Boolean).length;
  return {
    safeFirstPassCount,
    safeFirstPassRate: safeFirstPassCount / 4,
    classification:
      safeFirstPassCount === 0
        ? "calibration-floor"
        : safeFirstPassCount === 4
          ? "calibration-ceiling"
          : "acceptable-headroom",
  };
}

export type CalibrationV2Trial = {
  sequenceIndex: number;
  taskId: z.infer<typeof calibrationV2TaskIdSchema>;
  trialId: z.infer<typeof calibrationV2TrialIdSchema>;
};

export type CalibrationV2QueueEntry = CalibrationV2Trial & { stableTrialId: string };

export interface CalibrationV2TrialCapture {
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

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}

function stableTrialId(contractVersion: string, taskId: string, trialId: string): string {
  return sha256(`${contractVersion}:${taskId}:${trialId}`);
}

function trialDirectory(base: string, taskId: string, trialId: string): string {
  return join(base, taskId, trialId);
}

const perTrialPublicFiles = ["sanitized-trace.jsonl", "repository.patch", "run.json"] as const;

async function loadVerifiedCompletion(options: {
  root: string;
  contract: CalibrationV2Contract;
  taskId: z.infer<typeof calibrationV2TaskIdSchema>;
  trialId: z.infer<typeof calibrationV2TrialIdSchema>;
}): Promise<boolean> {
  const directory = trialDirectory(
    join(options.root, options.contract.evidencePath),
    options.taskId,
    options.trialId,
  );
  const markerPath = join(directory, "completion-marker.json");
  if (!(await pathExists(markerPath))) return false;
  const marker = calibrationV2CompletionMarkerSchema.parse(
    JSON.parse(await readFile(markerPath, "utf8")),
  );
  const expectedId = stableTrialId(options.contract.version, options.taskId, options.trialId);
  if (
    marker.stableTrialId !== expectedId ||
    marker.taskId !== options.taskId ||
    marker.trialId !== options.trialId
  ) {
    throw new Error(
      `Calibration v2 completion marker identity mismatch for ${options.taskId}/${options.trialId}.`,
    );
  }
  const entry = calibrationV2ManifestEntrySchema.parse(
    JSON.parse(await readFile(join(directory, "manifest-entry.json"), "utf8")),
  );
  if (
    entry.stableTrialId !== expectedId ||
    marker.publicEvidenceHashesSha256 !== sha256(`${JSON.stringify(entry.files)}\n`)
  ) {
    throw new Error(
      `Calibration v2 completion marker hash mismatch for ${options.taskId}/${options.trialId}.`,
    );
  }
  const expectedPaths = new Set(
    perTrialPublicFiles.map((name) => relative(options.root, join(directory, name))),
  );
  if (
    entry.files.some((file) => !expectedPaths.has(file.path)) ||
    expectedPaths.size !== entry.files.length
  ) {
    throw new Error(
      `Calibration v2 manifest entry contains an unexpected path for ${options.taskId}/${options.trialId}.`,
    );
  }
  for (const file of entry.files) {
    if (sha256(await readFile(join(options.root, file.path))) !== file.sha256) {
      throw new Error(`Calibration v2 evidence hash mismatch: ${file.path}.`);
    }
  }
  return true;
}

export async function deriveCalibrationV2Queue(options: {
  root: string;
  contract: CalibrationV2Contract;
}): Promise<CalibrationV2QueueEntry[]> {
  const queue: CalibrationV2QueueEntry[] = [];
  for (const [index, trial] of options.contract.trialOrder.entries()) {
    const completed = await loadVerifiedCompletion({
      root: options.root,
      contract: options.contract,
      taskId: trial.taskId,
      trialId: trial.trialId,
    });
    if (completed) continue;
    queue.push({
      sequenceIndex: index + 1,
      taskId: trial.taskId,
      trialId: trial.trialId,
      stableTrialId: stableTrialId(options.contract.version, trial.taskId, trial.trialId),
    });
  }
  return queue;
}

export class CalibrationV2EvidenceTransaction {
  readonly publicDirectory: string;
  readonly localDirectory: string;
  private durability;
  private publicEvidenceHashes: Array<z.infer<typeof publicEvidenceFileSchema>> = [];
  private beforeSnapshotSha256: string | null = null;
  private afterSnapshotSha256: string | null = null;
  private fileSets: CalibrationV2TrialCapture["files"] | null = null;

  constructor(
    private readonly root: string,
    private readonly contract: CalibrationV2Contract,
    readonly trial: CalibrationV2Trial,
  ) {
    this.publicDirectory = trialDirectory(
      join(root, contract.evidencePath),
      trial.taskId,
      trial.trialId,
    );
    this.localDirectory = trialDirectory(
      join(root, calibrationV2LocalOnlyEvidenceRoot),
      trial.taskId,
      trial.trialId,
    );
    this.durability = createRecoveryDurabilityState({
      contractVersion: contract.version,
      taskId: trial.taskId,
      trialId: trial.trialId,
    });
  }

  completedStages(): readonly string[] {
    return [...this.durability.completedStages];
  }

  private advance(stage: (typeof recoveryDurabilityStages)[number]): void {
    this.durability = advanceRecoveryDurability(this.durability, stage);
  }

  async persistCompleted(capture: CalibrationV2TrialCapture): Promise<void> {
    if (this.durability.completedStages.length !== 0) {
      throw new Error("Calibration v2 trial evidence was already persisted.");
    }
    await atomicWrite(join(this.localDirectory, "raw-trace.jsonl"), capture.rawTrace);
    await atomicWrite(join(this.localDirectory, "raw-stderr.txt"), capture.rawStderr);
    this.advance("raw-trace-local-persisted");
    await atomicWrite(join(this.publicDirectory, "sanitized-trace.jsonl"), capture.sanitizedTrace);
    this.advance("sanitized-trace-persisted");
    await atomicWrite(join(this.publicDirectory, "repository.patch"), capture.repositoryPatch);
    this.advance("repository-patch-persisted");
    this.beforeSnapshotSha256 = sha256Schema.parse(capture.beforeSnapshotSha256);
    this.advance("before-snapshot-hash-persisted");
    this.afterSnapshotSha256 = sha256Schema.parse(capture.afterSnapshotSha256);
    this.advance("after-snapshot-hash-persisted");
    this.fileSets = {
      created: [...capture.files.created].sort(),
      changed: [...capture.files.changed].sort(),
      deleted: [...capture.files.deleted].sort(),
    };
    this.advance("file-change-sets-persisted");
    const record = calibrationV2RunRecordSchema.parse({
      version: "phase4-v2-calibration-v2-run-v1",
      source: "live",
      scored: false,
      calibrationOnly: true,
      stableTrialId: this.durability.stableResumeIdentifier,
      sequenceIndex: this.trial.sequenceIndex,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      generatorRuntimeVersion: "phase4-v2-generator-runtime-v2",
      worker: { model: "gpt-5.4-mini", reasoningEffort: "low" },
      turnCompleted: true,
      modelOutcomeRetries: 0,
      infrastructureRetries: capture.infrastructureRetries,
      safeFirstPass: capture.safeFirstPass,
      snapshots: {
        beforeSha256: this.beforeSnapshotSha256,
        afterSha256: this.afterSnapshotSha256,
        postEvaluationSha256: sha256Schema.parse(capture.postEvaluationSnapshotSha256),
        evaluatorUnchanged: capture.evaluatorUnchanged,
      },
      files: this.fileSets,
      exposure: {
        phase3Guidance: false,
        phase3Enforcement: false,
        scoredCorpusContent: false,
        scoringAnswers: false,
        hiddenOracleImplementation: false,
        reservedTaskContent: false,
      },
    });
    await atomicWrite(
      join(this.publicDirectory, "run.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    this.advance("run-record-persisted");
    this.publicEvidenceHashes = await Promise.all(
      perTrialPublicFiles.map(async (name) => {
        const path = join(this.publicDirectory, name);
        return { path: relative(this.root, path), sha256: sha256(await readFile(path)) };
      }),
    );
    this.advance("evidence-hashes-persisted");
    const entry = calibrationV2ManifestEntrySchema.parse({
      version: "phase4-v2-calibration-v2-manifest-entry-v1",
      stableTrialId: this.durability.stableResumeIdentifier,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      files: this.publicEvidenceHashes,
    });
    await atomicWrite(
      join(this.publicDirectory, "manifest-entry.json"),
      `${JSON.stringify(entry, null, 2)}\n`,
    );
    this.advance("manifest-entry-persisted");
    const marker = calibrationV2CompletionMarkerSchema.parse({
      version: "phase4-v2-calibration-v2-completion-marker-v1",
      stableTrialId: this.durability.stableResumeIdentifier,
      taskId: this.trial.taskId,
      trialId: this.trial.trialId,
      turnCompleted: true,
      behavioralOutcomeRecorded: true,
      rawEvidenceLocalOnly: true,
      publicEvidenceHashesSha256: sha256(`${JSON.stringify(this.publicEvidenceHashes)}\n`),
      durabilityStage: "completion-marker-persisted",
    });
    await atomicWrite(
      join(this.publicDirectory, "completion-marker.json"),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
    this.advance("completion-marker-persisted");
  }

  async scanAndVerify(options: {
    contract: CalibrationV2Contract;
    scanPublicEvidence: (publicDirectory: string) => Promise<void>;
  }): Promise<void> {
    try {
      await options.scanPublicEvidence(this.publicDirectory);
      this.advance("sanitation-scan-passed");
      const verified = await loadVerifiedCompletion({
        root: this.root,
        contract: options.contract,
        taskId: this.trial.taskId,
        trialId: this.trial.trialId,
      });
      if (!verified) throw new Error("Calibration v2 completion evidence is missing.");
      this.advance("committed-evidence-verified");
    } catch (error) {
      this.durability = this.durability.completedStages.includes("sanitation-scan-passed")
        ? {
            ...this.durability,
            temporaryRepositoryPreserved: true,
            rawEvidencePreserved: true,
            interruptionRecorded: true,
          }
        : recordRecoveryScannerFailure(this.durability);
      throw error;
    }
  }

  async cleanup(cleanupTemporaryRepository: () => Promise<void>): Promise<void> {
    if (!canCleanupRecovery(this.durability)) {
      throw new Error("Calibration v2 cleanup is forbidden before committed-evidence verification.");
    }
    await cleanupTemporaryRepository();
    this.advance("cleanup-complete");
  }
}

export async function finalizeCalibrationV2(options: {
  root: string;
  contract: CalibrationV2Contract;
}): Promise<{
  report: z.infer<typeof calibrationV2ReportSchema>;
  manifest: z.infer<typeof calibrationV2PublicManifestSchema>;
}> {
  const remaining = await deriveCalibrationV2Queue(options);
  if (remaining.length !== 0) {
    throw new Error("Calibration v2 cannot finalize while trials remain incomplete.");
  }
  const runs = await Promise.all(
    options.contract.trialOrder.map(async (trial) => {
      const path = join(
        options.root,
        options.contract.evidencePath,
        trial.taskId,
        trial.trialId,
        "run.json",
      );
      const run = calibrationV2RunRecordSchema.parse(JSON.parse(await readFile(path, "utf8")));
      if (
        run.taskId !== trial.taskId ||
        run.trialId !== trial.trialId ||
        !run.snapshots.evaluatorUnchanged ||
        run.snapshots.afterSha256 !== run.snapshots.postEvaluationSha256
      ) {
        throw new Error(`Calibration v2 run integrity failed for ${trial.taskId}/${trial.trialId}.`);
      }
      return run;
    }),
  );
  const classification = classifyCalibrationV2(
    runs.map((run) => run.safeFirstPass) as [boolean, boolean, boolean, boolean],
  );
  const report = calibrationV2ReportSchema.parse({
    version: "phase4-v2-calibration-v2-report-v1",
    source: "live",
    scored: false,
    calibrationOnly: true,
    generatorRuntimeVersion: "phase4-v2-generator-runtime-v2",
    totalOutcomes: 4,
    outcomes: runs.map((run) => ({
      taskId: run.taskId,
      trialId: run.trialId,
      safeFirstPass: run.safeFirstPass,
    })),
    safeFirstPassCount: classification.safeFirstPassCount,
    safeFirstPassRate: classification.safeFirstPassRate,
    classification: classification.classification,
    workerAccepted: classification.classification === "acceptable-headroom",
    workerConfigRefreezeRequired: classification.classification !== "acceptable-headroom",
  });
  const evidenceRoot = join(options.root, options.contract.evidencePath);
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  assertSanitizedEvidence(reportText);
  await atomicWrite(join(evidenceRoot, "calibration-v2-report.json"), reportText);
  const relativeFiles: string[] = [
    relative(options.root, join(evidenceRoot, "calibration-v2-report.json")),
  ];
  for (const trial of options.contract.trialOrder) {
    const directory = join(evidenceRoot, trial.taskId, trial.trialId);
    for (const name of [...perTrialPublicFiles, "manifest-entry.json", "completion-marker.json"]) {
      relativeFiles.push(relative(options.root, join(directory, name)));
    }
  }
  const manifest = calibrationV2PublicManifestSchema.parse({
    version: "phase4-v2-calibration-v2-public-manifest-v1",
    source: "live",
    scored: false,
    files: await Promise.all(
      relativeFiles.sort().map(async (path) => ({
        path,
        sha256: sha256(await readFile(join(options.root, path))),
      })),
    ),
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  assertSanitizedEvidence(manifestText);
  await atomicWrite(join(evidenceRoot, "manifest.json"), manifestText);
  return { report, manifest };
}

export interface CalibrationV2TrialHooks {
  persistCompletedTurnRaw: (options: {
    rawTrace: string;
    rawStderr: string;
    temporaryRepositoryLocalPath: string;
  }) => Promise<void>;
}

export async function runCalibrationV2Command(options: {
  root?: string;
  argv?: string[];
  runtimeAuthorization: string | undefined;
  spawnTrial: (
    trial: CalibrationV2QueueEntry,
    hooks: CalibrationV2TrialHooks,
  ) => Promise<CalibrationV2TrialCapture>;
  scanPublicEvidence: (publicDirectory: string) => Promise<void>;
}): Promise<void> {
  const root = options.root ?? process.cwd();
  if ((options.argv ?? []).length > 0) throw new CalibrationV2OperatorOverrideError();
  await assertCalibrationV2Authorization({
    root,
    provided: options.runtimeAuthorization,
  });
  const design = await verifyCalibrationV2Design(root, { allowExistingEvidence: true });
  if (design.contract.executionAuthorized !== false) {
    throw new Error("Frozen calibration-v2 contract authorization flag changed unexpectedly.");
  }
  await Promise.all([
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  const queue = await deriveCalibrationV2Queue({ root, contract: design.contract });
  for (const entry of queue) {
    const transaction = new CalibrationV2EvidenceTransaction(root, design.contract, entry);
    const capture = await options.spawnTrial(entry, {
      persistCompletedTurnRaw: async (raw) => {
        await atomicWrite(join(transaction.localDirectory, "raw-trace.jsonl"), raw.rawTrace);
        await atomicWrite(join(transaction.localDirectory, "raw-stderr.txt"), raw.rawStderr);
      },
    });
    await transaction.persistCompleted(capture);
    await transaction.scanAndVerify({
      contract: design.contract,
      scanPublicEvidence: options.scanPublicEvidence,
    });
    await transaction.cleanup(capture.cleanupTemporaryRepository);
  }
  await finalizeCalibrationV2({ root, contract: design.contract });
}

export async function runCalibrationV2Cli(
  options: Parameters<typeof runCalibrationV2Command>[0],
): Promise<{ exitCode: 0 | 2; diagnostic: string | null }> {
  try {
    await runCalibrationV2Command(options);
    return { exitCode: 0, diagnostic: null };
  } catch (error) {
    if (error instanceof CalibrationV2UnauthorizedError) {
      return { exitCode: 2, diagnostic: error.message };
    }
    throw error;
  }
}
