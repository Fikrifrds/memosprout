import { constants } from "node:fs";
import { access, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, relative } from "node:path";

import { z } from "zod";

import { evaluateGeneratedFilesEvidence } from "@/lib/eval/oracle";
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
import { materializeIsolatedCodexRuntime } from "@/lib/eval/v2/isolated-runtime";
import {
  compareRepositorySnapshots,
  snapshotRepositoryWorktree,
} from "@/lib/eval/v2/preflight";

export const calibrationEnvironmentDiagnosticContractPath =
  "demo/generated-files/evaluation/v2/calibration-environment-diagnostic/v2/diagnostic-contract.json";
export const calibrationRuntimeCorrectionDesignPath =
  "demo/generated-files/evaluation/v2/calibration-runtime-correction/v1/design.json";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const failureCategorySchema = z.enum([
  "command-unavailable",
  "package-script-unavailable",
  "dependency-missing",
  "node-modules-missing",
  "network-dependent-installation-unavailable",
  "node-version-mismatch",
  "path-mismatch",
  "generator-implementation-failure",
  "fixture-invalidity",
  "another-deterministic-infrastructure-cause",
]);

export const calibrationEnvironmentDiagnosticContractSchema = z
  .object({
    version: z.enum([
      "phase4-v2-calibration-environment-diagnostic-v1",
      "phase4-v2-calibration-environment-diagnostic-v2",
    ]),
    sourceFloorTag: z.literal("build-week-phase-4-v2-calibration-floor-mini-low"),
    sourceFloorClassification: z.literal("calibration-floor"),
    scored: z.literal(false),
    modelCallsAllowed: z.literal(false),
    calibrationRerunsAllowed: z.literal(false),
    sourceDiagnosticV1: z
      .object({
        manifestSha256: sha256Schema,
        status: z.literal("inconclusive-diagnostic-launcher-profile-missing"),
        preserved: z.literal(true),
      })
      .strict()
      .optional(),
    runtime: z
      .object({
        materializerModule: z.literal("lib/eval/v2/calibration-recovery-live.ts"),
        materializerExport: z.literal("materializeRecoveryRepository"),
        nodeMajor: z.literal(24),
        pathPolicy: z.literal("validated-process-exec-path-first"),
        dependencyCommand: z.literal("pnpm install --offline --ignore-scripts"),
        sandboxCommand: z.literal("codex sandbox"),
        permissionProfile: z.literal(":workspace").optional(),
        sandboxMode: z.literal("workspace-write"),
        networkRequired: z.literal(false),
      })
      .strict(),
    commandPreflight: z
      .object({
        fixture: z.literal("clean"),
        generatorCommand: z.literal("pnpm run generate:api"),
        testCommand: z.literal("pnpm test"),
        mustRunBeforeDiagnosticMutation: z.literal(true),
      })
      .strict(),
    fixtures: z.tuple([
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
        workerSelectionEffect: z.literal("recommend only; never select or freeze"),
      })
      .strict(),
    evidenceRoot: z.enum([
      "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v1",
      "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v2",
    ]),
  })
  .strict()
  .superRefine((contract, context) => {
    if (
      contract.version === "phase4-v2-calibration-environment-diagnostic-v2" &&
      (!contract.sourceDiagnosticV1 || contract.runtime.permissionProfile !== ":workspace")
    ) {
      context.addIssue({
        code: "custom",
        message: "Diagnostic v2 must preserve v1 and use the built-in workspace profile.",
      });
    }
  });

const commandEvidenceSchema = z
  .object({
    command: z.string().min(1),
    exitCode: z.number().int(),
    failureCategory: failureCategorySchema.nullable(),
    failureDetailCode: z.string().regex(/^[a-z0-9-]+$/).nullable(),
  })
  .strict();

