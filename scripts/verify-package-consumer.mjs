/**
 * Offline consumer verification for the exact tarball published to npm.
 *
 * This deliberately does not import repository source files. It builds and
 * packs MemoSprout, extracts the tarball into an isolated node_modules tree,
 * and exercises the package exactly through its declared public entrypoints.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "memosprout-consumer-"));
const packDirectory = path.join(temporaryRoot, "packed");
const consumerDirectory = path.join(temporaryRoot, "consumer");
const consumerNodeModules = path.join(consumerDirectory, "node_modules");
const installedPackageDirectory = path.join(consumerNodeModules, "memosprout");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function report(message) {
  console.log(`✅ ${message}`);
}

function linkDevelopmentDependency(packageName, expectedVersion) {
  const source = path.join(repositoryRoot, "node_modules", ...packageName.split("/"));
  assert.ok(existsSync(source), `${packageName} must be installed before consumer verification`);

  if (expectedVersion) {
    const installedMetadata = JSON.parse(
      readFileSync(path.join(realpathSync(source), "package.json"), "utf8"),
    );
    assert.equal(
      installedMetadata.version,
      expectedVersion,
      `${packageName} must match the version declared by the packed artifact`,
    );
  }

  const destination = path.join(consumerNodeModules, ...packageName.split("/"));
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(realpathSync(source), destination, "dir");
}

function assertPackageTarget(packageJson, fieldName, target) {
  assert.equal(typeof target, "string", `${fieldName} must be a string`);
  assert.ok(target.startsWith("./dist/"), `${fieldName} must resolve inside dist/`);
  assert.ok(
    existsSync(path.join(installedPackageDirectory, target)),
    `${fieldName} target does not exist in the packed artifact: ${target}`,
  );
}

try {
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(consumerNodeModules, { recursive: true });

  run("pnpm", ["build:lib"], { stdio: "inherit" });
  report("library and CLI build completed");

  const npmEnvironment = {
    ...process.env,
    npm_config_audit: "false",
    npm_config_cache: path.join(temporaryRoot, "npm-cache"),
    npm_config_fund: "false",
    npm_config_offline: "true",
    npm_config_update_notifier: "false",
  };
  const packOutput = run(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory, "."],
    { env: npmEnvironment },
  );
  const packResult = JSON.parse(packOutput);
  assert.equal(packResult.length, 1, "npm pack must produce exactly one tarball");
  const tarballPath = path.join(packDirectory, packResult[0].filename);
  assert.ok(existsSync(tarballPath), "npm pack did not create the reported tarball");
  report(`packed artifact created (${packResult[0].filename})`);

  run("tar", ["-xzf", tarballPath, "-C", consumerNodeModules]);
  renameSync(path.join(consumerNodeModules, "package"), installedPackageDirectory);

  const packageJson = JSON.parse(
    readFileSync(path.join(installedPackageDirectory, "package.json"), "utf8"),
  );
  assert.equal(packageJson.name, "memosprout");
  assertPackageTarget(packageJson, "main", packageJson.main);
  assertPackageTarget(packageJson, "module", packageJson.module);
  assertPackageTarget(packageJson, "types", packageJson.types);
  assertPackageTarget(packageJson, "exports.import.types", packageJson.exports?.["."]?.import?.types);
  assertPackageTarget(
    packageJson,
    "exports.import.default",
    packageJson.exports?.["."]?.import?.default,
  );
  assertPackageTarget(
    packageJson,
    "exports.require.types",
    packageJson.exports?.["."]?.require?.types,
  );
  assertPackageTarget(
    packageJson,
    "exports.require.default",
    packageJson.exports?.["."]?.require?.default,
  );
  assertPackageTarget(packageJson, "bin.memosprout", packageJson.bin?.memosprout);
  report("declared exports, types, and CLI targets exist in the tarball");

  for (const [dependencyName, dependencyVersion] of Object.entries(
    packageJson.dependencies ?? {},
  )) {
    linkDevelopmentDependency(dependencyName, dependencyVersion);
  }
  linkDevelopmentDependency("@types/node");

  writeFileSync(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );

  writeFileSync(
    path.join(consumerDirectory, "consume-esm.mjs"),
    `
import assert from "node:assert/strict";
import { MemoSprout, correctionRecordSchema } from "memosprout";

assert.equal(typeof MemoSprout, "function");
assert.equal(typeof correctionRecordSchema.parse, "function");
assert.ok(import.meta.resolve("memosprout").endsWith("/memosprout/dist/index.js"));

const instance = new MemoSprout("esm-corrections");
const saved = await instance.correct({
  domain: "consumer-verification",
  wrong: "the package cannot be imported as ESM",
  correct: "the packed package imports as ESM",
});
assert.equal(saved.correctAnswer, "the packed package imports as ESM");
assert.equal((await instance.list()).length, 1);
`,
  );
  run(process.execPath, ["consume-esm.mjs"], { cwd: consumerDirectory });
  report("ESM import and public API execution succeeded");

  writeFileSync(
    path.join(consumerDirectory, "consume-cjs.cjs"),
    `
const assert = require("node:assert/strict");
const { MemoSprout, correctionRecordSchema } = require("memosprout");

assert.equal(typeof MemoSprout, "function");
assert.equal(typeof correctionRecordSchema.parse, "function");
assert.ok(require.resolve("memosprout").replaceAll("\\\\", "/").endsWith("/memosprout/dist/index.cjs"));
`,
  );
  run(process.execPath, ["consume-cjs.cjs"], { cwd: consumerDirectory });
  report("CommonJS require succeeded through the package export map");

  writeFileSync(
    path.join(consumerDirectory, "consume-esm.mts"),
    `
import { MemoSprout, type CorrectionRecord } from "memosprout";

const instance: MemoSprout = new MemoSprout("typed-esm-corrections");
const record: Promise<CorrectionRecord> = instance.correct({ wrong: "old", correct: "new" });
void record;
`,
  );
  writeFileSync(
    path.join(consumerDirectory, "consume-cjs.cts"),
    `
import MemoSproutPackage = require("memosprout");

const instance: MemoSproutPackage.MemoSprout = new MemoSproutPackage.MemoSprout(
  "typed-cjs-corrections",
);
const record: Promise<MemoSproutPackage.CorrectionRecord> = instance.correct({
  wrong: "old",
  correct: "new",
});
void record;
`,
  );
  run(
    path.join(repositoryRoot, "node_modules", ".bin", "tsc"),
    [
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "consume-esm.mts",
      "consume-cjs.cts",
    ],
    { cwd: consumerDirectory },
  );
  report("ESM and CommonJS TypeScript consumers resolved their declared type entrypoints");

  const cliTarget = path.join(installedPackageDirectory, packageJson.bin.memosprout);
  assert.ok(statSync(cliTarget).mode & 0o111, "packed CLI target must be executable");
  const helpOutput = run(cliTarget, ["--help"], { cwd: consumerDirectory });
  assert.match(helpOutput, /Usage:\s+memosprout init/);
  assert.match(helpOutput, /memosprout check/);

  const initializedDirectory = path.join(consumerDirectory, "cli-corrections");
  const initOutput = run(cliTarget, ["init", initializedDirectory], {
    cwd: consumerDirectory,
  });
  assert.match(initOutput, /Initialized corrections directory:/);
  assert.ok(existsSync(initializedDirectory), "CLI init did not create its target directory");
  report("packed CLI help and basic init execution succeeded");

  console.log("\n✅ Packed-package consumer verification passed offline.");
} catch (error) {
  const details = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`\n❌ Packed-package consumer verification failed.\n${details}`);
  process.exitCode = 1;
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
