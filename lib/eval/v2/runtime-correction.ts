import { constants } from "node:fs";
import { access, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, relative } from "node:path";

import { z } from "zod";

import { evaluateGeneratedFilesEvidence } from "@/lib/eval/oracle";
import {
  buildCalibrationDiagnosticSandboxArguments,
  calibrationRuntimeCorrectionDesignPath,
  calibrationRuntimeCorrectionDesignSchema,
} from "@/lib/eval/v2/calibration-environment-diagnostic";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
} from "@/lib/eval/v2/calibration-recovery";
import {
  addRecoveryOptionalStringField,
  materializeRecoveryRepository,
  resolveRecoveryCommand,
  runRecoveryCommandProcess,
  type RecoveryCommandResult,
} from "@/lib/eval/v2/calibration-recovery-live";
import { assertRecoveryNode24 } from "@/lib/eval/v2/calibration-recovery-launcher";
import { assertPhase4V2Design, sha256 } from "@/lib/eval/v2/design";
import {
  correctedGeneratorRuntimeVersion,
  generatorRuntimeVersions,
  historicalGeneratorRuntimeVersion,
} from "@/lib/eval/v2/generator-runtime";
import { materializeIsolatedCodexRuntime } from "@/lib/eval/v2/isolated-runtime";
import {
  compareRepositorySnapshots,
  snapshotRepositoryWorktree,
} from "@/lib/eval/v2/preflight";

export const runtimeCorrectionContractPath =
  "demo/generated-files/evaluation/v2/calibration-runtime-correction/v2/runtime-contract.json";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const runtimeCorrectionContractSchema = z
  .object({
    version: z.literal("phase4-v2-generator-runtime-v2"),
    sourceDesignVersion: z.literal("phase4-v2-calibration-runtime-correction-design-v1"),
    sourceDesignSha256: sha256Schema,
    sourceDiagnosticManifestSha256: sha256Schema,
    scored: z.literal(false),
    modelCallsAllowed: z.literal(false),
    calibrationRerunsAllowed: z.literal(false),
    previousRuntime: z
      .object({
        version: z.literal("phase4-v2-generator-runtime-v1"),
        generatorScript: z.literal("tsx scripts/generate-client.ts"),
        status: z.literal("historical-sandbox-incompatible"),
        preserved: z.literal(true),
      })
      .strict(),
    correctedRuntime: z
      .object({
        generatorScript: z.literal("node --import tsx scripts/generate-client.ts"),
        generatorCommand: z.literal("pnpm run generate:api"),
        testCommand: z.literal("pnpm test"),
        generatorImplementationChanged: z.literal(false),
        generatedOutputFormatChanged: z.literal(false),
        sourceSchemaSemanticsChanged: z.literal(false),
        dependencySetChanged: z.literal(false),
        testCommandChanged: z.literal(false),
        sandboxModeChanged: z.literal(false),
      })
      .strict(),
    treatmentNeutralApplication: z
      .object({
        materializerModule: z.literal("lib/eval/v2/calibration-recovery-live.ts"),
        materializerExport: z.literal("materializeRecoveryRepository"),
        calibration: z.literal(true),
        baseline: z.literal(true),
        protected: z.literal(true),
        deterministicControls: z.literal(true),
      })
      .strict(),
    runtime: z
      .object({
        nodeMajor: z.literal(24),
        pathPolicy: z.literal("validated-process-exec-path-first"),
        dependencyCommand: z.literal("pnpm install --offline --ignore-scripts"),
        sandboxCommand: z.literal("codex sandbox"),
        permissionProfile: z.literal(":workspace"),
        sandboxMode: z.literal("workspace-write"),
        networkRequired: z.literal(false),
      })
      .strict(),
    worker: z
      .object({
        model: z.literal("gpt-5.4-mini"),
        reasoningEffort: z.literal("low"),
        status: z.literal("provisional-unchanged-refreeze-required-before-any-calibration"),
      })
      .strict(),
    validationFixtures: z.tuple([
      z
        .object({
          id: z.literal("clean-office-extension"),
          calibrationTaskId: z.literal("calibration-add-office-extension"),
          requestedField: z.literal("office_extension"),
          fixture: z.literal("clean"),
          initialByteMatchExpected: z.literal(true),
          diagnosticMutation: z.literal("add-field-to-source-schema"),
        })
        .strict(),
      z
        .object({
          id: z.literal("contact-url-schema-drift"),
          calibrationTaskId: z.literal("calibration-repair-contact-url-drift"),
          requestedField: z.literal("contact_url"),
          fixture: z.literal("schema-field-without-regeneration"),
          initialByteMatchExpected: z.literal(false),
          diagnosticMutation: z.literal("none-use-frozen-drift-fixture"),
        })
        .strict(),
    ]),
    classification: z
      .object({
        environmentViable: z.string().min(1),
        environmentInvalid: z.string().min(1),
        calibrationEvidenceEffect: z.literal("none"),
        workerSelectionEffect: z.string().min(1),
      })
      .strict(),
    evidenceRoot: z.literal(
      "demo/generated-files/evidence/v2/calibration-runtime-correction/v2",
    ),
  })
  .strict();

