import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir, userInfo } from "node:os";
import { dirname, join, relative } from "node:path";

import { z } from "zod";

import {
  didCodexTurnComplete,
  getCodexFinalMessage,
  getCodexThreadId,
  parseCodexJsonl,
  type CodexEvent,
} from "@/lib/codex/jsonl";
import { assertSanitizedEvidence, sanitizeCodexText } from "@/lib/codex/sanitize";
import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";
import { assertPhase4V2Design, phase4V2Paths } from "@/lib/eval/v2/design";
import { assertPhase4V2FrozenInputs } from "@/lib/eval/v2/freeze";
import { materializeIsolatedCodexRuntime } from "@/lib/eval/v2/isolated-runtime";
import {
  compareRepositorySnapshots,
  countPreflightToolEvents,
  extractPreflightTokenUsage,
  phase4V2PreflightManifestSchema,
  phase4V2PreflightOutputSchema,
  phase4V2PreflightProviderSchema,
  phase4V2PreflightRunSchema,
  sha256,
  snapshotRepositoryWorktree,
} from "@/lib/eval/v2/preflight";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "generated-files", "evidence", "v2", "preflight");
const sanitizedCommand =
  "codex exec --ignore-user-config --strict-config --json --sandbox workspace-write " +
  "--ephemeral --model gpt-5.4-mini -c model_reasoning_effort=low " +
  "-c approval_policy=never -c web_search=disabled --disable multi_agent " +
  "--output-schema <preflight-output-schema> -C <temporary-repository> -";

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCommand(options: {
  executable: string;
  args: string[];
  cwd: string;
  environment?: Record<string, string | undefined>;
  stdin?: string;
  timeoutMs?: number;
}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.environment as NodeJS.ProcessEnv | undefined,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? 30_000);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ exitCode: -1, stdout, stderr: `${stderr}\nCodex preflight timed out.` });
      } else {
        resolve({ exitCode: code ?? -1, stdout, stderr });
      }
    });
    child.stdin.end(options.stdin ?? "");
  });
}

async function resolveCodexExecutable(): Promise<string> {
  const result = await runCommand({
    executable: "/bin/zsh",
    args: ["-c", "command -v codex"],
    cwd: root,
    environment: process.env,
  });
  const executable = result.stdout.trim();
  if (result.exitCode !== 0 || !executable.startsWith("/") || !executable.endsWith("/codex")) {
    throw new Error("Codex CLI is unavailable on PATH.");
  }
  return executable;
}

function sanitizeTrace(
  input: string,
  options: { repositoryRoot: string; codexHome: string; executable: string },
): string {
  return sanitizeCodexText(input, { temporaryRepository: options.repositoryRoot })
    .replaceAll(options.codexHome, "[TEMP_CODEX_HOME]")
    .replaceAll(options.executable, "codex");
}

function assertNoSensitiveValues(input: string, temporaryValues: string[]): void {
  assertSanitizedEvidence(input);
  const machineValues = [hostname(), userInfo().username, ...temporaryValues].filter(
    (value) => value.length >= 3,
  );
  if (machineValues.some((value) => input.includes(value))) {
    throw new Error("Preflight evidence contains a machine-specific value.");
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue;
    if (input.includes(value)) {
      throw new Error(`Preflight evidence contains an environment value from ${key}.`);
    }
  }
}

function parseCatalogModel(input: string) {
  const catalogSchema = z.object({
    models: z.array(
      z.object({
        slug: z.string(),
        supported_reasoning_levels: z.array(z.object({ effort: z.string() }).passthrough()),
      }).passthrough(),
    ),
  }).passthrough();
  const catalog = catalogSchema.parse(JSON.parse(input));
  const model = catalog.models.find((candidate) => candidate.slug === "gpt-5.4-mini");
  if (!model || !model.supported_reasoning_levels.some((level) => level.effort === "low")) {
    throw new Error("Frozen worker model or low reasoning is absent from the bundled catalog.");
  }
}

function completedTurnCount(events: CodexEvent[]): number {
  return events.filter((event) => event.type === "turn.completed").length;
}

