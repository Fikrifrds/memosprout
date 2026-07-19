import { describe, expect, it } from "vitest";

import {
  assertConvergenceAuthorization,
  consumeConvergenceAuthorization,
  ConvergenceUnauthorizedError,
  convergenceAuthorizationEnvironmentKey,
  deriveConvergenceAuthorizationId,
} from "@/lib/eval/v3/authorization";

const root = process.cwd();

describe("convergence authorization guard", () => {
  it("consumes and deletes the runtime authorization environment entry", () => {
    const environment: Record<string, string | undefined> = {
      [convergenceAuthorizationEnvironmentKey]: "secret-value",
      OTHER: "kept",
    };
    const consumed = consumeConvergenceAuthorization(environment);
    expect(consumed).toBe("secret-value");
    expect(convergenceAuthorizationEnvironmentKey in environment).toBe(false);
    expect(environment.OTHER).toBe("kept");
  });

  it("derives a stable authorization id from the frozen contract and manifest", async () => {
    const first = await deriveConvergenceAuthorizationId(root);
    const second = await deriveConvergenceAuthorizationId(root);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("rejects absent authorization without revealing the expected id", async () => {
    await expect(assertConvergenceAuthorization({ root, provided: undefined })).rejects.toThrow(
      ConvergenceUnauthorizedError,
    );
  });

  it("rejects an incorrect authorization value", async () => {
    await expect(
      assertConvergenceAuthorization({ root, provided: "not-the-right-id" }),
    ).rejects.toThrow(ConvergenceUnauthorizedError);
  });

  it("accepts the correctly derived authorization value", async () => {
    const expected = await deriveConvergenceAuthorizationId(root);
    await expect(
      assertConvergenceAuthorization({ root, provided: expected }),
    ).resolves.toBeUndefined();
  });
});
