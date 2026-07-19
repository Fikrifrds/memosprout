import { verifyCalibrationV2Design } from "@/lib/eval/v2/calibration-v2";

async function main(): Promise<void> {
  const result = await verifyCalibrationV2Design();
  process.stdout.write(
    `Phase 4 v2 calibration-v2 design verified without execution: ${result.contract.trialOrder.length} frozen trials, runtime ${result.contract.generatorRuntime.version}, worker ${result.contract.worker.model} (${result.contract.worker.reasoningEffort}), execution authorized ${result.contract.executionAuthorized}.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Calibration-v2 design verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