async function main(): Promise<void> {
  const [design] = await Promise.all([
    assertPhase4V2Design(),
    assertPhase4V2FrozenInputs(),
  ]);
  const preflightText = await readFile(join(root, phase4V2Paths.preflight), "utf8");
  const workerText = await readFile(join(root, phase4V2Paths.workerConfig), "utf8");
  const isolationText = await readFile(join(root, phase4V2Paths.isolation), "utf8");
  const prompt = design.preflight.prompt;
  const forbiddenPromptContent = [
    ...design.corpus.tasks.flatMap((task) => [task.id, task.requestedField, task.instruction]),
    ...design.calibration.tasks.flatMap((task) => [task.id, task.requestedField]),
  ];
  if (forbiddenPromptContent.some((value) => prompt.includes(value))) {
    throw new Error("Frozen preflight prompt exposes evaluation or calibration task content.");
  }

  const executable = await resolveCodexExecutable();
  const runtime = await materializeIsolatedCodexRuntime();
  const repositoryRoot = await mkdtemp(join(tmpdir(), "memosprout-v2-preflight-repo-"));
  try {
    const schemaPath = join(repositoryRoot, ".memosprout", "preflight-output.schema.json");
    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, `${JSON.stringify(phase4V2PreflightProviderSchema, null, 2)}\n`);
    await loadAndAssertCodexOutputSchema(schemaPath);
    for (const [executableName, args] of [
      ["git", ["init", "-q"]],
      ["git", ["add", "."]],
      [
        "git",
        [
          "-c",
          "user.name=MemoSprout Preflight",
          "-c",
          "user.email=preflight@example.invalid",
          "commit",
          "-q",
          "-m",
          "preflight fixture",
        ],
      ],
    ] as const) {
      const result = await runCommand({
        executable: executableName,
        args: [...args],
        cwd: repositoryRoot,
        environment: runtime.environment,
      });
      if (result.exitCode !== 0) throw new Error("Could not create the preflight Git fixture.");
    }
    const initialSnapshot = await snapshotRepositoryWorktree(repositoryRoot);
    const initialStatus = await runCommand({
      executable: "git",
      args: ["status", "--porcelain=v1", "--untracked-files=all"],
      cwd: repositoryRoot,
      environment: runtime.environment,
    });
    if (initialStatus.exitCode !== 0 || initialStatus.stdout.trim()) {
      throw new Error("Preflight repository is not initially clean.");
    }

    const version = await runCommand({
      executable,
      args: ["--version"],
      cwd: repositoryRoot,
      environment: runtime.environment,
    });
    if (version.exitCode !== 0 || version.stdout.trim() !== "codex-cli 0.144.6") {
      throw new Error("Resolved Codex CLI version differs from the frozen worker configuration.");
    }
    const catalog = await runCommand({
      executable,
      args: ["debug", "models", "--bundled"],
      cwd: repositoryRoot,
      environment: runtime.environment,
    });
    if (catalog.exitCode !== 0) throw new Error("Could not inspect the bundled model catalog.");
    parseCatalogModel(catalog.stdout);

    const attempts: Array<{
      attempt: number;
      exitCode: number;
      turnCompleted: boolean;
      tracePath: string;
      traceSha256: string;
      sanitizedTrace: string;
      events: CodexEvent[];
    }> = [];
    let completedOutput: z.infer<typeof phase4V2PreflightOutputSchema> | null = null;
    let completedEvents: CodexEvent[] = [];
    let completedThreadId: string | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await runCommand({
        executable,
        args: [
          "exec",
          "--ignore-user-config",
          "--strict-config",
          "--json",
          "--sandbox",
          "workspace-write",
          "--ephemeral",
          "--model",
          "gpt-5.4-mini",
          "-c",
          "model_reasoning_effort=low",
          "-c",
          "approval_policy=never",
          "-c",
          "web_search=disabled",
          "--disable",
          "multi_agent",
          "--output-schema",
          schemaPath,
          "-C",
          repositoryRoot,
          "-",
        ],
        cwd: repositoryRoot,
        environment: runtime.environment,
        stdin: prompt,
        timeoutMs: design.workerConfig.timeoutMs,
      });
      const parsed = parseCodexJsonl(result.stdout, { allowPartial: result.exitCode !== 0 });
      const turnCompleted = didCodexTurnComplete(parsed.events);
      const sanitizedTrace = sanitizeTrace(result.stdout || result.stderr, {
        repositoryRoot,
        codexHome: runtime.codexHome,
        executable,
      });
      const tracePath = relative(
        root,
        join(evidenceRoot, `attempt-${String(attempt).padStart(2, "0")}.trace.jsonl`),
      );
      attempts.push({
        attempt,
        exitCode: result.exitCode,
        turnCompleted,
        tracePath,
        traceSha256: sha256(sanitizedTrace),
        sanitizedTrace,
        events: parsed.events,
      });
      if (!turnCompleted) {
        if (attempt === 1) continue;
        throw new Error(`Codex preflight failed before a completed turn (exit ${result.exitCode}).`);
      }
      if (result.exitCode !== 0 || completedTurnCount(parsed.events) !== 1) {
        throw new Error(`Codex preflight completed invalidly (exit ${result.exitCode}).`);
      }
      const finalMessage = getCodexFinalMessage(parsed.events);
      const threadId = getCodexThreadId(parsed.events);
      if (!finalMessage || !threadId) throw new Error("Completed preflight omitted output or thread ID.");
      completedOutput = phase4V2PreflightOutputSchema.parse(JSON.parse(finalMessage));
      completedEvents = parsed.events;
      completedThreadId = threadId;
      break;
    }

    if (!completedOutput || !completedThreadId) {
      throw new Error("Preflight did not produce a completed structured turn.");
    }
    const toolEventCount = countPreflightToolEvents(completedEvents);
    if (toolEventCount !== 0) throw new Error("Preflight worker used a repository or execution tool.");

    const finalSnapshot = await snapshotRepositoryWorktree(repositoryRoot);
    const differences = compareRepositorySnapshots(initialSnapshot.files, finalSnapshot.files);
    const finalStatus = await runCommand({
      executable: "git",
      args: ["status", "--porcelain=v1", "--untracked-files=all"],
      cwd: repositoryRoot,
      environment: runtime.environment,
    });
    if (
      initialSnapshot.sha256 !== finalSnapshot.sha256 ||
      differences.created.length > 0 ||
      differences.changed.length > 0 ||
      differences.deleted.length > 0 ||
      finalStatus.exitCode !== 0 ||
      finalStatus.stdout.trim()
    ) {
      throw new Error("Preflight worker changed the temporary repository.");
    }

    const runPath = relative(root, join(evidenceRoot, "preflight-run.json"));
    const run = phase4V2PreflightRunSchema.parse({
      version: "phase4-v2-preflight-evidence-v1",
      source: "live",
      scored: false,
      status: "passed",
      preflightContractSha256: sha256(preflightText),
      workerConfigSha256: sha256(workerText),
      isolatedRuntimeContractSha256: sha256(isolationText),
      cli: { executable: "codex", version: version.stdout.trim(), command: sanitizedCommand },
      worker: {
        requestedModel: "gpt-5.4-mini",
        resolvedModel: "gpt-5.4-mini",
        modelResolutionEvidence: "bundled-catalog-match-and-successful-explicit-model-turn",
        reasoningEffort: "low",
        reasoningAccepted: true,
      },
      authenticationCategory: runtime.authenticationMode,
      attempts: attempts.map((attempt) => ({
        attempt: attempt.attempt,
        exitCode: attempt.exitCode,
        turnCompleted: attempt.turnCompleted,
        tracePath: attempt.tracePath,
        traceSha256: attempt.traceSha256,
      })),
      completedAttempt: attempts.length,
      modelOutcomeRetries: 0,
      infrastructureRetries: attempts.length - 1,
      turn: {
        completed: true,
        completedTurnCount: 1,
        threadId: completedThreadId,
        toolEventCount,
        output: completedOutput,
        tokenUsage: extractPreflightTokenUsage(completedEvents),
      },
      exposure: {
        promptSha256: sha256(prompt),
        repositoryInspectionRequested: false,
        evaluationTaskContentExposed: false,
        calibrationTaskContentExposed: false,
        scoringAnswersExposed: false,
        reservedTaskContentExposed: false,
      },
      repository: {
        initialSnapshotSha256: initialSnapshot.sha256,
        finalSnapshotSha256: finalSnapshot.sha256,
        byteIdentical: true,
        filesCreated: 0,
        filesChanged: 0,
        filesDeleted: 0,
        gitStatusClean: true,
      },
      sensitiveDataScan: {
        passed: true,
        credentialsFound: 0,
        machinePathsFound: 0,
        environmentValuesRecorded: 0,
      },
    });
    const runText = `${JSON.stringify(run, null, 2)}\n`;
    const evidenceValues = [
      runText,
      ...attempts.map((attempt) => attempt.sanitizedTrace),
    ];
    for (const value of evidenceValues) {
      assertNoSensitiveValues(value, [repositoryRoot, runtime.codexHome, executable]);
    }

    const manifest = phase4V2PreflightManifestSchema.parse({
      version: "phase4-v2-preflight-manifest-v1",
      source: "live",
      scored: false,
      files: [
        { path: runPath, sha256: sha256(runText) },
        ...attempts.map((attempt) => ({
          path: attempt.tracePath,
          sha256: attempt.traceSha256,
        })),
      ],
    });
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    assertNoSensitiveValues(manifestText, [repositoryRoot, runtime.codexHome, executable]);

    await mkdir(evidenceRoot, { recursive: true });
    await Promise.all([
      writeFile(join(evidenceRoot, "preflight-run.json"), runText),
      writeFile(join(evidenceRoot, "manifest.json"), manifestText),
      ...attempts.map((attempt) =>
        writeFile(join(root, attempt.tracePath), attempt.sanitizedTrace),
      ),
    ]);
    process.stdout.write(
      `Phase 4 v2 worker preflight passed: ${run.worker.resolvedModel}, ${run.worker.reasoningEffort} reasoning, ${run.attempts.length} attempt(s), repository unchanged.\n`,
    );
  } finally {
    await Promise.all([
      runtime.cleanup(),
      rm(repositoryRoot, { recursive: true, force: true }),
    ]);
  }
}

await main();
