import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isolatedRuntimeEnvironmentAllowlist,
  materializeIsolatedCodexRuntime,
} from "@/lib/eval/v2/isolated-runtime";

describe("Phase 4 v2 isolated Codex runtime", () => {
  it("copies only dynamically resolved authentication and excludes global state", async () => {
    const source = await mkdtemp(join(tmpdir(), "memosprout-source-codex-home-"));
    await Promise.all([
      writeFile(join(source, "auth.json"), '{"test":"credential-placeholder"}\n', "utf8"),
      writeFile(join(source, "config.toml"), 'model = "unrelated"\n', "utf8"),
      writeFile(join(source, "AGENTS.md"), "Global instruction must not load.\n", "utf8"),
      mkdir(join(source, "skills")),
      mkdir(join(source, "plugins")),
    ]);
    const runtime = await materializeIsolatedCodexRuntime({
      sourceCodexHome: source,
      environment: {
        PATH: process.env.PATH,
        CODEX_API_KEY: "unused-environment-placeholder",
        UNRELATED_SECRET: "must-not-be-copied",
      },
    });
    try {
      expect(runtime.authenticationMode).toBe("auth-file");
      expect(await readdir(runtime.codexHome)).toEqual(["auth.json"]);
      expect(await readFile(join(runtime.codexHome, "auth.json"), "utf8")).toContain(
        "credential-placeholder",
      );
      expect(runtime.environment.UNRELATED_SECRET).toBeUndefined();
      expect(runtime.environment.CODEX_API_KEY).toBeUndefined();
      expect(Object.keys(runtime.environment).every((key) =>
        isolatedRuntimeEnvironmentAllowlist.includes(
          key as (typeof isolatedRuntimeEnvironmentAllowlist)[number],
        ),
      )).toBe(true);
    } finally {
      await Promise.all([runtime.cleanup(), rm(source, { recursive: true, force: true })]);
    }
  });

  it("supports a minimum environment credential without copying other values", async () => {
    const emptySource = await mkdtemp(join(tmpdir(), "memosprout-empty-codex-home-"));
    const runtime = await materializeIsolatedCodexRuntime({
      sourceCodexHome: emptySource,
      environment: {
        PATH: process.env.PATH,
        CODEX_API_KEY: "environment-placeholder",
        OPENAI_API_KEY: "must-not-be-copied",
      },
    });
    try {
      expect(runtime.authenticationMode).toBe("environment");
      expect(await readdir(runtime.codexHome)).toEqual([]);
      expect(runtime.environment.CODEX_API_KEY).toBe("environment-placeholder");
      expect(runtime.environment.OPENAI_API_KEY).toBeUndefined();
    } finally {
      await Promise.all([runtime.cleanup(), rm(emptySource, { recursive: true, force: true })]);
    }
  });
});
