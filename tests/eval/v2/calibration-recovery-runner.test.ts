import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RecoveryExecutionUnauthorizedError,
  RecoveryEvidenceTransaction,
  RecoveryOperatorOverrideError,
  consumeRecoveryRuntimeAuthorization,
  deriveRecoveryRuntimeAuthorizationId,
  deriveRecoveryQueue,
  persistCompletedRecoveryTrial,
  recoveryResumeStateSchema,
  recoveryRuntimeAuthorizationEnvironmentKey,
  resumeCompletedRecoveryEvidence,
  runRecoveryCli,
  runRecoveryCommand,
  type RecoveryTrialCapture,
} from "@/lib/eval/v2/calibration-recovery-runner";
import { loadRecoveryDesign } from "@/lib/eval/v2/calibration-recovery";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "memosprout-recovery-test-"));
  temporaryRoots.push(root);
  await cp(
    "demo/generated-files/evaluation/v2/calibration-recovery/v1",
    join(root, "demo/generated-files/evaluation/v2/calibration-recovery/v1"),
    { recursive: true },
  );
  return root;
}

function capture(root: string): RecoveryTrialCapture {
  return {
    rawTrace: '{"type":"turn.completed"}\n',
    rawStderr: "",
    sanitizedTrace: '{"type":"turn.completed"}\n',
    repositoryPatch: "diff --git a/api/openapi.yaml b/api/openapi.yaml\n",
    beforeSnapshotSha256: "a".repeat(64),
    afterSnapshotSha256: "b".repeat(64),
    files: {
      created: [],
      changed: ["api/openapi.yaml", "generated/api-client.ts"],
      deleted: [],
    },
    safeFirstPass: true,
    infrastructureRetries: 0,
    temporaryRepositoryLocalPath: join(root, "preserved-temporary-repository"),
    cleanupTemporaryRepository: async () => undefined,
  };
}

const firstRecoveryTrial = {
  sequenceIndex: 2,
  taskId: "calibration-add-office-extension" as const,
  trialId: "trial-02" as const,
};

