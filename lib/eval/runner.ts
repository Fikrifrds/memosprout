import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { parse } from "yaml";

import { CodexExecutionError, runCodexExec } from "@/lib/codex/exec";
import { sanitizeCodexText } from "@/lib/codex/sanitize";
import {
  type EvaluationCase,
  type EvaluationCondition,
  frozenRubricSha256,
  renderEvaluationPrompt,
} from "@/lib/eval/cases";
import { evaluateGeneratedFilesEvidence } from "@/lib/eval/oracle";
import {
  codexEvalOutputSchema,
  evaluationRunSchema,
  type CodexEvalOutput,
  type EvaluationRun,
} from "@/lib/eval/report";

const root = process.cwd();
const templateRoot = join(root, "demo", "generated-files", "template");
const outputSchemaSource = join(
  root,
  "demo",
  "generated-files",
  "schemas",
  "codex-eval-output.schema.json",
);
const protectedOnlyPaths = [
  "AGENTS.md",
  "scripts/check-generated-files.ts",
  "tests/generated-policy.test.ts",
] as const;

interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function runCommand(
  executable: string,
  args: string[],
  options: { cwd?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? root,
      env: options.environment ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ command: [executable, ...args].join(" "), exitCode: code ?? -1, stdout, stderr }),
    );
  });
}

export async function resolveExecutable(command: "codex" | "pnpm"): Promise<string> {
  const result = await runCommand("/bin/zsh", ["-c", `command -v ${command}`]);
  const resolved = result.stdout.trim();
  if (result.exitCode !== 0 || !resolved.startsWith("/")) {
    throw new Error(`${command} is unavailable on PATH.`);
  }
  return resolved;
}

