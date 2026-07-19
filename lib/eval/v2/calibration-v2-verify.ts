import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
} from "@/lib/eval/v2/calibration-recovery";
import { verifyCalibrationV2Design } from "@/lib/eval/v2/calibration-v2";
import {
  calibrationV2CompletionMarkerSchema,
  calibrationV2ManifestEntrySchema,
  calibrationV2PublicManifestSchema,
  calibrationV2ReportSchema,
  calibrationV2RunRecordSchema,
  classifyCalibrationV2,
} from "@/lib/eval/v2/calibration-v2-runner";
import { sha256 } from "@/lib/eval/v2/design";

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

export type CalibrationV2EvidenceVerification =
  | { status: "no-evidence" }
  | {
      status: "verified";
      report: z.infer<typeof calibrationV2ReportSchema>;
      manifest: z.infer<typeof calibrationV2PublicManifestSchema>;
      runs: Array<z.infer<typeof calibrationV2RunRecordSchema>>;
    };

export async function verifyCalibrationV2Evidence(
  root = process.cwd(),
): Promise<CalibrationV2EvidenceVerification> {
  const evidenceExists = await pathExists(
    join(root, "demo/generated-files/evidence/v2/calibration-v2"),
  );
  const design = await verifyCalibrationV2Design(root, {
    allowExistingEvidence: evidenceExists,
  });
  if (!evidenceExists) return { status: "no-evidence" };

  const evidenceRoot = join(root, design.contract.evidencePath);
  const manifestText = await readFile(join(evidenceRoot, "manifest.json"), "utf8");
  const manifest = calibrationV2PublicManifestSchema.parse(JSON.parse(manifestText));
  for (const file of manifest.files) {
    const content = await readFile(join(root, file.path), "utf8");
    if (sha256(content) !== file.sha256) {
      throw new Error(`Calibration v2 evidence hash mismatch: ${file.path}.`);
    }
    if (
      /\/Users\/|\/home\/|\/private\/var\/|MEMOSPROUT_CALIBRATION_V2_AUTHORIZATION_ID|MEMOSPROUT_RECOVERY_AUTHORIZATION_ID|CODEX_API_KEY|OPENAI_API_KEY/.test(
        content,
      )
    ) {
      throw new Error(`Calibration v2 evidence sanitation failed: ${file.path}.`);
    }
  }

  const runs: Array<z.infer<typeof calibrationV2RunRecordSchema>> = [];
  for (const [index, trial] of design.contract.trialOrder.entries()) {
    const directory = join(evidenceRoot, trial.taskId, trial.trialId);
    const run = calibrationV2RunRecordSchema.parse(
      JSON.parse(await readFile(join(directory, "run.json"), "utf8")),
    );
    const marker = calibrationV2CompletionMarkerSchema.parse(
      JSON.parse(await readFile(join(directory, "completion-marker.json"), "utf8")),
    );
    const entry = calibrationV2ManifestEntrySchema.parse(
      JSON.parse(await readFile(join(directory, "manifest-entry.json"), "utf8")),
    );
    const expectedId = sha256(`${design.contract.version}:${trial.taskId}:${trial.trialId}`);
    if (
      run.taskId !== trial.taskId ||
      run.trialId !== trial.trialId ||
      run.sequenceIndex !== index + 1 ||
      run.stableTrialId !== expectedId ||
      marker.stableTrialId !== expectedId ||
      entry.stableTrialId !== expectedId ||
      run.generatorRuntimeVersion !== "phase4-v2-generator-runtime-v2" ||
      !run.snapshots.evaluatorUnchanged ||
      run.snapshots.afterSha256 !== run.snapshots.postEvaluationSha256 ||
      marker.publicEvidenceHashesSha256 !== sha256(`${JSON.stringify(entry.files)}\n`)
    ) {
      throw new Error(`Calibration v2 run integrity failed for ${trial.taskId}/${trial.trialId}.`);
    }
    runs.push(run);
  }
  if (new Set(runs.map((run) => run.stableTrialId)).size !== 4) {
    throw new Error("Calibration v2 runs are not four unique trials.");
  }

  const report = calibrationV2ReportSchema.parse(
    JSON.parse(await readFile(join(evidenceRoot, "calibration-v2-report.json"), "utf8")),
  );
  const classification = classifyCalibrationV2(
    runs.map((run) => run.safeFirstPass) as [boolean, boolean, boolean, boolean],
  );
  if (
    report.safeFirstPassCount !== classification.safeFirstPassCount ||
    report.safeFirstPassRate !== classification.safeFirstPassRate ||
    report.classification !== classification.classification ||
    report.workerAccepted !== (classification.classification === "acceptable-headroom") ||
    JSON.stringify(report.outcomes) !==
      JSON.stringify(
        runs.map((run) => ({
          taskId: run.taskId,
          trialId: run.trialId,
          safeFirstPass: run.safeFirstPass,
        })),
      )
  ) {
    throw new Error("Calibration v2 report is not derived from its run evidence.");
  }

  await Promise.all([
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  return { status: "verified", report, manifest, runs };
}
