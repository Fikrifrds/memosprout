import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  calibrationV2ContractSchema,
  calibrationV2Paths,
} from "@/lib/eval/v2/calibration-v2";
import {
  calibrationV2CompletionMarkerSchema,
  calibrationV2LocalOnlyEvidenceRoot,
  calibrationV2ManifestEntrySchema,
  calibrationV2RunRecordSchema,
  classifyCalibrationV2,
  consumeCalibrationV2Authorization,
  deriveCalibrationV2AuthorizationId,
  deriveCalibrationV2Queue,
  runCalibrationV2Cli,
  type CalibrationV2QueueEntry,
} from "@/lib/eval/v2/calibration-v2-runner";
import { renderCalibrationV2Prompt } from "@/lib/eval/v2/calibration-v2-live";
import { assertPhase4V2Design, sha256 } from "@/lib/eval/v2/design";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function loadContract() {
  return calibrationV2ContractSchema.parse(
    JSON.parse(await readFile(calibrationV2Paths.contract, "utf8")),
  );
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

class BoundarySentinel extends Error {
  constructor() {
    super("injected execution boundary reached");
  }
}

describe("Phase 4 v2 calibration-v2 runner", () => {
  it("produces exit 2 with zero spawns and no evidence for missing consent", async () => {
    const spawns: CalibrationV2QueueEntry[] = [];
    const result = await runCalibrationV2Cli({
      runtimeAuthorization: undefined,
      spawnTrial: async (trial) => {
        spawns.push(trial);
        throw new BoundarySentinel();
      },
      scanPublicEvidence: async () => {},
    });
    expect(result.exitCode).toBe(2);
    expect(spawns).toHaveLength(0);
    expect(await pathExists("demo/generated-files/evidence/v2/calibration-v2")).toBe(false);
  });

  it("produces exit 2 with zero spawns for incorrect consent", async () => {
    const spawns: CalibrationV2QueueEntry[] = [];
    const result = await runCalibrationV2Cli({
      runtimeAuthorization: "not-the-derived-identifier",
      spawnTrial: async (trial) => {
        spawns.push(trial);
        throw new BoundarySentinel();
      },
      scanPublicEvidence: async () => {},
    });
    expect(result.exitCode).toBe(2);
    expect(spawns).toHaveLength(0);
  });

  it("reaches only the injected execution boundary for correct consent", async () => {
    const authorization = await deriveCalibrationV2AuthorizationId();
    const spawns: CalibrationV2QueueEntry[] = [];
    await expect(
      runCalibrationV2Cli({
        runtimeAuthorization: authorization,
        spawnTrial: async (trial) => {
          spawns.push(trial);
          throw new BoundarySentinel();
        },
        scanPublicEvidence: async () => {},
      }),
    ).rejects.toThrow(BoundarySentinel);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toMatchObject({
      sequenceIndex: 1,
      taskId: "calibration-v2-add-office-extension",
      trialId: "v2-trial-01",
    });
    expect(await pathExists("demo/generated-files/evidence/v2/calibration-v2")).toBe(false);
    expect(await pathExists(calibrationV2LocalOnlyEvidenceRoot)).toBe(false);
  });

  it("consumes and deletes the authorization environment entry", () => {
    const environment: Record<string, string | undefined> = {
      MEMOSPROUT_CALIBRATION_V2_AUTHORIZATION_ID: "value",
      PATH: "/bin",
    };
    expect(consumeCalibrationV2Authorization(environment)).toBe("value");
    expect("MEMOSPROUT_CALIBRATION_V2_AUTHORIZATION_ID" in environment).toBe(false);
  });

  it("queues exactly four fresh trial identifiers in the frozen order", async () => {
    const contract = await loadContract();
    const queue = await deriveCalibrationV2Queue({ root: process.cwd(), contract });
    expect(
      queue.map((entry) => [entry.sequenceIndex, entry.taskId, entry.trialId]),
    ).toEqual([
      [1, "calibration-v2-add-office-extension", "v2-trial-01"],
      [2, "calibration-v2-add-office-extension", "v2-trial-02"],
      [3, "calibration-v2-repair-contact-url-drift", "v2-trial-01"],
      [4, "calibration-v2-repair-contact-url-drift", "v2-trial-02"],
    ]);
    expect(new Set(queue.map((entry) => entry.stableTrialId)).size).toBe(4);
  });

  it("never admits historical runtime-v1 identifiers into queue evidence", async () => {
    const historical = {
      version: "phase4-v2-calibration-v2-run-v1",
      source: "live",
      scored: false,
      calibrationOnly: true,
      stableTrialId: "a".repeat(64),
      sequenceIndex: 1,
      taskId: "calibration-add-office-extension",
      trialId: "trial-01",
      generatorRuntimeVersion: "phase4-v2-generator-runtime-v2",
      worker: { model: "gpt-5.4-mini", reasoningEffort: "low" },
      turnCompleted: true,
      modelOutcomeRetries: 0,
      infrastructureRetries: 0,
      safeFirstPass: false,
      snapshots: {
        beforeSha256: "a".repeat(64),
        afterSha256: "a".repeat(64),
        postEvaluationSha256: "a".repeat(64),
        evaluatorUnchanged: true,
      },
      files: { created: [], changed: [], deleted: [] },
      exposure: {
        phase3Guidance: false,
        phase3Enforcement: false,
        scoredCorpusContent: false,
        scoringAnswers: false,
        hiddenOracleImplementation: false,
        reservedTaskContent: false,
      },
    };
    expect(() => calibrationV2RunRecordSchema.parse(historical)).toThrow();
    expect(() =>
      calibrationV2RunRecordSchema.parse({
        ...historical,
        taskId: "calibration-v2-add-office-extension",
        trialId: "v2-trial-01",
      }),
    ).not.toThrow();
  });

  it("requires explicit runtime v2 for every trial and never runtime v1", async () => {
    const liveSource = await readFile("lib/eval/v2/calibration-v2-live.ts", "utf8");
    expect(liveSource).toContain("generatorRuntimeVersion: correctedGeneratorRuntimeVersion");
    expect(liveSource).not.toContain("historicalGeneratorRuntimeVersion");
    expect(() =>
      calibrationV2RunRecordSchema.shape.generatorRuntimeVersion.parse(
        "phase4-v2-generator-runtime-v1",
      ),
    ).toThrow();
  });

  it("skips trials with verified completion markers so they never rerun", async () => {
    const contract = await loadContract();
    const root = await mkdtemp(join(tmpdir(), "memosprout-calibration-v2-queue-"));
    temporaryRoots.push(root);
    const trial = contract.trialOrder[0]!;
    const directory = join(root, contract.evidencePath, trial.taskId, trial.trialId);
    await mkdir(directory, { recursive: true });
    const stableTrialId = sha256(`${contract.version}:${trial.taskId}:${trial.trialId}`);
    const files: Array<{ path: string; sha256: string }> = [];
    for (const name of ["sanitized-trace.jsonl", "repository.patch", "run.json"]) {
      const content = name === "run.json" ? "{}\n" : `${name} content\n`;
      await writeFile(join(directory, name), content);
      files.push({ path: relative(root, join(directory, name)), sha256: sha256(content) });
    }
    const entry = calibrationV2ManifestEntrySchema.parse({
      version: "phase4-v2-calibration-v2-manifest-entry-v1",
      stableTrialId,
      taskId: trial.taskId,
      trialId: trial.trialId,
      files,
    });
    await writeFile(join(directory, "manifest-entry.json"), `${JSON.stringify(entry, null, 2)}\n`);
    const marker = calibrationV2CompletionMarkerSchema.parse({
      version: "phase4-v2-calibration-v2-completion-marker-v1",
      stableTrialId,
      taskId: trial.taskId,
      trialId: trial.trialId,
      turnCompleted: true,
      behavioralOutcomeRecorded: true,
      rawEvidenceLocalOnly: true,
      publicEvidenceHashesSha256: sha256(`${JSON.stringify(entry.files)}\n`),
      durabilityStage: "completion-marker-persisted",
    });
    await writeFile(
      join(directory, "completion-marker.json"),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
    const queue = await deriveCalibrationV2Queue({ root, contract });
    expect(queue).toHaveLength(3);
    expect(queue.map((item) => `${item.taskId}:${item.trialId}`)).not.toContain(
      `${trial.taskId}:${trial.trialId}`,
    );
  });

  it("classifies exactly four outcomes with the frozen thresholds", () => {
    expect(classifyCalibrationV2([false, false, false, false]).classification).toBe(
      "calibration-floor",
    );
    expect(classifyCalibrationV2([true, false, false, false]).classification).toBe(
      "acceptable-headroom",
    );
    expect(classifyCalibrationV2([true, true, true, false]).classification).toBe(
      "acceptable-headroom",
    );
    expect(classifyCalibrationV2([true, true, true, true]).classification).toBe(
      "calibration-ceiling",
    );
  });

  it("separates public evidence from git-ignored local-only raw evidence", async () => {
    const contract = await loadContract();
    expect(calibrationV2LocalOnlyEvidenceRoot.startsWith(".memosprout-local/")).toBe(true);
    expect(contract.evidencePath.startsWith("demo/generated-files/evidence/")).toBe(true);
    expect(await readFile(".gitignore", "utf8")).toContain(".memosprout-local/");
  });

  it("renders prompts without exposing scored or reserved task content", async () => {
    const contract = await loadContract();
    const template = await readFile(calibrationV2Paths.prompt, "utf8");
    const design = await assertPhase4V2Design();
    const agentInstructions = await readFile("AGENTS.md", "utf8");
    const reservedIdentifier = agentInstructions.match(/Reserve `([^`]+)`/)?.[1] as string;
    for (const trial of contract.trialOrder) {
      const task = contract.tasks.find((candidate) => candidate.id === trial.taskId)!;
      const prompt = renderCalibrationV2Prompt(template, {
        requestedField: task.requestedField,
        taskId: trial.taskId,
        trialId: trial.trialId,
      });
      expect(prompt).not.toContain("{{");
      expect(prompt).toContain(task.requestedField);
      expect(prompt).not.toContain(reservedIdentifier);
      for (const scored of design.corpus.tasks) {
        expect(prompt).not.toContain(scored.id);
        expect(prompt).not.toContain(scored.requestedField);
      }
    }
  });
});
