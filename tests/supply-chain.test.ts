import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Supply-chain guards for the published package.
 *
 * A package installed on someone else's machine is a malware vector, so
 * these properties are asserted in CI rather than trusted to review:
 * no code runs at install time, the dependency surface stays minimal,
 * and nothing but dist/ + metadata is shipped.
 */

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  files?: string[];
  bin?: Record<string, string>;
};

const INSTALL_TIME_HOOKS = [
  "preinstall",
  "install",
  "postinstall",
  "preuninstall",
  "uninstall",
  "postuninstall",
  "prepare",
] as const;

describe("supply chain", () => {
  it("declares no install-time lifecycle scripts", () => {
    // npm runs these automatically on `npm install` — the primary way a
    // compromised package executes code on a user's machine.
    const present = INSTALL_TIME_HOOKS.filter((hook) => pkg.scripts?.[hook]);
    expect(present).toEqual([]);
  });

  it("keeps the runtime dependency surface minimal and pinned", () => {
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    expect(deps).toEqual(["yaml", "zod"]);
    // Exact versions only — no ranges that could pull a compromised patch.
    for (const range of Object.values(pkg.dependencies ?? {})) {
      expect(range).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("publishes only dist/", () => {
    expect(pkg.files).toEqual(["dist"]);
  });

  it("points bin at a built artifact, not source", () => {
    for (const target of Object.values(pkg.bin ?? {})) {
      expect(target.startsWith("./dist/")).toBe(true);
    }
  });
});
