import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod";

import { phase4V2Paths, sha256 } from "@/lib/eval/v2/design";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const phase4V1ImmutabilityManifestSchema = z
  .object({
    version: z.literal("phase4-v1-immutability-v2"),
    sourceTag: z.literal("build-week-phase-4-v1-verified-ceiling"),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    roots: z.array(z.string().min(1)).min(1),
    treeSha256: sha256Schema,
  })
  .strict();

export const phase4V2FrozenManifestSchema = z
  .object({
    version: z.literal("phase4-v2-frozen-inputs-v2"),
    status: z.literal("design-only-no-live-execution"),
    executionAuthorized: z.literal(false),
    inputs: z
      .array(z.object({ path: z.string().min(1), sha256: sha256Schema }).strict())
      .length(11)
      .refine((inputs) => new Set(inputs.map((input) => input.path)).size === inputs.length),
    eventualEvidence: z
      .object({
        live: z.literal("demo/generated-files/evidence/v2/live"),
        seeded: z.literal("demo/generated-files/evidence/v2/seeded"),
      })
      .strict(),
    authorizedBaselineCommand: z.literal("pnpm phase4:v2:baseline"),
  })
  .strict();

async function listFiles(root: string, roots: string[]): Promise<string[]> {
  const files: string[] = [];
  async function visit(path: string): Promise<void> {
    const absolutePath = join(root, path);
    const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => null);
    if (entries === null) {
      files.push(path);
      return;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  for (const path of roots) await visit(path);
  return [...new Set(files)].sort();
}

export async function computeImmutableTreeHash(root: string, roots: string[]): Promise<string> {
  const digest = createHash("sha256");
  for (const path of await listFiles(root, roots)) {
    const content = await readFile(join(root, path));
    digest.update(relative(root, join(root, path)));
    digest.update("\0");
    digest.update(sha256(content));
    digest.update("\n");
  }
  return digest.digest("hex");
}

function runGit(root: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Git snapshot inspection failed: ${stderr}`));
      else resolve(Buffer.concat(stdout));
    });
  });
}

export async function computeGitTreeHashAtRef(
  root: string,
  reference: string,
  roots: string[],
): Promise<string> {
  const paths = (
    await runGit(root, ["ls-tree", "-r", "--name-only", reference, "--", ...roots])
  )
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  const digest = createHash("sha256");
  for (const path of paths) {
    const content = await runGit(root, ["show", `${reference}:${path}`]);
    digest.update(path);
    digest.update("\0");
    digest.update(sha256(content));
    digest.update("\n");
  }
  return digest.digest("hex");
}

export async function assertPhase4V1Immutable(root = process.cwd()): Promise<void> {
  const manifest = phase4V1ImmutabilityManifestSchema.parse(
    JSON.parse(await readFile(join(root, phase4V2Paths.v1ImmutabilityManifest), "utf8")),
  );
  const resolvedCommit = (
    await runGit(root, ["rev-list", "-n", "1", manifest.sourceTag])
  ).toString("utf8").trim();
  if (resolvedCommit !== manifest.sourceCommit) {
    throw new Error("Phase 4 v1 source tag does not resolve to the frozen commit.");
  }
  const [tagTree, currentTree] = await Promise.all([
    computeGitTreeHashAtRef(root, manifest.sourceTag, manifest.roots),
    computeImmutableTreeHash(root, manifest.roots),
  ]);
  if (tagTree !== manifest.treeSha256 || currentTree !== manifest.treeSha256) {
    throw new Error("Phase 4 v1 immutable files differ from the frozen ceiling snapshot.");
  }
}

export async function assertPhase4V2FrozenInputs(root = process.cwd()) {
  const manifest = phase4V2FrozenManifestSchema.parse(
    JSON.parse(await readFile(join(root, phase4V2Paths.frozenManifest), "utf8")),
  );
  for (const input of manifest.inputs) {
    const actual = sha256(await readFile(join(root, input.path)));
    if (actual !== input.sha256) throw new Error(`Frozen v2 input changed: ${input.path}.`);
  }
  return manifest;
}
