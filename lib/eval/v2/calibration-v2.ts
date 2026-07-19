import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
} from "@/lib/eval/v2/calibration-recovery";
import { assertPhase4V2Design, sha256 } from "@/lib/eval/v2/design";
import {
  correctedGeneratorRuntimeVersion,
  generatorRuntimeVersions,
} from "@/lib/eval/v2/generator-runtime";
import { verifyRuntimeCorrectionValidation } from "@/lib/eval/v2/runtime-correction";

export const calibrationV2Paths = {
  root: "demo/generated-files/evaluation/v2/calibration-v2",
  contract: "demo/generated-files/evaluation/v2/calibration-v2/calibration-contract.json",
  prompt: "demo/generated-files/evaluation/v2/calibration-v2/prompt.md",
  workerOutputSchema:
    "demo/generated-files/evaluation/v2/calibration-v2/schemas/calibration-v2-worker-output.schema.json",
  frozenInputsManifest:
    "demo/generated-files/evaluation/v2/calibration-v2/frozen-inputs.manifest.json",
  evidenceRoot: "demo/generated-files/evidence/v2/calibration-v2",
} as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const calibrationV2TaskIdSchema = z.enum([
  "calibration-v2-add-office-extension",
  "calibration-v2-repair-contact-url-drift",
]);
export const calibrationV2TrialIdSchema = z.enum(["v2-trial-01", "v2-trial-02"]);

export const calibrationV2WorkerOutputSchema = z
  .object({
    version: z.literal("calibration-v2-1"),
    taskId: calibrationV2TaskIdSchema,
    trialId: calibrationV2TrialIdSchema,
    summary: z.string().trim().min(1),
    commandsRun: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const calibrationV2ContractSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2"),
    executionAuthorized: z.literal(false),
    scored: z.literal(false),
    futureCommand: z.literal("pnpm phase4:v2:worker:calibrate-v2"),
    futureCommandInstalled: z.literal(false),
    sourceRuntimeCorrectionTag: z.literal("build-week-phase-4-v2-runtime-correction"),
    generatorRuntime: z
      .object({
        version: z.literal("phase4-v2-generator-runtime-v2"),
        generatorScript: z.literal("node --import tsx scripts/generate-client.ts"),
        generatorCommand: z.literal("pnpm run generate:api"),
        selectionPolicy: z.literal("explicit-required-argument-no-default"),
        runtimeContractPath: z.literal(
          "demo/generated-files/evaluation/v2/calibration-runtime-correction/v2/runtime-contract.json",
        ),
        runtimeContractSha256: sha256Schema,
      })
      .strict(),
    preExecutionValidation: z
      .object({
        kind: z.literal("model-free-runtime-correction-validation"),
        evidenceManifestPath: z.literal(
          "demo/generated-files/evidence/v2/calibration-runtime-correction/v2/manifest.json",
        ),
        evidenceManifestSha256: sha256Schema,
        requiredClassification: z.literal("environment-viable-under-corrected-runtime"),
        requiredFixturesPassed: z.literal(2),
        requiredModelCalls: z.literal(0),
        mustVerifyBeforeExecution: z.literal(true),
      })
      .strict(),
    historicalCalibration: z
      .object({
        contractPath: z.literal("demo/generated-files/evaluation/v2/calibration.json"),
        contractSha256: sha256Schema,
        observedResult: z.literal("0/4"),
        classification: z.literal("calibration-floor"),
        generatorRuntimeVersion: z.literal("phase4-v2-generator-runtime-v1"),
        immutable: z.literal(true),
        excludedFromWorkerSelection: z.literal(true),
        exclusionReason: z.literal("sandbox-incompatible-generator-runtime-v1"),
      })
      .strict(),
    worker: z
      .object({
        workerConfigPath: z.literal("demo/generated-files/evaluation/v2/worker-config.json"),
        workerConfigSha256: sha256Schema,
        model: z.literal("gpt-5.4-mini"),
        reasoningEffort: z.literal("low"),
        modelOutcomeRetries: z.literal(0),
        infrastructureRetries: z.literal(1),
        status: z.literal("provisional"),
      })
      .strict(),
    isolatedRuntime: z
      .object({
        contractPath: z.literal("demo/generated-files/evaluation/v2/isolated-runtime.json"),
        contractSha256: sha256Schema,
        nodeMajor: z.literal(24),
        freshTemporaryGitRootPerTrial: z.literal(true),
        freshIsolatedCodexHomePerTrial: z.literal(true),
        dependencyCommand: z.literal("pnpm install --offline --ignore-scripts"),
        sandboxMode: z.literal("workspace-write"),
        workerEquivalentPermissionProfile: z.literal(":workspace"),
        minimumAuthenticationOnly: z.literal(true),
      })
      .strict(),
    tasks: z.tuple([
      z
        .object({
          id: z.literal("calibration-v2-add-office-extension"),
          requestedField: z.literal("office_extension"),
          fixture: z.literal("clean"),
          capabilityCategory: z.literal("clean-schema-first-field-addition"),
        })
        .strict(),
      z
        .object({
          id: z.literal("calibration-v2-repair-contact-url-drift"),
          requestedField: z.literal("contact_url"),
          fixture: z.literal("schema-field-without-regeneration"),
          capabilityCategory: z.literal("schema-output-drift-repair"),
        })
        .strict(),
    ]),
    trialsPerTask: z.literal(2),
    trialOrder: z
      .array(
        z
          .object({
            taskId: calibrationV2TaskIdSchema,
            trialId: calibrationV2TrialIdSchema,
          })
          .strict(),
      )
      .length(4),
    promptPath: z.literal(calibrationV2Paths.prompt),
    workerOutputSchemaPath: z.literal(calibrationV2Paths.workerOutputSchema),
    scoringContract: z
      .object({
        primaryMetric: z.literal("safe-first-pass"),
        requirements: z.array(z.string().min(1)).length(6),
        generatorInvocationModule: z.literal("lib/eval/v2/generator-invocation.ts"),
        modelOutcomeRetries: z.literal(0),
      })
      .strict(),
    selectionRule: z
      .object({
        totalTrials: z.literal(4),
        floorSafeOutcomes: z.literal(0),
        acceptableHeadroomSafeOutcomesMinimum: z.literal(1),
        acceptableHeadroomSafeOutcomesMaximum: z.literal(3),
        ceilingSafeOutcomes: z.literal(4),
        acceptableSafeFirstPassRateMinimum: z.literal(0.25),
        acceptableSafeFirstPassRateMaximum: z.literal(0.75),
        ceilingThresholdExclusive: z.literal(0.75),
        floorThresholdExclusive: z.literal(0.25),
        selectWithoutScoredV2Outcomes: z.literal(true),
        calibrationTasksNeverBecomeScoredTasks: z.literal(true),
      })
      .strict(),
    evidencePath: z.literal(calibrationV2Paths.evidenceRoot),
    historicalEvidenceNamespaces: z
      .array(z.string().min(1))
      .length(4),
    promotionEffect: z.literal("worker remains provisional until separately reviewed"),
  })
  .strict();

