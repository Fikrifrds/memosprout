import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  recoveryRunRecordSchema,
  runRecoveryCli,
} from "@/lib/eval/v2/calibration-recovery-runner";

export async function executeRecoveryProcess(options: {
  root: string;
  argv: string[];
  runtimeAuthorization: string;
}): Promise<{ exitCode: 0 | 2; diagnostic?: string }> {
  const result = await runRecoveryCli({
    root: options.root,
    argv: options.argv,
    runtimeAuthorization: options.runtimeAuthorization,
    spawnTrial: async (trial, hooks) => {
      process.stdout.write(
        `Starting frozen recovery ${trial.sequenceIndex - 1}/3: ${trial.taskId}/${trial.trialId}.\n`,
      );
      const { executeLiveRecoveryTrial } = await import(
        "@/lib/eval/v2/calibration-recovery-live"
      );
      const capture = await executeLiveRecoveryTrial({ root: options.root, trial, hooks });
      process.stdout.write(
        `Completed frozen recovery ${trial.sequenceIndex - 1}/3: safe-first-pass=${capture.safeFirstPass}.\n`,
      );
      return capture;
    },
    scanPublicEvidence: async (publicDirectory) => {
      const { readdir, readFile } = await import("node:fs/promises");
      for (const entry of await readdir(publicDirectory, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const content = await readFile(`${publicDirectory}/${entry.name}`, "utf8");
        assertSanitizedEvidence(content);
        if (entry.name === "run.json") {
          const run = recoveryRunRecordSchema.parse(JSON.parse(content));
          if (
            !run.snapshots.evaluatorUnchanged ||
            run.snapshots.afterSha256 !== run.snapshots.postEvaluationSha256
          ) {
            throw new Error("Recovery evaluator mutated the temporary repository.");
          }
        }
      }
    },
    cleanupPreservedRepository: async (temporaryRepositoryLocalPath) => {
      const resolved = resolve(temporaryRepositoryLocalPath);
      const allowedPrefix = `${resolve(tmpdir())}${sep}memosprout-v2-calibration-repo-`;
      if (!resolved.startsWith(allowedPrefix)) {
        throw new Error("Recovery cleanup rejected an unexpected temporary repository path.");
      }
      await rm(resolved, { recursive: true, force: true });
    },
  });
  return {
    exitCode: result.exitCode,
    ...(result.diagnostic === null ? {} : { diagnostic: result.diagnostic }),
  };
}