const commandEvidenceSchema = z
  .object({ command: z.string().min(1), exitCode: z.number().int() })
  .strict();

const runtimeEvidenceSchema = z
  .object({
    runtimeContractVersion: z.literal("phase4-v2-generator-runtime-v2"),
    materializer: z.literal("materializeRecoveryRepository"),
    generatorScript: z.literal("node --import tsx scripts/generate-client.ts"),
    generatorCommand: z.literal("pnpm run generate:api"),
    nodeProbe: commandEvidenceSchema,
    nodeVersion: z.string().regex(/^24\.\d+\.\d+$/),
    nodeMajorValid: z.literal(true),
    pathUsesProcessExecPathFirst: z.literal(true),
    isolatedAuthenticationCategory: z.enum(["auth-file", "environment"]),
    dependencyCommand: z.literal("pnpm install --offline --ignore-scripts"),
    dependencyInstallExitCode: z.number().int(),
    nodeModulesAvailable: z.boolean(),
    generatorScriptCorrected: z.boolean(),
    testScriptAvailable: z.boolean(),
    generatorDependencyAvailable: z.boolean(),
    testDependencyAvailable: z.boolean(),
    codexSandboxOnly: z.literal(true),
    codexExecCalls: z.literal(0),
    modelProcessSpawnCount: z.literal(0),
  })
  .strict();

export const runtimeCorrectionPreflightEvidenceSchema = z
  .object({
    version: z.literal("phase4-v2-runtime-correction-preflight-v1"),
    scored: z.literal(false),
    calibrationOutcome: z.literal(false),
    runtime: runtimeEvidenceSchema,
    initialByteMatch: z.boolean(),
    generator: commandEvidenceSchema,
    tests: commandEvidenceSchema,
    finalByteMatch: z.boolean(),
    repositoryUnchanged: z.boolean(),
  })
  .strict();