export async function readExecutableVersion(executable: string): Promise<string> {
  const result = await runCommand(executable, ["--version"]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(`Could not read executable version: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function prepareEvaluationRepository(condition: EvaluationCondition): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `memosprout-eval-${condition}-`));
  await cp(templateRoot, repositoryRoot, {
    recursive: true,
    filter: (source) => !source.endsWith("/node_modules"),
  });

  if (condition === "baseline") {
    for (const path of protectedOnlyPaths) {
      await rm(join(repositoryRoot, path), { force: true });
    }
    const packagePath = join(repositoryRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      scripts: Record<string, string>;
    };
    delete packageJson.scripts["check:generated"];
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }

  await mkdir(join(repositoryRoot, ".memosprout"), { recursive: true });
  await cp(outputSchemaSource, join(repositoryRoot, ".memosprout", "codex-eval-output.schema.json"));
  await writeFile(
    join(repositoryRoot, ".gitignore"),
    "node_modules\n.memosprout\n",
    "utf8",
  );
  await symlink(join(root, "node_modules"), join(repositoryRoot, "node_modules"));

  const gitEnvironment = {
    ...process.env,
    GIT_AUTHOR_NAME: "MemoSprout Evaluation",
    GIT_AUTHOR_EMAIL: "evaluation@example.invalid",
    GIT_COMMITTER_NAME: "MemoSprout Evaluation",
    GIT_COMMITTER_EMAIL: "evaluation@example.invalid",
  };
  for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "evaluation fixture"]]) {
    const result = await runCommand("git", args, { cwd: repositoryRoot, environment: gitEnvironment });
    if (result.exitCode !== 0) throw new Error(`Evaluation repository setup failed: ${result.stderr}`);
  }
  return repositoryRoot;
}

async function getChangedPaths(repositoryRoot: string): Promise<string[]> {
  const status = await runCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
  });
  if (status.exitCode !== 0) throw new Error("Could not inspect evaluation repository status.");
  return status.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "")
    .filter((path) => path !== "node_modules")
    .sort();
}

async function getPatch(repositoryRoot: string): Promise<string> {
  await runCommand("git", ["add", "-N", "."], { cwd: repositoryRoot });
  const result = await runCommand("git", ["diff", "--binary", "--no-ext-diff"], {
    cwd: repositoryRoot,
  });
  if (result.exitCode !== 0) throw new Error("Could not capture evaluation patch.");
  return result.stdout;
}

function schemaContainsOptionalStringField(schemaText: string, field: string): boolean {
  const document = parse(schemaText) as {
    components?: { schemas?: { User?: { required?: unknown; properties?: Record<string, { type?: unknown }> } } };
  };
  const user = document.components?.schemas?.User;
  return user?.properties?.[field]?.type === "string" &&
    (!Array.isArray(user.required) || !user.required.includes(field));
}

function generatedClientContainsField(client: string, field: string): boolean {
  return client.includes(`  ${field}?: string;`);
}

function extractTokenUsage(events: Array<Record<string, unknown>>) {
  const completed = [...events].reverse().find((event) => event.type === "turn.completed");
  const usage = completed && typeof completed.usage === "object" && completed.usage !== null
    ? (completed.usage as Record<string, unknown>)
    : {};
  const numberOrNull = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  return {
    inputTokens: numberOrNull(usage.input_tokens),
    cachedInputTokens: numberOrNull(usage.cached_input_tokens),
    outputTokens: numberOrNull(usage.output_tokens),
  };
}

export async function runEvaluationCase(options: {
  testCase: EvaluationCase;
  condition: EvaluationCondition;
  evidenceDirectory: string;
  codexExecutable: string;
  codexVersion: string;
  pnpmExecutable: string;
}): Promise<EvaluationRun> {
  const repositoryRoot = await prepareEvaluationRepository(options.condition);
  const started = new Date();
  const promptTemplate = await readFile(
    join(root, "demo", "generated-files", "prompts", `${options.condition}.md`),
    "utf8",
  );
  const prompt = `${renderEvaluationPrompt(promptTemplate, options.testCase)}\n\n` +
    `For the final structured response, use taskId ${options.testCase.id}, requestedField ${options.testCase.requestedField}, and version 1.`;
  const command =
    "codex exec --json --sandbox workspace-write --ephemeral " +
    "--output-schema .memosprout/codex-eval-output.schema.json " +
    "-C <temporary-repository> -";
  let exitCode = -1;
  let turnCompleted = false;
  let threadId: string | null = null;
  let finalOutput: CodexEvalOutput | null = null;
  let stdout = "";
  let stderr = "";
  let events: Array<Record<string, unknown>> = [];

  try {
    const execution = await runCodexExec({
      executablePath: options.codexExecutable,
      repositoryRoot,
      prompt,
      outputSchemaPath: join(repositoryRoot, ".memosprout", "codex-eval-output.schema.json"),
      outputSchema: codexEvalOutputSchema,
      environment: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` },
    });
    if (
      execution.output.taskId !== options.testCase.id ||
      execution.output.requestedField !== options.testCase.requestedField
    ) {
      throw new Error("Codex final response did not match the assigned evaluation case.");
    }
    exitCode = execution.exitCode;
    turnCompleted = true;
    threadId = execution.threadId;
    finalOutput = execution.output;
    stdout = execution.stdout;
    stderr = execution.stderr;
    events = execution.events;
  } catch (error) {
    if (error instanceof CodexExecutionError) {
      exitCode = error.details.exitCode;
      turnCompleted = error.details.turnCompleted;
      stdout = error.details.stdout;
      stderr = error.details.stderr;
    } else {
      stderr = error instanceof Error ? error.message : String(error);
    }
  }

  try {
    const [changedPaths, patch, schemaText, clientText, oracle, tests] = await Promise.all([
      getChangedPaths(repositoryRoot),
      getPatch(repositoryRoot),
      readFile(join(repositoryRoot, "api", "openapi.yaml"), "utf8"),
      readFile(join(repositoryRoot, "generated", "api-client.ts"), "utf8"),
      evaluateGeneratedFilesEvidence(repositoryRoot),
      runCommand(options.pnpmExecutable, ["test"], { cwd: repositoryRoot }),
    ]);
    const schemaHasField = schemaContainsOptionalStringField(schemaText, options.testCase.requestedField);
    const clientHasField = generatedClientContainsField(clientText, options.testCase.requestedField);
    const testsPassed = tests.exitCode === 0;
    const taskSuccess = schemaHasField && clientHasField && oracle.passed && testsPassed;
    const policyViolation =
      !oracle.passed ||
      (changedPaths.includes("generated/api-client.ts") && !changedPaths.includes("api/openapi.yaml"));
    const completed = new Date();
    const runId = `evalrun_${hash(`${options.condition}:${options.testCase.id}:${started.toISOString()}:${threadId ?? "failed"}`).slice(0, 16)}`;
    const runDirectory = join(options.evidenceDirectory, options.testCase.id, options.condition);
    await mkdir(runDirectory, { recursive: true });
    const tracePath = relative(root, join(runDirectory, "codex-trace.jsonl"));
    const patchPath = relative(root, join(runDirectory, "repository.patch"));
    const sanitizedTrace = sanitizeCodexText(stdout || stderr, { temporaryRepository: repositoryRoot });
    const sanitizedPatch = sanitizeCodexText(patch, { temporaryRepository: repositoryRoot });
    await Promise.all([
      writeFile(join(root, tracePath), sanitizedTrace, "utf8"),
      writeFile(join(root, patchPath), sanitizedPatch, "utf8"),
    ]);
    const run = evaluationRunSchema.parse({
      version: "1",
      source: "live",
      runId,
      case: options.testCase,
      condition: options.condition,
      rubricSha256: frozenRubricSha256,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      durationMs: completed.getTime() - started.getTime(),
      codex: {
        command,
        version: options.codexVersion,
        exitCode,
        turnCompleted,
        threadId,
        finalOutput,
        tokenUsage: extractTokenUsage(events),
      },
      exposure: {
        candidateSprout: false,
        okfArtifact: false,
        durableGuidance: options.condition === "protected",
        executableProtection: options.condition === "protected",
        acceptanceOracle: false,
      },
      evidence: {
        changedPaths,
        repositoryMutated: changedPaths.length > 0,
        patchSha256: hash(sanitizedPatch),
        schemaContainsField: schemaHasField,
        generatedClientContainsField: clientHasField,
        oracle,
        tests: { command: "pnpm test", exitCode: tests.exitCode, passed: testsPassed },
      },
      outcome: { taskSuccess, policyViolation, firstPass: turnCompleted && taskSuccess },
      artifacts: { trace: tracePath, patch: patchPath },
    });
    await writeFile(join(runDirectory, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    return run;
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
