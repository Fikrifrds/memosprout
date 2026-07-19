import {
  runRecoveryLauncher,
  sanitizeRecoveryLauncherError,
} from "@/lib/eval/v2/calibration-recovery-launcher";
import { executeRecoveryProcess } from "@/scripts/run-phase4-v2-calibration-recovery";

async function main(): Promise<void> {
  const root = process.cwd();
  const argv = process.argv.slice(2);
  const result = await runRecoveryLauncher({
    root,
    argv,
    environment: process.env,
    executeBoundary: async (runtimeAuthorization) => {
      const execution = await executeRecoveryProcess({
        root,
        argv,
        runtimeAuthorization,
      });
      if (execution.diagnostic) process.stderr.write(`${execution.diagnostic}\n`);
      process.exitCode = execution.exitCode;
    },
  });
  if (result.diagnostic) process.stderr.write(`${result.diagnostic}\n`);
  if (result.exitCode === 0 && process.exitCode === undefined) {
    process.stdout.write("Frozen calibration recovery completed.\n");
  }
  process.exitCode ??= result.exitCode;
}

main().catch((error) => {
  process.stderr.write(`${sanitizeRecoveryLauncherError(error)}\n`);
  process.exitCode = 1;
});
