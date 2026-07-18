import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  codexArtifactManifestSchema,
  protectionArtifactPaths,
  protectionRunSchema,
  sha256,
  validateProtectionArtifacts,
} from "@/lib/codex/artifact";
import {
  assertProtectionAcceptance,
  runProtectionAcceptanceSuite,
} from "@/lib/codex/acceptance";
import { CodexExecutionError, runCodexExec } from "@/lib/codex/exec";
import {
  assertSanitizedEvidence,
  sanitizeCodexText,
} from "@/lib/codex/sanitize";
import { candidateSproutSchema } from "@/lib/domain/schemas";
import { parseAndValidateOkf } from "@/lib/okf/validate";

const root = process.cwd();
const templateRoot = join(root, "demo", "generated-files", "template");
const liveEvidenceRoot = join(root, "demo", "generated-files", "evidence", "live");
const seededEvidenceRoot = join(root, "demo", "generated-files", "evidence", "seeded");
const outputSchemaSource = join(
  root,
  "demo",
  "generated-files",
  "schemas",
  "codex-artifact.schema.json",
);

async function main(): Promise<void> {

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

function parseChangedPaths(status: string): string[] {
  return status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .sort();
}

const candidate = candidateSproutSchema.parse(
  JSON.parse(await readFile(join(liveEvidenceRoot, "candidate.json"), "utf8")),
);
const okfMarkdown = await readFile(
  join(liveEvidenceRoot, "generated-files-agent-experience.md"),
  "utf8",
);
parseAndValidateOkf(okfMarkdown);

const promptTemplate = await readFile(
  join(root, "demo", "generated-files", "prompts", "artifact.md"),
  "utf8",
);
const prompt = promptTemplate
  .replace("{{CANDIDATE_JSON}}", JSON.stringify(candidate, null, 2))
  .replace("{{OKF_MARKDOWN}}", okfMarkdown.trim());
if (prompt.includes("{{")) throw new Error("Artifact prompt contains an unresolved placeholder.");

const temporaryRepository = await mkdtemp(join(tmpdir(), "memosprout-protection-"));
await cp(templateRoot, temporaryRepository, { recursive: true });
await writeFile(join(temporaryRepository, ".gitignore"), "node_modules/\n", "utf8");
await mkdir(join(temporaryRepository, ".memosprout"), { recursive: true });
await cp(
  outputSchemaSource,
  join(temporaryRepository, ".memosprout", "codex-artifact.schema.json"),
);
await symlink(join(root, "node_modules"), join(temporaryRepository, "node_modules"));

for (const [command, args] of [
  ["git", ["init", "-q"]],
  ["git", ["config", "user.name", "MemoSprout Evidence"]],
  ["git", ["config", "user.email", "evidence@memosprout.invalid"]],
  ["git", ["add", "."]],
  ["git", ["commit", "-qm", "baseline"]],
] as const) {
  const result = await runCommand(command, [...args], temporaryRepository);
  if (result.exitCode !== 0) throw new Error(`Temporary repository setup failed: ${command}.`);
}

const baselinePackageJson = JSON.parse(
  await readFile(join(temporaryRepository, "package.json"), "utf8"),
) as unknown;
const runtimeEnvironment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
};
const resolvedCodexResult = await runCommand(
  "sh",
  ["-c", "command -v codex"],
  temporaryRepository,
  runtimeEnvironment,
);
const resolvedCodex = resolvedCodexResult.stdout.trim();
if (
  resolvedCodexResult.exitCode !== 0 ||
  resolvedCodex.length === 0 ||
  !resolvedCodex.endsWith("/codex")
) {
  throw new Error("Unable to resolve the Codex CLI executable dynamically.");
}
const cliVersionResult = await runCommand(
  resolvedCodex,
  ["--version"],
  temporaryRepository,
  runtimeEnvironment,
);
if (cliVersionResult.exitCode !== 0) throw new Error("Unable to record Codex CLI version.");
const cliVersion = cliVersionResult.stdout.trim().split("\n").at(-1) ?? "";
const startedAt = new Date().toISOString();
let execution;
try {
  execution = await runCodexExec({
    executablePath: resolvedCodex,
    repositoryRoot: temporaryRepository,
    prompt,
    outputSchemaPath: join(
      temporaryRepository,
      ".memosprout",
      "codex-artifact.schema.json",
    ),
    outputSchema: codexArtifactManifestSchema,
    environment: runtimeEnvironment,
  });
} catch (error) {
  const status = await runCommand(
    "git",
    ["status", "--porcelain"],
    temporaryRepository,
    runtimeEnvironment,
  );
  if (error instanceof CodexExecutionError) {
    process.stderr.write(
      `${JSON.stringify({
        exitCode: error.details.exitCode,
        stdout: error.details.stdout,
        stderr: error.details.stderr,
        turnCompleted: error.details.turnCompleted,
        repositoryFilesChanged: parseChangedPaths(status.stdout).length > 0,
      })}\n`,
    );
  } else {
    process.stderr.write(
      `${JSON.stringify({
        exitCode: -1,
        stdout: "",
        stderr: sanitizeCodexText(error instanceof Error ? error.message : "Unknown Codex failure."),
        turnCompleted: false,
        repositoryFilesChanged: parseChangedPaths(status.stdout).length > 0,
      })}\n`,
    );
  }
  process.exitCode = 1;
  return;
}
const completedAt = new Date().toISOString();