describe("Phase 4 v2 calibration-recovery runner", () => {
  it("stops while unauthorized before reaching the Codex spawn boundary", async () => {
    let spawnCount = 0;
    const result = await runRecoveryCli({
        argv: [],
        runtimeAuthorization: undefined,
        spawnTrial: async () => {
          spawnCount += 1;
          throw new Error("unreachable");
        },
        scanPublicEvidence: async () => undefined,
        cleanupPreservedRepository: async () => undefined,
      });
    expect(result).toMatchObject({ exitCode: 2 });
    expect(result.diagnostic).not.toContain("undefined");
    expect(spawnCount).toBe(0);
  });

  it("stops mismatched runtime authorization before reaching the spawn boundary", async () => {
    let spawnCount = 0;
    const result = await runRecoveryCli({
        argv: [],
        runtimeAuthorization: "incorrect-runtime-authorization",
        spawnTrial: async () => {
          spawnCount += 1;
          throw new Error("unreachable");
        },
        scanPublicEvidence: async () => undefined,
        cleanupPreservedRepository: async () => undefined,
      });
    expect(result).toMatchObject({ exitCode: 2 });
    expect(result.diagnostic).not.toContain("incorrect-runtime-authorization");
    expect(spawnCount).toBe(0);
  });

  it("allows the exact runtime identifier to reach only the injected boundary", async () => {
    const authorization = await deriveRecoveryRuntimeAuthorizationId();
    const boundary = new Error("injected-boundary");
    const reached: string[] = [];
    await expect(
      runRecoveryCommand({
        argv: [],
        runtimeAuthorization: authorization,
        spawnTrial: async (trial) => {
          reached.push(`${trial.taskId}:${trial.trialId}`);
          throw boundary;
        },
        scanPublicEvidence: async () => undefined,
        cleanupPreservedRepository: async () => undefined,
      }),
    ).rejects.toBe(boundary);
    expect(reached).toEqual(["calibration-add-office-extension:trial-02"]);
    expect(JSON.stringify({ reached, error: boundary.message })).not.toContain(authorization);
  });

  it("consumes runtime authorization without retaining or disclosing its value", async () => {
    const authorization = await deriveRecoveryRuntimeAuthorizationId();
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      [recoveryRuntimeAuthorizationEnvironmentKey]: authorization,
    };
    expect(consumeRecoveryRuntimeAuthorization(environment)).toBe(authorization);
    expect(environment[recoveryRuntimeAuthorizationEnvironmentKey]).toBeUndefined();
    expect(JSON.stringify(environment)).not.toContain(authorization);
    expect(new RecoveryExecutionUnauthorizedError().message).not.toContain(authorization);
  });

  it("rejects every operator-supplied argument before spawning", async () => {
    let spawnCount = 0;
    await expect(
      runRecoveryCommand({
        argv: ["--trial", "trial-02"],
        runtimeAuthorization: await deriveRecoveryRuntimeAuthorizationId(),
        spawnTrial: async () => {
          spawnCount += 1;
          throw new Error("unreachable");
        },
        scanPublicEvidence: async () => undefined,
        cleanupPreservedRepository: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(RecoveryOperatorOverrideError);
    expect(spawnCount).toBe(0);
  });

  it("queues only the three frozen unstarted trials in immutable order", async () => {
    const queue = await deriveRecoveryQueue();
    expect(queue.map(({ taskId, trialId, action }) => ({ taskId, trialId, action }))).toEqual([
      {
        taskId: "calibration-add-office-extension",
        trialId: "trial-02",
        action: "execute-unstarted",
      },
      {
        taskId: "calibration-repair-contact-url-drift",
        trialId: "trial-01",
        action: "execute-unstarted",
      },
      {
        taskId: "calibration-repair-contact-url-drift",
        trialId: "trial-02",
        action: "execute-unstarted",
      },
    ]);
    expect(queue.some((entry) => entry.trialId === "trial-01" && entry.sequenceIndex === 1)).toBe(
      false,
    );
  });

  it("persists every required artifact atomically before scan and verifies before cleanup", async () => {
    const root = await makeRoot();
    let scanObservedStages: string[] = [];
    let cleanupObservedStages: string[] = [];
    const trialCapture = capture(root);
    trialCapture.cleanupTemporaryRepository = async () => {
      const state = recoveryResumeStateSchema.parse(
        JSON.parse(
          await readFile(
            join(
              root,
              ".memosprout-local/calibration-recovery/v1/calibration-add-office-extension/trial-02/resume-state.json",
            ),
            "utf8",
          ),
        ),
      );
      cleanupObservedStages = state.durability.completedStages;
    };
    await persistCompletedRecoveryTrial({
      root,
      trial: firstRecoveryTrial,
      capture: trialCapture,
      scanPublicEvidence: async (directory) => {
        const state = recoveryResumeStateSchema.parse(
          JSON.parse(
            await readFile(
              join(
                root,
                ".memosprout-local/calibration-recovery/v1/calibration-add-office-extension/trial-02/resume-state.json",
              ),
              "utf8",
            ),
          ),
        );
        scanObservedStages = state.durability.completedStages;
        await expect(stat(join(directory, "sanitized-trace.jsonl"))).resolves.toBeDefined();
        await expect(stat(join(directory, "repository.patch"))).resolves.toBeDefined();
        await expect(stat(join(directory, "run.json"))).resolves.toBeDefined();
        await expect(stat(join(directory, "manifest-entry.json"))).resolves.toBeDefined();
        await expect(stat(join(directory, "completion-marker.json"))).resolves.toBeDefined();
        await expect(stat(join(directory, "raw-trace.jsonl"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
    });
    expect(scanObservedStages).toHaveLength(10);
    expect(scanObservedStages.at(-1)).toBe("completion-marker-persisted");
    expect(cleanupObservedStages.at(-1)).toBe("committed-evidence-verified");
    expect((await deriveRecoveryQueue(root)).map((entry) => entry.trialId)).toEqual([
      "trial-01",
      "trial-02",
    ]);
  });

  it("preserves failed scan evidence and resumes without a model rerun", async () => {
    const root = await makeRoot();
    let cleanupCount = 0;
    await expect(
      persistCompletedRecoveryTrial({
        root,
        trial: firstRecoveryTrial,
        capture: capture(root),
        scanPublicEvidence: async () => {
          throw new Error("synthetic scanner failure");
        },
      }),
    ).rejects.toThrow("synthetic scanner failure");

    const [entry] = await deriveRecoveryQueue(root);
    expect(entry).toMatchObject({
      taskId: "calibration-add-office-extension",
      trialId: "trial-02",
      action: "resume-completed-evidence",
    });
    const statePath = join(
      root,
      ".memosprout-local/calibration-recovery/v1/calibration-add-office-extension/trial-02/resume-state.json",
    );
    const failedState = recoveryResumeStateSchema.parse(
      JSON.parse(await readFile(statePath, "utf8")),
    );
    expect(failedState.durability).toMatchObject({
      scannerFailed: true,
      temporaryRepositoryPreserved: true,
      rawEvidencePreserved: true,
      sanitizedEvidencePreserved: true,
      interruptionRecorded: true,
    });

    await resumeCompletedRecoveryEvidence({
      root,
      trial: firstRecoveryTrial,
      scanPublicEvidence: async () => undefined,
      cleanupPreservedRepository: async () => {
        cleanupCount += 1;
      },
    });
    expect(cleanupCount).toBe(1);
    expect((await deriveRecoveryQueue(root)).some((candidate) => candidate.trialId === "trial-02" && candidate.sequenceIndex === 2)).toBe(false);
  });

  it("resumes an interrupted persistence prefix without another model turn", async () => {
    const root = await makeRoot();
    const recovery = await loadRecoveryDesign(root);
    const trialCapture = capture(root);
    const transaction = new RecoveryEvidenceTransaction(root, recovery, firstRecoveryTrial);
    await transaction.persistRawTrace({
      rawTrace: trialCapture.rawTrace,
      rawStderr: trialCapture.rawStderr,
      temporaryRepositoryLocalPath: trialCapture.temporaryRepositoryLocalPath,
      pendingEvidence: {
        sanitizedTrace: trialCapture.sanitizedTrace,
        repositoryPatch: trialCapture.repositoryPatch,
        beforeSnapshotSha256: trialCapture.beforeSnapshotSha256,
        afterSnapshotSha256: trialCapture.afterSnapshotSha256,
        files: trialCapture.files,
        safeFirstPass: trialCapture.safeFirstPass,
        infrastructureRetries: trialCapture.infrastructureRetries,
      },
    });
    await transaction.persistSanitizedTrace(trialCapture.sanitizedTrace);

    expect((await deriveRecoveryQueue(root))[0]).toMatchObject({
      taskId: firstRecoveryTrial.taskId,
      trialId: firstRecoveryTrial.trialId,
      action: "resume-completed-evidence",
    });
    let cleanupCount = 0;
    await resumeCompletedRecoveryEvidence({
      root,
      trial: firstRecoveryTrial,
      scanPublicEvidence: async () => undefined,
      cleanupPreservedRepository: async () => {
        cleanupCount += 1;
      },
    });
    expect(cleanupCount).toBe(1);
    expect(
      (await deriveRecoveryQueue(root)).some(
        (entry) => entry.sequenceIndex === firstRecoveryTrial.sequenceIndex,
      ),
    ).toBe(false);
  });

  it("never includes raw local evidence in the public manifest entry", async () => {
    const root = await makeRoot();
    await persistCompletedRecoveryTrial({
      root,
      trial: firstRecoveryTrial,
      capture: capture(root),
      scanPublicEvidence: async () => undefined,
    });
    const manifest = await readFile(
      join(
        root,
        "demo/generated-files/evidence/v2/calibration-recovery/v1/calibration-add-office-extension/trial-02/manifest-entry.json",
      ),
      "utf8",
    );
    expect(manifest).not.toContain("raw-trace");
    expect(manifest).not.toContain("raw-stderr");
    expect(manifest).not.toContain(".memosprout-local");
  });
});