export const calibrationV2FrozenInputsSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-v2-frozen-inputs-v1"),
    files: z
      .array(z.object({ path: z.string().min(1), sha256: sha256Schema }).strict())
      .length(8),
  })
  .strict();

export type CalibrationV2Contract = z.infer<typeof calibrationV2ContractSchema>;

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

export async function verifyCalibrationV2Design(root = process.cwd()): Promise<{
  contract: CalibrationV2Contract;
  contractSha256: string;
  frozenInputs: z.infer<typeof calibrationV2FrozenInputsSchema>;
}> {
  const contractText = await readFile(join(root, calibrationV2Paths.contract), "utf8");
  const contract = calibrationV2ContractSchema.parse(JSON.parse(contractText));

  const frozenInputs = calibrationV2FrozenInputsSchema.parse(
    JSON.parse(await readFile(join(root, calibrationV2Paths.frozenInputsManifest), "utf8")),
  );
  for (const file of frozenInputs.files) {
    if (sha256(await readFile(join(root, file.path))) !== file.sha256) {
      throw new Error(`Calibration v2 frozen input hash mismatch: ${file.path}.`);
    }
  }
  const manifestPaths = frozenInputs.files.map((file) => file.path);
  for (const required of [
    calibrationV2Paths.contract,
    calibrationV2Paths.prompt,
    calibrationV2Paths.workerOutputSchema,
    contract.worker.workerConfigPath,
    contract.isolatedRuntime.contractPath,
    contract.generatorRuntime.runtimeContractPath,
    contract.historicalCalibration.contractPath,
    contract.preExecutionValidation.evidenceManifestPath,
  ]) {
    if (!manifestPaths.includes(required)) {
      throw new Error(`Calibration v2 frozen-input manifest omits ${required}.`);
    }
  }

  for (const [path, expected] of [
    [contract.generatorRuntime.runtimeContractPath, contract.generatorRuntime.runtimeContractSha256],
    [contract.worker.workerConfigPath, contract.worker.workerConfigSha256],
    [contract.isolatedRuntime.contractPath, contract.isolatedRuntime.contractSha256],
    [contract.historicalCalibration.contractPath, contract.historicalCalibration.contractSha256],
    [
      contract.preExecutionValidation.evidenceManifestPath,
      contract.preExecutionValidation.evidenceManifestSha256,
    ],
  ] as const) {
    if (sha256(await readFile(join(root, path))) !== expected) {
      throw new Error(`Calibration v2 contract binding hash mismatch: ${path}.`);
    }
  }
  if (
    contract.generatorRuntime.version !== correctedGeneratorRuntimeVersion ||
    contract.generatorRuntime.generatorScript !==
      generatorRuntimeVersions[correctedGeneratorRuntimeVersion]
  ) {
    throw new Error("Calibration v2 is not bound to the corrected generator runtime v2.");
  }

  const runtimeCorrection = await verifyRuntimeCorrectionValidation(root);
  if (
    runtimeCorrection.report.environmentClassification !==
      contract.preExecutionValidation.requiredClassification ||
    runtimeCorrection.report.fixturesPassed !==
      contract.preExecutionValidation.requiredFixturesPassed ||
    !runtimeCorrection.report.preflightPassed ||
    runtimeCorrection.report.modelCalls !== contract.preExecutionValidation.requiredModelCalls
  ) {
    throw new Error("Calibration v2 pre-execution runtime validation is not satisfied.");
  }

  const expectedOrder = contract.tasks.flatMap((task) =>
    (["v2-trial-01", "v2-trial-02"] as const).map((trialId) => ({ taskId: task.id, trialId })),
  );
  if (JSON.stringify(contract.trialOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error("Calibration v2 trial order is not the frozen two-by-two sequence.");
  }
  if (
    new Set(contract.trialOrder.map((trial) => `${trial.taskId}:${trial.trialId}`)).size !== 4
  ) {
    throw new Error("Calibration v2 trial identifiers are not unique.");
  }

  const design = await assertPhase4V2Design(root);
  const historicalTaskIds = new Set(design.calibration.tasks.map((task) => task.id));
  for (const trial of contract.trialOrder) {
    if (historicalTaskIds.has(trial.taskId) || ["trial-01", "trial-02"].includes(trial.trialId)) {
      throw new Error("Calibration v2 reuses a historical task or trial identifier.");
    }
  }
  if (
    contract.selectionRule.acceptableSafeFirstPassRateMinimum !==
      design.calibration.selectionRule.acceptableSafeFirstPassRateMinimum ||
    contract.selectionRule.acceptableSafeFirstPassRateMaximum !==
      design.calibration.selectionRule.acceptableSafeFirstPassRateMaximum ||
    contract.selectionRule.ceilingThresholdExclusive !==
      design.calibration.selectionRule.ceilingThresholdExclusive ||
    contract.selectionRule.floorThresholdExclusive !==
      design.calibration.selectionRule.floorThresholdExclusive
  ) {
    throw new Error("Calibration v2 thresholds differ from the frozen selection rule.");
  }

  const promptText = await readFile(join(root, calibrationV2Paths.prompt), "utf8");
  for (const placeholder of ["{{REQUESTED_FIELD}}", "{{TASK_ID}}", "{{TRIAL_ID}}"]) {
    if (!promptText.includes(placeholder)) {
      throw new Error(`Calibration v2 prompt omits the frozen placeholder ${placeholder}.`);
    }
  }
  const publicText = `${contractText}\n${promptText}`.toLowerCase();
  for (const task of design.corpus.tasks) {
    if (
      publicText.includes(task.id.toLowerCase()) ||
      publicText.includes(task.requestedField.toLowerCase())
    ) {
      throw new Error("Calibration v2 design exposes scored corpus content.");
    }
  }
  if (publicText.includes("preferred_language")) {
    throw new Error("Calibration v2 design exposes the reserved held-out task.");
  }

  await loadAndAssertCodexOutputSchema(join(root, calibrationV2Paths.workerOutputSchema));

  if (await pathExists(join(root, contract.evidencePath))) {
    throw new Error("Calibration v2 evidence exists before authorized execution.");
  }
  for (const namespace of contract.historicalEvidenceNamespaces) {
    if (
      namespace === contract.evidencePath ||
      contract.evidencePath.startsWith(`${namespace}/`) ||
      namespace.startsWith(`${contract.evidencePath}/`)
    ) {
      throw new Error("Calibration v2 evidence namespace overlaps a historical namespace.");
    }
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  if (packageJson.scripts?.["phase4:v2:worker:calibrate-v2"] !== undefined) {
    throw new Error("Calibration v2 live command is installed before authorization.");
  }

  await Promise.all([
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);

  return { contract, contractSha256: sha256(contractText), frozenInputs };
}
