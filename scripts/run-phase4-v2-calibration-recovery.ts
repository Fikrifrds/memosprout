import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import {
  consumeRecoveryRuntimeAuthorization,
  runRecoveryCli,
} from "@/lib/eval/v2/calibration-recovery-runner";

const result = await runRecoveryCli({
  argv: process.argv.slice(2),
  runtimeAuthorization: consumeRecoveryRuntimeAuthorization(process.env),
  spawnTrial: async () => {
    throw new Error("The frozen recovery v1 contract cannot reach live execution.");
  },
  scanPublicEvidence: async (publicDirectory) => {
    const { readdir, readFile } = await import("node:fs/promises");
    for (const entry of await readdir(publicDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      assertSanitizedEvidence(await readFile(`${publicDirectory}/${entry.name}`, "utf8"));
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
if (result.diagnostic) process.stderr.write(`${result.diagnostic}\n`);
process.exitCode = result.exitCode;