const runtimeEvidenceSchema = z
  .object({
    materializer: z.literal("materializeRecoveryRepository"),
    nodeProbe: commandEvidenceSchema,
    nodeVersion: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(),
    nodeMajorValid: z.boolean(),
    pathUsesProcessExecPathFirst: z.literal(true),
    isolatedAuthenticationCategory: z.enum(["auth-file", "environment"]),
    dependencyCommand: z.literal("pnpm install --offline --ignore-scripts"),
    dependencyInstallExitCode: z.number().int(),
    nodeModulesAvailable: z.boolean(),
    generatorScriptAvailable: z.boolean(),
    testScriptAvailable: z.boolean(),
    generatorDependencyAvailable: z.boolean(),
    testDependencyAvailable: z.boolean(),
    codexSandboxOnly: z.literal(true),
    codexExecCalls: z.literal(0),
    modelProcessSpawnCount: z.literal(0),
  })
  .strict();

export const calibrationEnvironmentPreflightEvidenceSchema = z
  .object({
    version: z.enum([
      "phase4-v2-calibration-environment-preflight-v1",
      "phase4-v2-calibration-environment-preflight-v2",
    ]),
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

export const calibrationEnvironmentCaseEvidenceSchema = z
  .object({
    version: z.enum([
      "phase4-v2-calibration-environment-case-v1",
      "phase4-v2-calibration-environment-case-v2",
    ]),
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

export const calibrationEnvironmentReportSchema = z
  .object({
    version: z.enum([
      "phase4-v2-calibration-environment-report-v1",
      "phase4-v2-calibration-environment-report-v2",
    ]),
    source: z.literal("live-model-free-diagnostic"),
    scored: z.literal(false),
    calibrationOutcomesModified: z.literal(false),
    modelCalls: z.literal(0),
    preflightPassed: z.boolean(),
    fixturesPassed: z.number().int().min(0).max(2),
    totalFixtures: z.literal(2),
    diagnosis: z.enum(["environment-viable-genuine-worker-floor", "environment-floor"]),
    observedFloorPreserved: z.literal(true),
    workerRefreezeRequired: z.boolean(),
    recommendedWorkerConfiguration: z
      .object({
        model: z.literal("gpt-5.4-mini"),
        reasoningEffort: z.literal("medium"),
        status: z.literal("recommendation-only-requires-separate-refreeze"),
      })
      .strict()
      .nullable(),
    immutableEvidenceBeforeSha256: sha256Schema,
    immutableEvidenceAfterSha256: sha256Schema,
  })
  .strict();

export const calibrationEnvironmentManifestSchema = z
  .object({
    version: z.enum([
      "phase4-v2-calibration-environment-manifest-v1",
      "phase4-v2-calibration-environment-manifest-v2",
    ]),
    files: z
      .array(z.object({ path: z.string().min(1), sha256: sha256Schema }).strict())
      .length(4),
  })
  .strict();

export const calibrationRuntimeCorrectionDesignSchema = z
  .object({
    version: z.literal("phase4-v2-calibration-runtime-correction-design-v1"),
    sourceDiagnosticManifestSha256: sha256Schema,
    status: z.literal("design-only-execution-unauthorized"),
    executionAuthorized: z.literal(false),
    diagnosis: z.literal("environment-floor"),
    deterministicCause: z
      .object({
        category: z.literal("another-deterministic-infrastructure-cause"),
        code: z.literal("sandbox-unix-socket-denied"),
        affectedCommand: z.literal("pnpm run generate:api"),
        unaffectedCommand: z.literal("pnpm test"),
      })
      .strict(),
    preservedInputs: z
      .object({
        calibrationOutcomes: z.literal(true),
        recoveryEvidence: z.literal(true),
        floorClassification: z.literal(true),
        tasks: z.literal(true),
        thresholds: z.literal(true),
        workerSelectionDeferred: z.literal(true),
      })
      .strict(),
    proposedCorrection: z
      .object({
        scope: z.literal("repository generator launcher only"),
        currentGeneratorScript: z.literal("tsx scripts/generate-client.ts"),
        candidateGeneratorScript: z.literal("node --import tsx scripts/generate-client.ts"),
        generatorImplementationChanged: z.literal(false),
        sandboxModeChanged: z.literal(false),
        dependencySetChanged: z.literal(false),
        testCommandChanged: z.literal(false),
        reason: z.string().min(1),
      })
      .strict(),
    requiredValidationBeforeAnyWorkerSelection: z.array(z.string().min(1)).length(8),
    prohibitedActions: z.array(z.string().min(1)).length(3),
  })
  .strict();

export type DiagnosticContract = z.infer<
  typeof calibrationEnvironmentDiagnosticContractSchema
>;
export type DiagnosticCase = DiagnosticContract["fixtures"][number];
export type DiagnosticCaseEvidence = z.infer<
  typeof calibrationEnvironmentCaseEvidenceSchema
>;

export interface DiagnosticDependencies {
  materialize: typeof materializeRecoveryRepository;
  runSandbox: (options: {
    repositoryRoot: string;
    executable: string;
    args: string[];
    environment: Record<string, string | undefined>;
  }) => Promise<RecoveryCommandResult>;
}

export function buildCalibrationDiagnosticSandboxArguments(options: {
  repositoryRoot: string;
  executable: string;
  args: string[];
}): string[] {
  return [
    "sandbox",
    "-P",
    ":workspace",
    "-C",
    options.repositoryRoot,
    "--",
    options.executable,
    ...options.args,
  ];
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

async function snapshotImmutableEvidence(root: string): Promise<string> {
  const roots = [
    "demo/generated-files/evidence/v2/calibration",
    "demo/generated-files/evidence/v2/calibration-recovery",
    "demo/generated-files/evaluation/v2/calibration.json",
    "demo/generated-files/evaluation/v2/calibration-recovery/v1",
    "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v1",
  ];
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
  for (const path of roots) await visit(path);
  return sha256(`${JSON.stringify(files.sort((a, b) => a.path.localeCompare(b.path)))}\n`);
}

function classifyFailure(
  result: RecoveryCommandResult,
  kind: "node" | "generator" | "tests",
): { failureCategory: z.infer<typeof failureCategorySchema> | null; failureDetailCode: string | null } {
  if (result.exitCode === 0) return { failureCategory: null, failureDetailCode: null };
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (text.includes("missing script") || text.includes("unknown command")) {
    return { failureCategory: "package-script-unavailable", failureDetailCode: "package-script-unavailable" };
  }
  if (text.includes("node_modules") && text.includes("missing")) {
    return { failureCategory: "node-modules-missing", failureDetailCode: "node-modules-missing" };
  }
  if (text.includes("cannot find module") || text.includes("command not found")) {
    return { failureCategory: "dependency-missing", failureDetailCode: "dependency-or-command-missing" };
  }
  if (text.includes("listen eperm") || text.includes("operation not permitted")) {
    return {
      failureCategory: "another-deterministic-infrastructure-cause",
      failureDetailCode: "sandbox-unix-socket-denied",
    };
  }
  if (kind === "node") {
    return { failureCategory: "node-version-mismatch", failureDetailCode: "node-probe-failed" };
  }
  return {
    failureCategory:
      kind === "generator"
        ? "generator-implementation-failure"
        : "another-deterministic-infrastructure-cause",
    failureDetailCode: kind === "generator" ? "generator-command-failed" : "ordinary-tests-failed",
  };
}

function commandEvidence(command: string, result: RecoveryCommandResult, kind: "node" | "generator" | "tests") {
  return commandEvidenceSchema.parse({ command, exitCode: result.exitCode, ...classifyFailure(result, kind) });
}

async function inspectRuntime(options: {
  repositoryRoot: string;
  nodeResult: RecoveryCommandResult;
  authenticationCategory: "auth-file" | "environment";
  dependencyInstall: RecoveryCommandResult;
}) {
  const packageJson = JSON.parse(
    await readFile(join(options.repositoryRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const generatorDependency = join(options.repositoryRoot, "node_modules", ".bin", "tsx");
  const testDependency = join(options.repositoryRoot, "node_modules", ".bin", "vitest");
  const nodeVersion = options.nodeResult.stdout.trim();
  const nodeMajorValid = options.nodeResult.exitCode === 0 && nodeVersion.startsWith("24.");
  return runtimeEvidenceSchema.parse({
    materializer: "materializeRecoveryRepository",
    nodeProbe: commandEvidence("node -p process.versions.node", options.nodeResult, "node"),
    nodeVersion: /^\d+\.\d+\.\d+$/.test(nodeVersion) ? nodeVersion : null,
    nodeMajorValid,
    pathUsesProcessExecPathFirst: true,
    isolatedAuthenticationCategory: options.authenticationCategory,
    dependencyCommand: "pnpm install --offline --ignore-scripts",
    dependencyInstallExitCode: options.dependencyInstall.exitCode,
    nodeModulesAvailable: await pathExists(join(options.repositoryRoot, "node_modules")),
    generatorScriptAvailable: packageJson.scripts?.["generate:api"] === "tsx scripts/generate-client.ts",
    testScriptAvailable: packageJson.scripts?.test === "vitest run",
    generatorDependencyAvailable: await pathExists(generatorDependency),
    testDependencyAvailable: await pathExists(testDependency),
    codexSandboxOnly: true,
    codexExecCalls: 0,
    modelProcessSpawnCount: 0,
  });
}

export async function runCalibrationEnvironmentDiagnostic(options: {
  root?: string;
  dependencies?: DiagnosticDependencies;
}) {
  const root = options.root ?? process.cwd();
  assertRecoveryNode24(process.versions.node);
  const [design, contractText, immutableBefore] = await Promise.all([
    assertPhase4V2Design(root),
    readFile(join(root, calibrationEnvironmentDiagnosticContractPath), "utf8"),
    snapshotImmutableEvidence(root),
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  const contract = calibrationEnvironmentDiagnosticContractSchema.parse(JSON.parse(contractText));
  if (contract.sourceDiagnosticV1) {
    const priorManifest = await readFile(
      join(
        root,
        "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v1/manifest.json",
      ),
    );
    if (sha256(priorManifest) !== contract.sourceDiagnosticV1.manifestSha256) {
      throw new Error("Diagnostic v1 evidence changed before the corrected v2 run.");
    }
  }
  if (await pathExists(join(root, contract.evidenceRoot))) {
    throw new Error("Calibration-environment diagnostic evidence already exists; rerun refused.");
  }
  const calibrationIdentity = design.calibration.tasks.map((task) => ({
    id: task.id,
    requestedField: task.requestedField,
    fixture: task.fixture,
  }));
  const diagnosticIdentity = contract.fixtures.map((fixture) => ({
    id: fixture.calibrationTaskId,
    requestedField: fixture.requestedField,
    fixture: fixture.fixture,
  }));
  if (JSON.stringify(calibrationIdentity) !== JSON.stringify(diagnosticIdentity)) {
    throw new Error("Diagnostic fixtures differ from the frozen calibration taxonomy.");
  }
  const contractTextLower = contractText.toLowerCase();
  for (const task of design.corpus.tasks) {
    if (
      contractTextLower.includes(task.id.toLowerCase()) ||
      contractTextLower.includes(task.requestedField.toLowerCase())
    ) {
      throw new Error("Diagnostic contract exposes scored corpus content.");
    }
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
  const dependencies: DiagnosticDependencies = options.dependencies ?? {
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
    const nodeProbe = async (repositoryRoot: string) =>
      dependencies.runSandbox({
        repositoryRoot,
        executable: process.execPath,
        args: ["-p", "process.versions.node"],
        environment: runtime.environment,
      });
    const generator = async (repositoryRoot: string) =>
      dependencies.runSandbox({
        repositoryRoot,
        executable: pnpmExecutable,
        args: ["run", "generate:api"],
        environment: runtime.environment,
      });
    const tests = async (repositoryRoot: string) =>
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
    });
    repositories.push(preflightRepository.repositoryRoot);
    const preflightBefore = await snapshotRepositoryWorktree(preflightRepository.repositoryRoot);
    const preflightInitialOracle = await evaluateGeneratedFilesEvidence(
      preflightRepository.repositoryRoot,
    );
    const preflightNode = await nodeProbe(preflightRepository.repositoryRoot);
    const preflightRuntime = await inspectRuntime({
      repositoryRoot: preflightRepository.repositoryRoot,
      nodeResult: preflightNode,
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
    const preflight = calibrationEnvironmentPreflightEvidenceSchema.parse({
      version: "phase4-v2-calibration-environment-preflight-v2",
      scored: false,
      calibrationOutcome: false,
      runtime: preflightRuntime,
      initialByteMatch: preflightInitialOracle.passed,
      generator: commandEvidence("pnpm run generate:api", preflightGenerator, "generator"),
      tests: commandEvidence("pnpm test", preflightTests, "tests"),
      finalByteMatch: preflightFinalOracle.passed,
      repositoryUnchanged:
        preflightChanges.created.length === 0 &&
        preflightChanges.changed.length === 0 &&
        preflightChanges.deleted.length === 0,
    });

    const caseEvidence: DiagnosticCaseEvidence[] = [];
    for (const fixture of contract.fixtures) {
      const materialized = await dependencies.materialize({
        root,
        requestedField: fixture.requestedField,
        fixture: fixture.fixture,
        pnpmExecutable,
        environment: runtime.environment,
      });
      repositories.push(materialized.repositoryRoot);
      const initialSnapshot = await snapshotRepositoryWorktree(materialized.repositoryRoot);
      const initialOracle = await evaluateGeneratedFilesEvidence(materialized.repositoryRoot);
      const caseNode = await nodeProbe(materialized.repositoryRoot);
      const caseRuntime = await inspectRuntime({
        repositoryRoot: materialized.repositoryRoot,
        nodeResult: caseNode,
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
      const testResult = await tests(materialized.repositoryRoot);
      const finalOracle = await evaluateGeneratedFilesEvidence(materialized.repositoryRoot);
      const finalSnapshot = await snapshotRepositoryWorktree(materialized.repositoryRoot);
      const changedFiles = compareRepositorySnapshots(initialSnapshot.files, finalSnapshot.files);
      const expectedInitialStateConfirmed =
        initialOracle.passed === fixture.initialByteMatchExpected;
      const expectedFinalStateReached =
        generatorResult.exitCode === 0 && testResult.exitCode === 0 && finalOracle.passed;
      caseEvidence.push(
        calibrationEnvironmentCaseEvidenceSchema.parse({
          version: "phase4-v2-calibration-environment-case-v2",
          scored: false,
          calibrationOutcome: false,
          fixtureId: fixture.id,
          calibrationTaskId: fixture.calibrationTaskId,
          requestedField: fixture.requestedField,
          fixture: fixture.fixture,
          runtime: caseRuntime,
          initialByteMatchExpected: fixture.initialByteMatchExpected,
          initialByteMatchObserved: initialOracle.passed,
          expectedInitialStateConfirmed,
          diagnosticMutation: fixture.diagnosticMutation,
          generator: commandEvidence("pnpm run generate:api", generatorResult, "generator"),
          tests: commandEvidence("pnpm test", testResult, "tests"),
          finalByteMatch: finalOracle.passed,
          expectedFinalStateReached,
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
      value.generatorScriptAvailable &&
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
    const report = calibrationEnvironmentReportSchema.parse({
      version: "phase4-v2-calibration-environment-report-v2",
      source: "live-model-free-diagnostic",
      scored: false,
      calibrationOutcomesModified: false,
      modelCalls: 0,
      preflightPassed,
      fixturesPassed,
      totalFixtures: 2,
      diagnosis: viable
        ? "environment-viable-genuine-worker-floor"
        : "environment-floor",
      observedFloorPreserved: true,
      workerRefreezeRequired: viable,
      recommendedWorkerConfiguration: viable
        ? {
            model: "gpt-5.4-mini",
            reasoningEffort: "medium",
            status: "recommendation-only-requires-separate-refreeze",
          }
        : null,
      immutableEvidenceBeforeSha256: immutableBefore,
      immutableEvidenceAfterSha256: immutableAfter,
    });
    if (immutableBefore !== immutableAfter) {
      throw new Error("Diagnostic modified frozen calibration or recovery evidence.");
    }

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
    const manifest = calibrationEnvironmentManifestSchema.parse({
      version: "phase4-v2-calibration-environment-manifest-v2",
      files,
    });
    await atomicWrite(
      join(evidenceRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return { contract, preflight, cases: caseEvidence, report, manifest };
  } finally {
    await Promise.all(repositories.map((repository) => rm(repository, { recursive: true, force: true })));
    await runtime.cleanup();
  }
}

export async function verifyCalibrationEnvironmentDiagnostic(root = process.cwd()) {
  const contract = calibrationEnvironmentDiagnosticContractSchema.parse(
    JSON.parse(await readFile(join(root, calibrationEnvironmentDiagnosticContractPath), "utf8")),
  );
  if (contract.sourceDiagnosticV1) {
    const priorManifestText = await readFile(
      join(
        root,
        "demo/generated-files/evidence/v2/calibration-environment-diagnostic/v1/manifest.json",
      ),
    );
    if (sha256(priorManifestText) !== contract.sourceDiagnosticV1.manifestSha256) {
      throw new Error("Diagnostic v1 preservation hash failed.");
    }
    const priorManifest = calibrationEnvironmentManifestSchema.parse(
      JSON.parse(priorManifestText.toString("utf8")),
    );
    for (const file of priorManifest.files) {
      if (sha256(await readFile(join(root, file.path))) !== file.sha256) {
        throw new Error(`Diagnostic v1 evidence hash mismatch: ${file.path}.`);
      }
    }
  }
  const evidenceRoot = join(root, contract.evidenceRoot);
  const manifestText = await readFile(join(evidenceRoot, "manifest.json"), "utf8");
  const manifest = calibrationEnvironmentManifestSchema.parse(JSON.parse(manifestText));
  const parsed = new Map<string, unknown>();
  for (const file of manifest.files) {
    const content = await readFile(join(root, file.path), "utf8");
    if (sha256(content) !== file.sha256) throw new Error(`Diagnostic hash mismatch: ${file.path}.`);
    if (/\/Users\/|\/home\/|\/private\/var\/|MEMOSPROUT_RECOVERY_AUTHORIZATION_ID|CODEX_API_KEY|OPENAI_API_KEY/.test(content)) {
      throw new Error(`Diagnostic evidence sanitation failed: ${file.path}.`);
    }
    parsed.set(file.path, JSON.parse(content));
  }
  const preflightPath = `${contract.evidenceRoot}/command-preflight.json`;
  const cleanPath = `${contract.evidenceRoot}/clean-office-extension.json`;
  const driftPath = `${contract.evidenceRoot}/contact-url-schema-drift.json`;
  const reportPath = `${contract.evidenceRoot}/report.json`;
  const preflight = calibrationEnvironmentPreflightEvidenceSchema.parse(parsed.get(preflightPath));
  const cases = [cleanPath, driftPath].map((path) =>
    calibrationEnvironmentCaseEvidenceSchema.parse(parsed.get(path)),
  );
  const report = calibrationEnvironmentReportSchema.parse(parsed.get(reportPath));
  const correction = calibrationRuntimeCorrectionDesignSchema.parse(
    JSON.parse(await readFile(join(root, calibrationRuntimeCorrectionDesignPath), "utf8")),
  );
  if (
    report.immutableEvidenceBeforeSha256 !== report.immutableEvidenceAfterSha256 ||
    report.modelCalls !== 0 ||
    cases.some((entry) => entry.runtime.codexExecCalls !== 0)
  ) {
    throw new Error("Diagnostic altered immutable evidence or used a model execution path.");
  }
  if (correction.sourceDiagnosticManifestSha256 !== sha256(manifestText)) {
    throw new Error("Runtime-correction design is not bound to diagnostic v2 evidence.");
  }
  await Promise.all([
    assertRecoveryFrozenInputs(root),
    assertOriginalCalibrationImmutable(root),
  ]);
  return {
    contract,
    preflight,
    cases,
    report,
    manifest,
    correction,
    manifestSha256: sha256(manifestText),
  };
}
