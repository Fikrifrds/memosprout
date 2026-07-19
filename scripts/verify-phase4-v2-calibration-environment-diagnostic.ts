import { verifyCalibrationEnvironmentDiagnostic } from "@/lib/eval/v2/calibration-environment-diagnostic";

async function main(): Promise<void> {
  const result = await verifyCalibrationEnvironmentDiagnostic();
  process.stdout.write(
    `Phase 4 v2 calibration-environment diagnostic verified: preflight ${result.report.preflightPassed ? "passed" : "failed"}, fixtures ${result.report.fixturesPassed}/2, ${result.report.diagnosis}, model calls ${result.report.modelCalls}.\n`,
  );
}

main().catch(() => {
  process.stderr.write("Calibration-environment diagnostic verification failed.\n");
  process.exitCode = 1;
});
