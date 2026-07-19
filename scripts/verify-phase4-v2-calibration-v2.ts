import { verifyCalibrationV2Evidence } from "@/lib/eval/v2/calibration-v2-verify";

async function main(): Promise<void> {
  const result = await verifyCalibrationV2Evidence();
  if (result.status === "no-evidence") {
    process.stdout.write(
      "Phase 4 v2 calibration-v2 evidence verified: no evidence exists and execution remains unauthorized; design contracts are intact.\n",
    );
    return;
  }
  process.stdout.write(
    `Phase 4 v2 calibration-v2 evidence verified: ${result.report.safeFirstPassCount}/4 safe first passes (${result.report.safeFirstPassRate}), ${result.report.classification}, runtime ${result.report.generatorRuntimeVersion}.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Calibration-v2 evidence verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
