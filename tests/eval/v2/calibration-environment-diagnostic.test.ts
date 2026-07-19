import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { evaluateGeneratedFilesEvidence } from "@/lib/eval/oracle";
import {
  buildCalibrationDiagnosticSandboxArguments,
  calibrationEnvironmentDiagnosticContractPath,
  calibrationEnvironmentDiagnosticContractSchema,
  calibrationEnvironmentPreflightEvidenceSchema,
  calibrationRuntimeCorrectionDesignPath,
  calibrationRuntimeCorrectionDesignSchema,
} from "@/lib/eval/v2/calibration-environment-diagnostic";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
} from "@/lib/eval/v2/calibration-recovery";
import { assertPhase4V2Design, sha256 } from "@/lib/eval/v2/design";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Phase 4 v2 calibration-environment diagnostic", () => {
  it("uses only the no-model Codex sandbox execution boundary", () => {
    const args = buildCalibrationDiagnosticSandboxArguments({
      repositoryRoot: "/temporary-repository",
      executable: "pnpm",
      args: ["run", "generate:api"],
    });
    expect(args[0]).toBe("sandbox");
    expect(args).not.toContain("exec");
    expect(args.slice(1, 3)).toEqual(["-P", ":workspace"]);
  });

  it("imports and reuses the exact calibration repository materializer", async () => {
    const source = await readFile(
      "lib/eval/v2/calibration-environment-diagnostic.ts",
      "utf8",
    );
    const contract = calibrationEnvironmentDiagnosticContractSchema.parse(
      JSON.parse(await readFile(calibrationEnvironmentDiagnosticContractPath, "utf8")),
    );
    expect(source).toContain("materializeRecoveryRepository");
    expect(contract.runtime).toMatchObject({
      materializerExport: "materializeRecoveryRepository",
      nodeMajor: 24,
      pathPolicy: "validated-process-exec-path-first",
      dependencyCommand: "pnpm install --offline --ignore-scripts",
      permissionProfile: ":workspace",
      sandboxMode: "workspace-write",
    });
  });

  it("records generator and ordinary-test exit codes with failure categories", () => {
    const evidence = calibrationEnvironmentPreflightEvidenceSchema.parse({
      version: "phase4-v2-calibration-environment-preflight-v1",
      scored: false,
      calibrationOutcome: false,
      runtime: {
        materializer: "materializeRecoveryRepository",
        nodeProbe: {
          command: "node -p process.versions.node",
          exitCode: 0,
          failureCategory: null,
          failureDetailCode: null,
        },
        nodeVersion: "24.14.0",
        nodeMajorValid: true,
        pathUsesProcessExecPathFirst: true,
        isolatedAuthenticationCategory: "auth-file",
        dependencyCommand: "pnpm install --offline --ignore-scripts",
        dependencyInstallExitCode: 0,
        nodeModulesAvailable: true,
        generatorScriptAvailable: true,
        testScriptAvailable: true,
        generatorDependencyAvailable: true,
        testDependencyAvailable: true,
        codexSandboxOnly: true,
        codexExecCalls: 0,
        modelProcessSpawnCount: 0,
      },
      initialByteMatch: true,
      generator: {
        command: "pnpm run generate:api",
        exitCode: 1,
        failureCategory: "another-deterministic-infrastructure-cause",
        failureDetailCode: "sandbox-unix-socket-denied",
      },
      tests: {
        command: "pnpm test",
        exitCode: 0,
        failureCategory: null,
        failureDetailCode: null,
      },
      finalByteMatch: false,
      repositoryUnchanged: true,
    });
    expect(evidence.generator.exitCode).toBe(1);
    expect(evidence.tests.exitCode).toBe(0);
  });

  it("performs byte-level validation against the pure renderer", async () => {
    const root = await mkdtemp(join(tmpdir(), "memosprout-diagnostic-oracle-test-"));
    temporaryRoots.push(root);
    await cp("demo/generated-files/template", root, {
      recursive: true,
      filter: (source) => !source.endsWith("/node_modules"),
    });
    expect((await evaluateGeneratedFilesEvidence(root)).passed).toBe(true);
    const clientPath = join(root, "generated", "api-client.ts");
    await writeFile(clientPath, `${await readFile(clientPath, "utf8")} `);
    expect((await evaluateGeneratedFilesEvidence(root)).passed).toBe(false);
  });

  it("cannot alter frozen calibration and recovery evidence", async () => {
    const paths = [
      "demo/generated-files/evidence/v2/calibration/manifest.json",
      "demo/generated-files/evidence/v2/calibration-recovery/v1/manifest.json",
    ];
    const before = await Promise.all(paths.map((path) => readFile(path)));
    await Promise.all([
      assertRecoveryFrozenInputs(),
      assertOriginalCalibrationImmutable(),
    ]);
    const after = await Promise.all(paths.map((path) => readFile(path)));
    expect(after.map(sha256)).toEqual(before.map(sha256));
  });

  it("contains only calibration fixtures and no scored or reserved task content", async () => {
    const [design, contractText, agentInstructions] = await Promise.all([
      assertPhase4V2Design(),
      readFile(calibrationEnvironmentDiagnosticContractPath, "utf8"),
      readFile("AGENTS.md", "utf8"),
    ]);
    const contract = calibrationEnvironmentDiagnosticContractSchema.parse(
      JSON.parse(contractText),
    );
    expect(contract.fixtures.map((fixture) => fixture.calibrationTaskId)).toEqual(
      design.calibration.tasks.map((task) => task.id),
    );
    for (const task of design.corpus.tasks) {
      expect(contractText).not.toContain(task.id);
      expect(contractText).not.toContain(task.requestedField);
    }
    const reservedIdentifier = agentInstructions.match(/Reserve `([^`]+)`/)?.[1];
    expect(reservedIdentifier).toBeTruthy();
    expect(contractText).not.toContain(reservedIdentifier as string);
  });

  it("keeps the runtime correction versioned, model-free, and unauthorized", async () => {
    const design = calibrationRuntimeCorrectionDesignSchema.parse(
      JSON.parse(await readFile(calibrationRuntimeCorrectionDesignPath, "utf8")),
    );
    expect(design).toMatchObject({
      executionAuthorized: false,
      diagnosis: "environment-floor",
      proposedCorrection: {
        currentGeneratorScript: "tsx scripts/generate-client.ts",
        candidateGeneratorScript: "node --import tsx scripts/generate-client.ts",
        generatorImplementationChanged: false,
      },
    });
    expect(design.preservedInputs.workerSelectionDeferred).toBe(true);
  });
});
