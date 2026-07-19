import { runRuntimeCorrectionValidation } from "@/lib/eval/v2/runtime-correction";

async function main(): Promise<void> {
  const result = await runRuntimeCorrectionValidation();
  process.stdout.write(
    `Phase 4 v2 model-free runtime-correction validation completed: preflight ${result.report.preflightPassed ? "passed" : "failed"}, fixtures ${result.report.fixturesPassed}/2, ${result.report.environmentClassification}, model calls 0.\n`,
  );
}

main().catch(() => {
  process.stderr.write(
    "Runtime-correction validation failed without changing observed calibration outcomes.\n",
  );
  process.exitCode = 1;
});