if (execution.output.sourceSproutId !== candidate.id) {
  throw new Error("Codex output references the wrong Candidate Sprout.");
}
const status = await runCommand("git", ["status", "--porcelain"], temporaryRepository);
const changedPaths = parseChangedPaths(status.stdout);
const contents = await validateProtectionArtifacts({
  repositoryRoot: temporaryRepository,
  sourceSproutId: candidate.id,
  baselinePackageJson,
  changedPaths,
});

const acceptance = await runProtectionAcceptanceSuite(temporaryRepository);
assertProtectionAcceptance(acceptance);

await runCommand("git", ["add", "-N", ...protectionArtifactPaths], temporaryRepository);
const diffResult = await runCommand("git", ["diff", "--binary"], temporaryRepository);
if (diffResult.exitCode !== 0 || !diffResult.stdout.trim()) {
  throw new Error("Codex-generated protection patch could not be captured.");
}
const sanitizedTrace = sanitizeCodexText(execution.stdout, { temporaryRepository });
const sanitizedPatch = sanitizeCodexText(diffResult.stdout, { temporaryRepository });
assertSanitizedEvidence(sanitizedTrace);
assertSanitizedEvidence(sanitizedPatch);

for (const path of protectionArtifactPaths) {
  const destination = join(templateRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents[path], "utf8");
}

const artifactHashes = Object.fromEntries(
  protectionArtifactPaths.map((path) => [path, sha256(contents[path])]),
);
const liveRunId = `protection_${execution.threadId.replaceAll("-", "_")}`;
const liveRun = protectionRunSchema.parse({
  id: liveRunId,
  source: "live",
  scenario: "generated-files",
  status: "accepted",
  sourceSproutId: candidate.id,
  provenance: {
    failedAgentRunId: candidate.evidence.failedAgentRunId,
    humanCorrectionId: candidate.evidence.humanCorrectionId,
    correctedOutcomeId: candidate.evidence.correctedOutcomeId,
    deterministicEvidenceId: candidate.evidence.deterministicEvidenceId,
    candidateSproutId: candidate.id,
    okfSha256: sha256(okfMarkdown),
  },
  codex: {
    threadId: execution.threadId,
    cliVersion,
    command: execution.command,
    startedAt,
    completedAt,
  },
  output: execution.output,
  changedPaths,
  patchSha256: sha256(sanitizedPatch),
  artifactHashes,
  acceptance,
  liveSourceRunId: null,
});
const seededRun = protectionRunSchema.parse({
  ...liveRun,
  id: "protection_seeded_generated_files_001",
  source: "seeded",
  codex: {
    ...liveRun.codex,
    threadId: null,
    cliVersion: null,
    command: "seeded replay; no Codex execution",
  },
  liveSourceRunId: liveRun.id,
});

await Promise.all([
  mkdir(liveEvidenceRoot, { recursive: true }),
  mkdir(seededEvidenceRoot, { recursive: true }),
]);
await Promise.all([
  writeFile(join(liveEvidenceRoot, "protection-run.json"), `${JSON.stringify(liveRun, null, 2)}\n`),
  writeFile(join(liveEvidenceRoot, "protection-output.json"), `${JSON.stringify(execution.output, null, 2)}\n`),
  writeFile(join(liveEvidenceRoot, "protection-trace.jsonl"), sanitizedTrace),
  writeFile(join(liveEvidenceRoot, "protection.patch"), sanitizedPatch),
  writeFile(join(seededEvidenceRoot, "protection-run.json"), `${JSON.stringify(seededRun, null, 2)}\n`),
]);

process.stdout.write("Live Codex protection generated, accepted, and recorded.\n");
process.stdout.write(`Thread ID: ${execution.threadId}\n`);
process.stdout.write(`Codex CLI: ${cliVersion}\n`);
process.stdout.write(`Command: ${execution.command}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Phase 3 failure.";
  process.stderr.write(`${sanitizeCodexText(message)}\n`);
  process.exitCode = 1;
});
