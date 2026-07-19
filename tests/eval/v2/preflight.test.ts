import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CodexEvent } from "@/lib/codex/jsonl";
import { assertCodexOutputSchema } from "@/lib/codex/output-schema";
import {
  compareRepositorySnapshots,
  countPreflightToolEvents,
  phase4V2PreflightProviderSchema,
  phase4V2PreflightRunSchema,
  snapshotRepositoryWorktree,
} from "@/lib/eval/v2/preflight";

function validRun() {
  return {
    version: "phase4-v2-preflight-evidence-v1",
    source: "live",
    scored: false,
    status: "passed",
    preflightContractSha256: "a".repeat(64),
    workerConfigSha256: "b".repeat(64),
    isolatedRuntimeContractSha256: "c".repeat(64),
    cli: {
      executable: "codex",
      version: "codex-cli 0.144.6",
      command: "codex exec <sanitized>",
    },
    worker: {
      requestedModel: "gpt-5.4-mini",
      resolvedModel: "gpt-5.4-mini",
      modelResolutionEvidence: "bundled-catalog-match-and-successful-explicit-model-turn",
      reasoningEffort: "low",
      reasoningAccepted: true,
    },
    authenticationCategory: "auth-file",
    attempts: [
      {
        attempt: 1,
        exitCode: 0,
        turnCompleted: true,
        tracePath: "demo/generated-files/evidence/v2/preflight/attempt-01.trace.jsonl",
        traceSha256: "d".repeat(64),
      },
    ],
    completedAttempt: 1,
    modelOutcomeRetries: 0,
    infrastructureRetries: 0,
    turn: {
      completed: true,
      completedTurnCount: 1,
      threadId: "preflight-thread",
      toolEventCount: 0,
      output: { acknowledgement: "preflight-complete" },
      tokenUsage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 },
    },
    exposure: {
      promptSha256: "e".repeat(64),
      repositoryInspectionRequested: false,
      evaluationTaskContentExposed: false,
      calibrationTaskContentExposed: false,
      scoringAnswersExposed: false,
      reservedTaskContentExposed: false,
    },
    repository: {
      initialSnapshotSha256: "f".repeat(64),
      finalSnapshotSha256: "f".repeat(64),
      byteIdentical: true,
      filesCreated: 0,
      filesChanged: 0,
      filesDeleted: 0,
      gitStatusClean: true,
    },
    sensitiveDataScan: {
      passed: true,
      credentialsFound: 0,
      machinePathsFound: 0,
      environmentValuesRecorded: 0,
    },
  };
}

describe("Phase 4 v2 worker preflight", () => {
  it("uses a provider-compatible unrelated acknowledgement schema", () => {
    expect(() => assertCodexOutputSchema(phase4V2PreflightProviderSchema)).not.toThrow();
  });

  it("accepts one completed turn with no model retry", () => {
    expect(phase4V2PreflightRunSchema.safeParse(validRun()).success).toBe(true);
  });

  it("rejects an infrastructure retry after a completed model turn", () => {
    const run = validRun();
    run.attempts = [
      run.attempts[0]!,
      { ...run.attempts[0]!, attempt: 2, tracePath: "demo/generated-files/evidence/v2/preflight/attempt-02.trace.jsonl" },
    ];
    run.completedAttempt = 2;
    run.infrastructureRetries = 1;
    expect(phase4V2PreflightRunSchema.safeParse(run).success).toBe(false);
  });

  it("distinguishes agent messages from prohibited tool activity", () => {
    const message: CodexEvent = {
      type: "item.completed",
      item: { type: "agent_message", text: "preflight-complete" },
    };
    const command: CodexEvent = {
      type: "item.completed",
      item: { type: "command_execution", command: "pwd", exit_code: 0 },
    };
    expect(countPreflightToolEvents([message])).toBe(0);
    expect(countPreflightToolEvents([message, command])).toBe(1);
  });

  it("detects created, changed, and deleted worktree files", async () => {
    const repository = await mkdtemp(join(tmpdir(), "memosprout-preflight-test-"));
    try {
      await mkdir(join(repository, "nested"));
      await Promise.all([
        writeFile(join(repository, "changed.txt"), "before\n"),
        writeFile(join(repository, "deleted.txt"), "before\n"),
      ]);
      const before = await snapshotRepositoryWorktree(repository);
      await Promise.all([
        writeFile(join(repository, "changed.txt"), "after\n"),
        writeFile(join(repository, "created.txt"), "after\n"),
        rm(join(repository, "deleted.txt")),
      ]);
      const after = await snapshotRepositoryWorktree(repository);
      expect(compareRepositorySnapshots(before.files, after.files)).toEqual({
        created: ["created.txt"],
        changed: ["changed.txt"],
        deleted: ["deleted.txt"],
      });
      expect(after.sha256).not.toBe(before.sha256);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
