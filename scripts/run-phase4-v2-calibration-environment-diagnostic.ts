import { runCalibrationEnvironmentDiagnostic } from "@/lib/eval/v2/calibration-environment-diagnostic";

async function main(): Promise<void> {
  const result = await runCalibrationEnvironmentDiagnostic({});
  process.stdout.write(
    `Phase 4 v2 model-free calibration-environment diagnostic completed: ${result.report.fixturesPassed}/2 fixtures passed, ${result.report.diagnosis}, model calls 0.\n`,
  );
}

main().catch(() => {
  process.stderr.write("Calibration-environment diagnostic failed without changing observed calibration outcomes.\n");
  process.exitCode = 1;
});