export const runtimeCorrectionCaseEvidenceSchema = z
  .object({
    version: z.literal("phase4-v2-runtime-correction-case-v1"),
    scored: z.literal(false),
    calibrationOutcome: z.literal(false),
    fixtureId: z.enum(["clean-office-extension", "contact-url-schema-drift"]),
    calibrationTaskId: z.enum([
      "calibration-add-office-extension",
      "calibration-repair-contact-url-drift",
    ]),
    requestedField: z.enum(["office_extension", "contact_url"]),
    fixture: z.enum(["clean", "schema-field-without-regeneration"]),
    runtime: runtimeEvidenceSchema,
    initialByteMatchExpected: z.boolean(),
    initialByteMatchObserved: z.boolean(),
    expectedInitialStateConfirmed: z.boolean(),
    diagnosticMutation: z.enum([
      "add-field-to-source-schema",
      "none-use-frozen-drift-fixture",
    ]),
    generator: commandEvidenceSchema,
    tests: commandEvidenceSchema,
    finalByteMatch: z.boolean(),
    expectedFinalStateReached: z.boolean(),
    evaluatorMutationDetected: z.literal(false),
    repositoryHashes: z
      .object({ initial: sha256Schema, afterMutation: sha256Schema, final: sha256Schema })
      .strict(),
    changedFiles: z
      .object({
        created: z.array(z.string()),
        changed: z.array(z.string()),
        deleted: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const runtimeCorrectionReportSchema = z
  .object({
    version: z.literal("phase4-v2-runtime-correction-report-v1"),
    source: z.literal("live-model-free-runtime-correction-validation"),
    runtimeContractVersion: z.literal("phase4-v2-generator-runtime-v2"),
    previousRuntimeVersion: z.literal("phase4-v2-generator-runtime-v1"),
    scored: z.literal(false),
    calibrationOutcomesModified: z.literal(false),
    modelCalls: z.literal(0),
    preflightPassed: z.boolean(),
    fixturesPassed: z.number().int().min(0).max(2),
    totalFixtures: z.literal(2),
    environmentClassification: z.enum([
      "environment-viable-under-corrected-runtime",
      "environment-floor-persists",
    ]),
    observedCalibrationFloorPreserved: z.literal(true),
    workerConfiguration: z
      .object({
        model: z.literal("gpt-5.4-mini"),
        reasoningEffort: z.literal("low"),
        status: z.literal("provisional-unchanged-refreeze-required-before-any-calibration"),
      })
      .strict(),
    immutableEvidenceBeforeSha256: sha256Schema,
    immutableEvidenceAfterSha256: sha256Schema,
  })
  .strict();

export const runtimeCorrectionManifestSchema = z
  .object({
    version: z.literal("phase4-v2-runtime-correction-manifest-v1"),
    files: z
      .array(z.object({ path: z.string().min(1), sha256: sha256Schema }).strict())
      .length(4),
  })
  .strict();

export type RuntimeCorrectionContract = z.infer<typeof runtimeCorrectionContractSchema>;
export type RuntimeCorrectionCaseEvidence = z.infer<
  typeof runtimeCorrectionCaseEvidenceSchema
>;

export interface RuntimeCorrectionDependencies {
  materialize: typeof materializeRecoveryRepository;
  runSandbox: (options: {
    repositoryRoot: string;
    executable: string;
    args: string[];
    environment: Record<string, string | undefined>;
  }) => Promise<RecoveryCommandResult>;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.atomic-write`;
  await rm(temporary, { force: true });
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

const immutableEvidenceRoots = [
  "demo/generated-files/evidence/v2/calibration",
  "demo/generated-files/evidence/v2/calibration-recovery",
  "demo/generated-files/evaluation/v2/calibration.json",
  "demo/generated-files/evaluation/v2/calibration-recovery/v1",
  "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v1",
  "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v2",
  "demo/generated-files/evaluation/v2/calibration-runtime-correction/v1",
];

async function snapshotImmutableEvidence(root: string): Promise<string> {
  const files: Array<{ path: string; sha256: string }> = [];
  async function visit(path: string): Promise<void> {
    const absolute = join(root, path);
    const metadata = await stat(absolute);
    if (metadata.isFile()) {
      files.push({ path, sha256: sha256(await readFile(absolute)) });
      return;
    }
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      await visit(join(path, entry.name));
    }
  }
  for (const path of immutableEvidenceRoots) await visit(path);
  return sha256(`${JSON.stringify(files.sort((a, b) => a.path.localeCompare(b.path)))}\n`);
}

export async function loadRuntimeCorrectionContract(
  root = process.cwd(),
): Promise<{ contract: RuntimeCorrectionContract; contractSha256: string }> {
  const contractText = await readFile(join(root, runtimeCorrectionContractPath), "utf8");
  const contract = runtimeCorrectionContractSchema.parse(JSON.parse(contractText));
  const designText = await readFile(join(root, calibrationRuntimeCorrectionDesignPath), "utf8");
  const design = calibrationRuntimeCorrectionDesignSchema.parse(JSON.parse(designText));
  if (contract.sourceDesignSha256 !== sha256(designText)) {
    throw new Error("Runtime-correction contract is not bound to the frozen v1 design.");
  }
  if (contract.sourceDiagnosticManifestSha256 !== design.sourceDiagnosticManifestSha256) {
    throw new Error("Runtime-correction contract diverges from the diagnostic v2 binding.");
  }
  if (
    contract.previousRuntime.generatorScript !==
      generatorRuntimeVersions[historicalGeneratorRuntimeVersion] ||
    contract.correctedRuntime.generatorScript !==
      generatorRuntimeVersions[correctedGeneratorRuntimeVersion] ||
    contract.version !== correctedGeneratorRuntimeVersion
  ) {
    throw new Error("Runtime-correction contract diverges from the generator-runtime versions.");
  }
  const diagnosticManifest = await readFile(
    join(
      root,
      "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v2/manifest.json",
    ),
  );
  if (sha256(diagnosticManifest) !== contract.sourceDiagnosticManifestSha256) {
    throw new Error("Diagnostic v2 evidence changed after the runtime-correction freeze.");
  }
  return { contract, contractSha256: sha256(contractText) };
}

function commandEvidence(command: string, result: RecoveryCommandResult) {
  return commandEvidenceSchema.parse({ command, exitCode: result.exitCode });
}

async function inspectCorrectedRuntime(options: {
  repositoryRoot: string;
  nodeResult: RecoveryCommandResult;
  authenticationCategory: "auth-file" | "environment";
  dependencyInstall: RecoveryCommandResult;
}) {
  const packageJson = JSON.parse(
    await readFile(join(options.repositoryRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const nodeVersion = options.nodeResult.stdout.trim();
  return runtimeEvidenceSchema.parse({
    runtimeContractVersion: "phase4-v2-generator-runtime-v2",
    materializer: "materializeRecoveryRepository",
    generatorScript: generatorRuntimeVersions[correctedGeneratorRuntimeVersion],
    generatorCommand: "pnpm run generate:api",
    nodeProbe: commandEvidence("node -p process.versions.node", options.nodeResult),
    nodeVersion,
    nodeMajorValid: options.nodeResult.exitCode === 0 && nodeVersion.startsWith("24."),
    pathUsesProcessExecPathFirst: true,
    isolatedAuthenticationCategory: options.authenticationCategory,
    dependencyCommand: "pnpm install --offline --ignore-scripts",
    dependencyInstallExitCode: options.dependencyInstall.exitCode,
    nodeModulesAvailable: await pathExists(join(options.repositoryRoot, "node_modules")),
    generatorScriptCorrected:
      packageJson.scripts?.["generate:api"] ===
      generatorRuntimeVersions[correctedGeneratorRuntimeVersion],
    testScriptAvailable: packageJson.scripts?.test === "vitest run",
    generatorDependencyAvailable: await pathExists(
      join(options.repositoryRoot, "node_modules", "tsx"),
    ),
    testDependencyAvailable: await pathExists(
      join(options.repositoryRoot, "node_modules", ".bin", "vitest"),
    ),
    codexSandboxOnly: true,
    codexExecCalls: 0,
    modelProcessSpawnCount: 0,
  });
}

export async function runRuntimeCorrectionValidation(options: {
  root?: string;
  dependencies?: RuntimeCorrectionDependencies;
} = {}) {
  const root = options.root ?? process.cwd();
  assertRecoveryNode24(process.versions.node);
  const [design, { contract }, immutableBefore] = await Promise.all([
    assertPhase4V2Design(root),
    loadRuntimeCorrectionContract(root),
    snapshotImmutableEvidence(root),
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  if (await pathExists(join(root, contract.evidenceRoot))) {
    throw new Error("Runtime-correction validation evidence already exists; rerun refused.");
  }
  const calibrationIdentity = design.calibration.tasks.map((task) => ({
    id: task.id,
    requestedField: task.requestedField,
    fixture: task.fixture,
  }));
  const fixtureIdentity = contract.validationFixtures.map((fixture) => ({
    id: fixture.calibrationTaskId,
    requestedField: fixture.requestedField,
    fixture: fixture.fixture,
  }));
  if (JSON.stringify(calibrationIdentity) !== JSON.stringify(fixtureIdentity)) {
    throw new Error("Runtime-correction fixtures differ from the frozen calibration taxonomy.");
  }

  const runtime = await materializeIsolatedCodexRuntime();
  runtime.environment.PATH = [dirname(process.execPath), runtime.environment.PATH]
    .filter(Boolean)
    .join(delimiter);
  const [codexExecutable, pnpmExecutable] = await Promise.all([
    resolveRecoveryCommand("codex", root),
    resolveRecoveryCommand("pnpm", root),
  ]);
  await Promise.all([
    access(codexExecutable, constants.X_OK),
    access(pnpmExecutable, constants.X_OK),
  ]);
  const dependencies: RuntimeCorrectionDependencies = options.dependencies ?? {
    materialize: materializeRecoveryRepository,
    runSandbox: ({ repositoryRoot, executable, args, environment }) =>
      runRecoveryCommandProcess({
        executable: codexExecutable,
        args: buildCalibrationDiagnosticSandboxArguments({
          repositoryRoot,
          executable,
          args,
        }),
        cwd: repositoryRoot,
        environment,
        timeoutMs: 120_000,
      }),
  };
  const repositories: string[] = [];
  try {
    const nodeProbe = (repositoryRoot: string) =>
      dependencies.runSandbox({
        repositoryRoot,
        executable: process.execPath,
        args: ["-p", "process.versions.node"],
        environment: runtime.environment,
      });
    const generator = (repositoryRoot: string) =>
      dependencies.runSandbox({
        repositoryRoot,
        executable: pnpmExecutable,
        args: ["run", "generate:api"],
        environment: runtime.environment,
      });
    const tests = (repositoryRoot: string) =>
      dependencies.runSandbox({
        repositoryRoot,
        executable: pnpmExecutable,
        args: ["test"],
        environment: runtime.environment,
      });

    const preflightRepository = await dependencies.materialize({
      root,
      requestedField: "office_extension",
      fixture: "clean",
      pnpmExecutable,
      environment: runtime.environment,
      generatorRuntimeVersion: correctedGeneratorRuntimeVersion,
    });
    repositories.push(preflightRepository.repositoryRoot);
    const preflightBefore = await snapshotRepositoryWorktree(preflightRepository.repositoryRoot);
    const preflightInitialOracle = await evaluateGeneratedFilesEvidence(
      preflightRepository.repositoryRoot,
    );
    const preflightRuntime = await inspectCorrectedRuntime({
      repositoryRoot: preflightRepository.repositoryRoot,
      nodeResult: await nodeProbe(preflightRepository.repositoryRoot),
      authenticationCategory: runtime.authenticationMode,
      dependencyInstall: preflightRepository.dependencyInstall,
    });
    const preflightGenerator = await generator(preflightRepository.repositoryRoot);
    const preflightTests = await tests(preflightRepository.repositoryRoot);
    const preflightFinalOracle = await evaluateGeneratedFilesEvidence(
      preflightRepository.repositoryRoot,
    );
    const preflightAfter = await snapshotRepositoryWorktree(preflightRepository.repositoryRoot);
    const preflightChanges = compareRepositorySnapshots(
      preflightBefore.files,
      preflightAfter.files,
    );
    const preflight = runtimeCorrectionPreflightEvidenceSchema.parse({
      version: "phase4-v2-runtime-correction-preflight-v1",
      scored: false,
      calibrationOutcome: false,
      runtime: preflightRuntime,
      initialByteMatch: preflightInitialOracle.passed,
      generator: commandEvidence("pnpm run generate:api", preflightGenerator),
      tests: commandEvidence("pnpm test", preflightTests),
      finalByteMatch: preflightFinalOracle.passed,
      repositoryUnchanged:
        preflightChanges.created.length === 0 &&
        preflightChanges.changed.length === 0 &&
        preflightChanges.deleted.length === 0,
    });

    const caseEvidence: RuntimeCorrectionCaseEvidence[] = [];
    for (const fixture of contract.validationFixtures) {
      const materialized = await dependencies.materialize({
        root,
        requestedField: fixture.requestedField,
        fixture: fixture.fixture,
        pnpmExecutable,
        environment: runtime.environment,
        generatorRuntimeVersion: correctedGeneratorRuntimeVersion,
      });
      repositories.push(materialized.repositoryRoot);
      const initialSnapshot = await snapshotRepositoryWorktree(materialized.repositoryRoot);
      const initialOracle = await evaluateGeneratedFilesEvidence(materialized.repositoryRoot);
      const caseRuntime = await inspectCorrectedRuntime({
        repositoryRoot: materialized.repositoryRoot,
        nodeResult: await nodeProbe(materialized.repositoryRoot),
        authenticationCategory: runtime.authenticationMode,
        dependencyInstall: materialized.dependencyInstall,
      });
      if (fixture.diagnosticMutation === "add-field-to-source-schema") {
        const schemaPath = join(materialized.repositoryRoot, "api", "openapi.yaml");
        await writeFile(
          schemaPath,
          addRecoveryOptionalStringField(
            await readFile(schemaPath, "utf8"),
            fixture.requestedField,
          ),
        );
      }
      const afterMutation = await snapshotRepositoryWorktree(materialized.repositoryRoot);
      const generatorResult = await generator(materialized.repositoryRoot);
      const generatorSnapshot = await snapshotRepositoryWorktree(materialized.repositoryRoot);
      const testResult = await tests(materialized.repositoryRoot);
      const finalOracle = await evaluateGeneratedFilesEvidence(materialized.repositoryRoot);
      const finalSnapshot = await snapshotRepositoryWorktree(materialized.repositoryRoot);
      const evaluatorChanges = compareRepositorySnapshots(
        generatorSnapshot.files,
        finalSnapshot.files,
      );
      const evaluatorMutationDetected =
        evaluatorChanges.created.length > 0 ||
        evaluatorChanges.changed.length > 0 ||
        evaluatorChanges.deleted.length > 0;
      if (evaluatorMutationDetected) {
        throw new Error("Runtime-correction evaluation mutated the repository after generation.");
      }
      const changedFiles = compareRepositorySnapshots(initialSnapshot.files, finalSnapshot.files);
      caseEvidence.push(
        runtimeCorrectionCaseEvidenceSchema.parse({
          version: "phase4-v2-runtime-correction-case-v1",
          scored: false,
          calibrationOutcome: false,
          fixtureId: fixture.id,
          calibrationTaskId: fixture.calibrationTaskId,
          requestedField: fixture.requestedField,
          fixture: fixture.fixture,
          runtime: caseRuntime,
          initialByteMatchExpected: fixture.initialByteMatchExpected,
          initialByteMatchObserved: initialOracle.passed,
          expectedInitialStateConfirmed: initialOracle.passed === fixture.initialByteMatchExpected,
          diagnosticMutation: fixture.diagnosticMutation,
          generator: commandEvidence("pnpm run generate:api", generatorResult),
          tests: commandEvidence("pnpm test", testResult),
          finalByteMatch: finalOracle.passed,
          expectedFinalStateReached:
            generatorResult.exitCode === 0 && testResult.exitCode === 0 && finalOracle.passed,
          evaluatorMutationDetected: false,
          repositoryHashes: {
            initial: initialSnapshot.sha256,
            afterMutation: afterMutation.sha256,
            final: finalSnapshot.sha256,
          },
          changedFiles,
        }),
      );
    }

    const runtimeReady = (value: z.infer<typeof runtimeEvidenceSchema>) =>
      value.dependencyInstallExitCode === 0 &&
      value.nodeMajorValid &&
      value.nodeModulesAvailable &&
      value.generatorScriptCorrected &&
      value.testScriptAvailable &&
      value.generatorDependencyAvailable &&
      value.testDependencyAvailable;
    const preflightPassed =
      runtimeReady(preflight.runtime) &&
      preflight.initialByteMatch &&
      preflight.generator.exitCode === 0 &&
      preflight.tests.exitCode === 0 &&
      preflight.finalByteMatch &&
      preflight.repositoryUnchanged;
    const fixturesPassed = caseEvidence.filter(
      (entry) =>
        runtimeReady(entry.runtime) &&
        entry.expectedInitialStateConfirmed &&
        entry.expectedFinalStateReached,
    ).length;
    const viable = preflightPassed && fixturesPassed === 2;
    const immutableAfter = await snapshotImmutableEvidence(root);
    if (immutableBefore !== immutableAfter) {
      throw new Error("Runtime-correction validation modified frozen evidence.");
    }
    const report = runtimeCorrectionReportSchema.parse({
      version: "phase4-v2-runtime-correction-report-v1",
      source: "live-model-free-runtime-correction-validation",
      runtimeContractVersion: "phase4-v2-generator-runtime-v2",
      previousRuntimeVersion: "phase4-v2-generator-runtime-v1",
      scored: false,
      calibrationOutcomesModified: false,
      modelCalls: 0,
      preflightPassed,
      fixturesPassed,
      totalFixtures: 2,
      environmentClassification: viable
        ? "environment-viable-under-corrected-runtime"
        : "environment-floor-persists",
      observedCalibrationFloorPreserved: true,
      workerConfiguration: {
        model: "gpt-5.4-mini",
        reasoningEffort: "low",
        status: "provisional-unchanged-refreeze-required-before-any-calibration",
      },
      immutableEvidenceBeforeSha256: immutableBefore,
      immutableEvidenceAfterSha256: immutableAfter,
    });

    const evidenceRoot = join(root, contract.evidenceRoot);
    const evidence = [
      { name: "command-preflight.json", value: preflight },
      { name: "clean-office-extension.json", value: caseEvidence[0] },
      { name: "contact-url-schema-drift.json", value: caseEvidence[1] },
      { name: "report.json", value: report },
    ];
    await mkdir(evidenceRoot, { recursive: true });
    const files = [];
    for (const entry of evidence) {
      const path = join(evidenceRoot, entry.name);
      const content = `${JSON.stringify(entry.value, null, 2)}\n`;
      await atomicWrite(path, content);
      files.push({ path: relative(root, path), sha256: sha256(content) });
    }
    const manifest = runtimeCorrectionManifestSchema.parse({
      version: "phase4-v2-runtime-correction-manifest-v1",
      files,
    });
    await atomicWrite(
      join(evidenceRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return { contract, preflight, cases: caseEvidence, report, manifest };
  } finally {
    await Promise.all(
      repositories.map((repository) => rm(repository, { recursive: true, force: true })),
    );
    await runtime.cleanup();
  }
}

export async function verifyRuntimeCorrectionValidation(root = process.cwd()) {
  const { contract, contractSha256 } = await loadRuntimeCorrectionContract(root);
  const evidenceRoot = join(root, contract.evidenceRoot);
  const manifestText = await readFile(join(evidenceRoot, "manifest.json"), "utf8");
  const manifest = runtimeCorrectionManifestSchema.parse(JSON.parse(manifestText));
  const parsed = new Map<string, unknown>();
  for (const file of manifest.files) {
    const content = await readFile(join(root, file.path), "utf8");
    if (sha256(content) !== file.sha256) {
      throw new Error(`Runtime-correction evidence hash mismatch: ${file.path}.`);
    }
    if (
      /\/Users\/|\/home\/|\/private\/var\/|MEMOSPROUT_RECOVERY_AUTHORIZATION_ID|CODEX_API_KEY|OPENAI_API_KEY/.test(
        content,
      )
    ) {
      throw new Error(`Runtime-correction evidence sanitation failed: ${file.path}.`);
    }
    parsed.set(file.path, JSON.parse(content));
  }
  const preflight = runtimeCorrectionPreflightEvidenceSchema.parse(
    parsed.get(`${contract.evidenceRoot}/command-preflight.json`),
  );
  const cases = [
    `${contract.evidenceRoot}/clean-office-extension.json`,
    `${contract.evidenceRoot}/contact-url-schema-drift.json`,
  ].map((path) => runtimeCorrectionCaseEvidenceSchema.parse(parsed.get(path)));
  const report = runtimeCorrectionReportSchema.parse(
    parsed.get(`${contract.evidenceRoot}/report.json`),
  );
  if (
    report.immutableEvidenceBeforeSha256 !== report.immutableEvidenceAfterSha256 ||
    report.modelCalls !== 0 ||
    preflight.runtime.codexExecCalls !== 0 ||
    cases.some((entry) => entry.runtime.codexExecCalls !== 0)
  ) {
    throw new Error("Runtime-correction validation altered evidence or used a model path.");
  }
  await Promise.all([
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  return {
    contract,
    contractSha256,
    preflight,
    cases,
    report,
    manifest,
    manifestSha256: sha256(manifestText),
  };
}
