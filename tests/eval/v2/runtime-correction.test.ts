import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  applyGeneratorRuntime,
  assertExplicitGeneratorRuntimeVersion,
  correctedGeneratorRuntimeVersion,
  generatorRuntimeVersions,
  historicalGeneratorRuntimeVersion,
  type GeneratorRuntimeVersion,
} from "@/lib/eval/v2/generator-runtime";
import { materializeRecoveryRepository } from "@/lib/eval/v2/calibration-recovery-live";
import { findSuccessfulGeneratorInvocation } from "@/lib/eval/v2/generator-invocation";
import {
  loadRuntimeCorrectionContract,
  runtimeCorrectionContractPath,
  runtimeCorrectionReportSchema,
  verifyRuntimeCorrectionValidation,
} from "@/lib/eval/v2/runtime-correction";
import type { CodexEvent } from "@/lib/codex/jsonl";

describe("Phase 4 v2 generator runtime correction", () => {
  it("preserves the historical launcher and adds the corrected launcher as a new version", () => {
    expect(generatorRuntimeVersions[historicalGeneratorRuntimeVersion]).toBe(
      "tsx scripts/generate-client.ts",
    );
    expect(generatorRuntimeVersions[correctedGeneratorRuntimeVersion]).toBe(
      "node --import tsx scripts/generate-client.ts",
    );
    expect(historicalGeneratorRuntimeVersion).not.toBe(correctedGeneratorRuntimeVersion);
  });

  it("rewrites only the generator script and rejects unexpected baselines", () => {
    const corrected = applyGeneratorRuntime(
      { "generate:api": "tsx scripts/generate-client.ts", test: "vitest run" },
      correctedGeneratorRuntimeVersion,
    );
    expect(corrected).toEqual({
      "generate:api": "node --import tsx scripts/generate-client.ts",
      test: "vitest run",
    });
    expect(() =>
      applyGeneratorRuntime({ "generate:api": "tsx scripts/other.ts" }, correctedGeneratorRuntimeVersion),
    ).toThrow(/historical runtime baseline/);
  });

  it("selects the historical tsx CLI command under runtime v1", () => {
    const scripts = applyGeneratorRuntime(
      { "generate:api": "tsx scripts/generate-client.ts", test: "vitest run" },
      historicalGeneratorRuntimeVersion,
    );
    expect(scripts["generate:api"]).toBe("tsx scripts/generate-client.ts");
  });

  it("rejects a materialization without an explicit runtime version", async () => {
    expect(() => assertExplicitGeneratorRuntimeVersion(undefined)).toThrow(
      /explicit generator runtime version/,
    );
    expect(() => assertExplicitGeneratorRuntimeVersion("phase4-v2-generator-runtime-v3")).toThrow(
      /explicit generator runtime version/,
    );
    await expect(
      materializeRecoveryRepository({
        root: process.cwd(),
        requestedField: "office_extension",
        fixture: "clean",
        pnpmExecutable: "/nonexistent/pnpm",
        environment: {},
        generatorRuntimeVersion: undefined as unknown as GeneratorRuntimeVersion,
      }),
    ).rejects.toThrow(/explicit generator runtime version/);
  });

  it("pins historical calibration, recovery, and diagnostic paths to runtime v1", async () => {
    const recoverySource = await readFile("lib/eval/v2/calibration-recovery-live.ts", "utf8");
    const diagnosticSource = await readFile(
      "lib/eval/v2/calibration-environment-diagnostic.ts",
      "utf8",
    );
    expect(recoverySource).toContain(
      "generatorRuntimeVersion: historicalGeneratorRuntimeVersion",
    );
    expect(recoverySource).not.toContain("?? correctedGeneratorRuntimeVersion");
    expect(
      diagnosticSource.match(/generatorRuntimeVersion: historicalGeneratorRuntimeVersion/g),
    ).toHaveLength(2);
    expect(diagnosticSource).not.toContain("correctedGeneratorRuntimeVersion");
  });

  it("gives baseline and protected conditions byte-identical runtime-v2 corrections", () => {
    const templateScripts = { "generate:api": "tsx scripts/generate-client.ts", test: "vitest run" };
    const baseline = applyGeneratorRuntime({ ...templateScripts }, correctedGeneratorRuntimeVersion);
    const protectedCondition = applyGeneratorRuntime(
      { ...templateScripts },
      correctedGeneratorRuntimeVersion,
    );
    expect(JSON.stringify(baseline)).toBe(JSON.stringify(protectedCondition));
    expect(baseline["generate:api"]).toBe("node --import tsx scripts/generate-client.ts");
  });

  it("freezes a bound contract that changes no worker, task, or sandbox semantics", async () => {
    const { contract } = await loadRuntimeCorrectionContract();
    expect(contract.version).toBe("phase4-v2-generator-runtime-v2");
    expect(contract.previousRuntime.preserved).toBe(true);
    expect(contract.worker).toEqual({
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
      status: "provisional-unchanged-refreeze-required-before-any-calibration",
    });
    expect(contract.correctedRuntime.generatorImplementationChanged).toBe(false);
    expect(contract.correctedRuntime.testCommandChanged).toBe(false);
    expect(contract.correctedRuntime.sandboxModeChanged).toBe(false);
    expect(contract.treatmentNeutralApplication).toMatchObject({
      calibration: true,
      baseline: true,
      protected: true,
      deterministicControls: true,
    });
  });

  it("exposes no scored corpus or reserved held-out content in the contract", async () => {
    const contractText = await readFile(runtimeCorrectionContractPath, "utf8");
    const agentInstructions = await readFile("AGENTS.md", "utf8");
    const reservedIdentifier = agentInstructions.match(/Reserve `([^`]+)`/)?.[1];
    expect(reservedIdentifier).toBeTruthy();
    expect(contractText).not.toContain(reservedIdentifier as string);
  });

  it("keeps the corrected launcher inside the frozen rubric generator semantics", () => {
    const event: CodexEvent = {
      type: "item.completed",
      item: {
        type: "command_execution",
        status: "completed",
        exit_code: 0,
        command: "node --import tsx scripts/generate-client.ts",
      },
    } as unknown as CodexEvent;
    expect(findSuccessfulGeneratorInvocation([event])?.command).toBe(
      "node --import tsx scripts/generate-client.ts",
    );
  });

  it("keeps immutable evidence unchanged and the corrected diagnostic passing all three cases", async () => {
    const result = await verifyRuntimeCorrectionValidation();
    expect(result.report.preflightPassed).toBe(true);
    expect(result.report.fixturesPassed).toBe(2);
    expect(result.report.modelCalls).toBe(0);
    expect(result.report.environmentClassification).toBe(
      "environment-viable-under-corrected-runtime",
    );
    expect(result.report.immutableEvidenceBeforeSha256).toBe(
      result.report.immutableEvidenceAfterSha256,
    );
    expect(result.cases.every((entry) => entry.expectedFinalStateReached)).toBe(true);
  });

  it("requires model-free evidence with zero model calls", () => {
    expect(() =>
      runtimeCorrectionReportSchema.parse({
        version: "phase4-v2-runtime-correction-report-v1",
        source: "live-model-free-runtime-correction-validation",
        runtimeContractVersion: "phase4-v2-generator-runtime-v2",
        previousRuntimeVersion: "phase4-v2-generator-runtime-v1",
        scored: false,
        calibrationOutcomesModified: false,
        modelCalls: 1,
        preflightPassed: true,
        fixturesPassed: 2,
        totalFixtures: 2,
        environmentClassification: "environment-viable-under-corrected-runtime",
        observedCalibrationFloorPreserved: true,
        workerConfiguration: {
          model: "gpt-5.4-mini",
          reasoningEffort: "low",
          status: "provisional-unchanged-refreeze-required-before-any-calibration",
        },
        immutableEvidenceBeforeSha256: "a".repeat(64),
        immutableEvidenceAfterSha256: "a".repeat(64),
      }),
    ).toThrow();
  });
});
