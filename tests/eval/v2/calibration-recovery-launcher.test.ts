import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertRecoveryNode24,
  loadAndVerifyRecoveryLauncherAmendment,
  RecoveryNodeVersionError,
  runRecoveryLauncher,
  type RecoveryLauncherPreflightResult,
} from "@/lib/eval/v2/calibration-recovery-launcher";
import {
  assertOriginalCalibrationImmutable,
  assertRecoveryFrozenInputs,
} from "@/lib/eval/v2/calibration-recovery";
import {
  deriveRecoveryQueue,
  deriveRecoveryRuntimeAuthorizationId,
  recoveryRuntimeAuthorizationEnvironmentKey,
} from "@/lib/eval/v2/calibration-recovery-runner";

async function injectedPreflight(): Promise<RecoveryLauncherPreflightResult> {
  return {
    queue: await deriveRecoveryQueue(),
    codexCliVersion: "0.144.6",
    authenticationCategory: "auth-file",
  };
}

describe("Phase 4 v2 calibration-recovery launcher hotfix", () => {
  it("rejects Node 23 before authorization consumption, preflight, or spawn", async () => {
    const authorization = await deriveRecoveryRuntimeAuthorizationId();
    const environment: Record<string, string | undefined> = {
      [recoveryRuntimeAuthorizationEnvironmentKey]: authorization,
    };
    let preflightCount = 0;
    let boundaryCount = 0;
    await expect(
      runRecoveryLauncher({
        environment,
        nodeVersion: "23.3.0",
        preflight: async () => {
          preflightCount += 1;
          return injectedPreflight();
        },
        executeBoundary: async () => {
          boundaryCount += 1;
        },
      }),
    ).rejects.toBeInstanceOf(RecoveryNodeVersionError);
    expect(environment[recoveryRuntimeAuthorizationEnvironmentKey]).toBe(authorization);
    expect(preflightCount).toBe(0);
    expect(boundaryCount).toBe(0);
  });

  it("accepts Node 24 and reaches only an injected execution boundary", async () => {
    const authorization = await deriveRecoveryRuntimeAuthorizationId();
    const environment: Record<string, string | undefined> = {
      [recoveryRuntimeAuthorizationEnvironmentKey]: authorization,
    };
    let boundaryCount = 0;
    const result = await runRecoveryLauncher({
      environment,
      nodeVersion: "24.14.0",
      preflight: injectedPreflight,
      executeBoundary: async (provided) => {
        expect(provided).toBe(authorization);
        boundaryCount += 1;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(boundaryCount).toBe(1);
    expect(environment[recoveryRuntimeAuthorizationEnvironmentKey]).toBeUndefined();
  });

  it.each([
    ["absent", undefined],
    ["incorrect", "not-the-frozen-identifier"],
  ])("maps %s consent to exit 2 with zero boundaries", async (_label, authorization) => {
    let preflightCount = 0;
    let boundaryCount = 0;
    const environment: Record<string, string | undefined> = {};
    if (authorization) environment[recoveryRuntimeAuthorizationEnvironmentKey] = authorization;
    const result = await runRecoveryLauncher({
      environment,
      nodeVersion: "24.14.0",
      preflight: async () => {
        preflightCount += 1;
        return injectedPreflight();
      },
      executeBoundary: async () => {
        boundaryCount += 1;
      },
    });
    expect(result.exitCode).toBe(2);
    expect(preflightCount).toBe(0);
    expect(boundaryCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain(authorization ?? "never-present");
  });

  it("uses a dedicated async entry point without eval or top-level await", async () => {
    const [entry, packageText, liveAdapter] = await Promise.all([
      readFile("scripts/launch-phase4-v2-calibration-recovery-v1.ts", "utf8"),
      readFile("package.json", "utf8"),
      readFile("lib/eval/v2/calibration-recovery-live.ts", "utf8"),
    ]);
    expect(entry).toContain("async function main(): Promise<void>");
    expect(entry).toContain("main().catch((error) => {");
    expect(entry).not.toMatch(/^\s*await\s/m);
    expect(packageText).not.toContain("tsx -e");
    expect(liveAdapter).toContain("dirname(process.execPath)");
    expect(JSON.parse(packageText).scripts["phase4:v2:worker:calibrate:recover-v1"]).toBe(
      "tsx scripts/launch-phase4-v2-calibration-recovery-v1.ts",
    );
  });

  it("derives exactly three eligible trials and excludes the immutable first trial", async () => {
    const queue = await deriveRecoveryQueue();
    expect(queue.map((entry) => `${entry.taskId}:${entry.trialId}`)).toEqual([
      "calibration-add-office-extension:trial-02",
      "calibration-repair-contact-url-drift:trial-01",
      "calibration-repair-contact-url-drift:trial-02",
    ]);
    expect(queue.some((entry) => entry.sequenceIndex === 1)).toBe(false);
  });

  it("validates the amendment hash while frozen contracts and evidence remain unchanged", async () => {
    const [{ amendment, manifest }] = await Promise.all([
      loadAndVerifyRecoveryLauncherAmendment(),
      assertRecoveryFrozenInputs(),
      assertOriginalCalibrationImmutable(),
    ]);
    expect(amendment.aggregate).toMatchObject({
      infrastructureLaunchCount: 2,
      codexProcessCount: 0,
      completedCodexTurnCount: 0,
      modelOutcomeCount: 0,
      calibrationEvidenceFileCount: 0,
    });
    expect(amendment.retryAccounting.futureCorrectedLaunchAuthorized).toBe(false);
    expect(manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      stat("demo/generated-files/evaluation/v2/calibration/recovery/evidence/v1"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(join(".memosprout-local", "calibration-recovery", "v1")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("exposes a clear Node 24 assertion without machine-specific paths", () => {
    expect(() => assertRecoveryNode24("24.14.0")).not.toThrow();
    expect(() => assertRecoveryNode24("23.3.0")).toThrow("Node.js 24.x");
  });
});
