import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { prepareEvaluationRepository } from "@/lib/eval/runner";
import { protectionRunSchema, sha256 } from "@/lib/codex/artifact";
import { phase4V2Paths } from "@/lib/eval/v2/design";

const promotedFilePaths = [
  "AGENTS.md",
  "scripts/check-generated-files.ts",
  "tests/generated-policy.test.ts",
] as const;
const treatmentPaths = new Set<string>(promotedFilePaths);

const allPromotedPaths = [...promotedFilePaths, "package.json"] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function preparePhase4V2Repository(
  condition: "baseline" | "protected",
): Promise<string> {
  const repositoryRoot = await prepareEvaluationRepository(condition);
  await copyFile(
    join(process.cwd(), phase4V2Paths.workerOutputSchema),
    join(repositoryRoot, ".memosprout", "codex-eval-output.schema.json"),
  );
  return repositoryRoot;
}

async function neutralRepositoryHash(repositoryRoot: string): Promise<string> {
  const entries: Array<{ path: string; content: Buffer }> = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", ".memosprout", "node_modules"].includes(entry.name)) continue;
      const absolutePath = join(directory, entry.name);
      const path = relative(repositoryRoot, absolutePath);
      if (treatmentPaths.has(path)) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        let content = await readFile(absolutePath);
        if (path === "package.json") {
          const packageJson = JSON.parse(content.toString("utf8")) as {
            scripts?: Record<string, string>;
          };
          if (packageJson.scripts) delete packageJson.scripts["check:generated"];
          content = Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
        }
        entries.push({ path, content });
      }
    }
  }

  await visit(repositoryRoot);
  const digest = createHash("sha256");
  for (const entry of entries.sort((left, right) => left.path.localeCompare(right.path))) {
    digest.update(entry.path);
    digest.update("\0");
    digest.update(createHash("sha256").update(entry.content).digest("hex"));
    digest.update("\n");
  }
  return digest.digest("hex");
}

async function gitRoot(repositoryRoot: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "--show-toplevel"], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Could not resolve temporary Git root: ${stderr}`));
      else resolve(stdout.trim());
    });
  });
}

export async function assertPhase4V2RepositoryIsolation(): Promise<{
  neutralInitialRepositorySha256: string;
  protectedAgentsMdAvailable: true;
  independentGitRoots: true;
  parentRepositoryInstructionsExcluded: true;
  promotedArtifactHashes: Record<string, string>;
}> {
  const baselineRoot = await preparePhase4V2Repository("baseline");
  const protectedRoot = await preparePhase4V2Repository("protected");
  try {
    const [
      baselineHash,
      protectedHash,
      baselineGitRoot,
      protectedGitRoot,
      baselineRealRoot,
      protectedRealRoot,
      parentRealRoot,
      protectionText,
    ] = await Promise.all([
      neutralRepositoryHash(baselineRoot),
      neutralRepositoryHash(protectedRoot),
      gitRoot(baselineRoot),
      gitRoot(protectedRoot),
      realpath(baselineRoot),
      realpath(protectedRoot),
      realpath(process.cwd()),
      readFile(
        join(process.cwd(), "demo", "generated-files", "evidence", "live", "protection-run.json"),
        "utf8",
      ),
    ]);
    if (baselineHash !== protectedHash) {
      throw new Error("Phase 4 v2 conditions do not share a treatment-neutral initial repository.");
    }
    if (
      (await realpath(baselineGitRoot)) !== baselineRealRoot ||
      (await realpath(protectedGitRoot)) !== protectedRealRoot ||
      baselineGitRoot === protectedGitRoot
    ) {
      throw new Error("Phase 4 v2 trial repositories are not independent Git roots.");
    }
    if (
      !relative(parentRealRoot, baselineRealRoot).startsWith("..") ||
      !relative(parentRealRoot, protectedRealRoot).startsWith("..")
    ) {
      throw new Error("Phase 4 v2 trial repository is nested under the parent repository.");
    }
    const protection = protectionRunSchema.parse(JSON.parse(protectionText));
    for (const path of treatmentPaths) {
      if (await exists(join(baselineRoot, path))) {
        throw new Error(`Baseline repository exposes a promoted treatment artifact: ${path}.`);
      }
      if (!(await exists(join(protectedRoot, path)))) {
        throw new Error(`Protected repository omits a promoted treatment artifact: ${path}.`);
      }
    }
    for (const path of allPromotedPaths) {
      const content = await readFile(join(protectedRoot, path));
      if (sha256(content) !== protection.artifactHashes[path]) {
        throw new Error(`Protected treatment differs from accepted Phase 3 artifact: ${path}.`);
      }
    }
    const [baselinePackage, protectedPackage] = await Promise.all([
      readFile(join(baselineRoot, "package.json"), "utf8").then(JSON.parse),
      readFile(join(protectedRoot, "package.json"), "utf8").then(JSON.parse),
    ]) as Array<{ scripts: Record<string, string> }>;
    if (baselinePackage.scripts["check:generated"] !== undefined) {
      throw new Error("Baseline repository exposes the promoted package command.");
    }
    if (
      protectedPackage.scripts["check:generated"] !==
      "tsx scripts/check-generated-files.ts"
    ) {
      throw new Error("Protected repository omits the accepted package command.");
    }
    delete protectedPackage.scripts["check:generated"];
    if (JSON.stringify(protectedPackage) !== JSON.stringify(baselinePackage)) {
      throw new Error("Protected package mutation exceeds the accepted package command.");
    }
    for (const directory of ["knowledge", "evidence"]) {
      if ((await exists(join(baselineRoot, directory))) || (await exists(join(protectedRoot, directory)))) {
        throw new Error(`Evaluation repository exposes forbidden knowledge: ${directory}.`);
      }
    }
    return {
      neutralInitialRepositorySha256: baselineHash,
      protectedAgentsMdAvailable: true,
      independentGitRoots: true,
      parentRepositoryInstructionsExcluded: true,
      promotedArtifactHashes: protection.artifactHashes,
    };
  } finally {
    await Promise.all([
      rm(baselineRoot, { recursive: true, force: true }),
      rm(protectedRoot, { recursive: true, force: true }),
    ]);
  }
}
