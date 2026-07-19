import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { assertSanitizedEvidence } from "@/lib/codex/sanitize";
import { assertRecoveryNode24 } from "@/lib/eval/v2/calibration-recovery-launcher";
import { verifyCalibrationV2Design } from "@/lib/eval/v2/calibration-v2";
import { executeLiveCalibrationV2Trial } from "@/lib/eval/v2/calibration-v2-live";
import {
  consumeCalibrationV2Authorization,
  runCalibrationV2Cli,
} from "@/lib/eval/v2/calibration-v2-runner";

async function scanPublicEvidence(publicDirectory: string): Promise<void> {
  for (const entry of await readdir(publicDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    assertSanitizedEvidence(await readFile(join(publicDirectory, entry.name), "utf8"));
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  assertRecoveryNode24(process.versions.node);
  const runtimeAuthorization = consumeCalibrationV2Authorization(process.env);
  const design = await verifyCalibrationV2Design(root, { allowExistingEvidence: true });
  const result = await runCalibrationV2Cli({
    root,
    argv: process.argv.slice(2),
    runtimeAuthorization,
    spawnTrial: (trial, hooks) =>
      executeLiveCalibrationV2Trial({ root, contract: design.contract, trial, hooks }),
    scanPublicEvidence,
  });
  if (result.diagnostic) process.stderr.write(`${result.diagnostic}\n`);
  if (result.exitCode === 0) {
    process.stdout.write("Phase 4 v2 calibration-v2 completed under generator runtime v2.\n");
  }
  process.exitCode = result.exitCode;
}

main().catch(() => {
  process.stderr.write(
    "Calibration v2 stopped before completion; frozen contracts and historical evidence are unchanged.\n",
  );
  process.exitCode = 1;
});
