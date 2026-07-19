import { spawn } from "node:child_process";

import { z } from "zod";

import {
  didCodexTurnComplete,
  getCodexFinalMessage,
  getCodexThreadId,
  parseCodexJsonl,
  type CodexEvent,
} from "@/lib/codex/jsonl";
import { sanitizeCodexText } from "@/lib/codex/sanitize";
import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";

export const codexTimeoutMs = 10 * 60 * 1000;

export interface CodexExecutionResult<T> {
  command: string;
  exitCode: number;
  threadId: string;
  events: CodexEvent[];
  stdout: string;
  stderr: string;
  output: T;
}

export class CodexExecutionError extends Error {
  constructor(
    message: string,
    readonly details: {
      exitCode: number;
      stdout: string;
      stderr: string;
      turnCompleted: boolean;
    },
  ) {
    super(message);
    this.name = "CodexExecutionError";
  }
}

export async function runCodexExec<T>(options: {
  executablePath: string;
  repositoryRoot: string;
  prompt: string;
  outputSchemaPath: string;
  outputSchema: z.ZodType<T>;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  model?: string;
  reasoningEffort?: string;
}): Promise<CodexExecutionResult<T>> {
  await loadAndAssertCodexOutputSchema(options.outputSchemaPath);

  const args = [
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    "--ephemeral",
  ];
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.reasoningEffort) {
    args.push("-c", `model_reasoning_effort=${options.reasoningEffort}`);
  }
  args.push("--output-schema", options.outputSchemaPath, "-C", options.repositoryRoot, "-");
  const modelSegment = options.model
    ? `--model ${options.model}${
        options.reasoningEffort ? ` -c model_reasoning_effort=${options.reasoningEffort}` : ""
      } `
    : "";
  const command =
    "codex exec --json --sandbox workspace-write --ephemeral " +
    modelSegment +
    "--output-schema .memosprout/codex-artifact.schema.json " +
    "-C <temporary-repository> -";

  return new Promise((resolve, reject) => {
    const child = spawn(options.executablePath, args, {
      cwd: options.repositoryRoot,
      env: options.environment ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? codexTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error("Codex CLI could not be started.", { cause: error }));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("Codex CLI timed out."));
        return;
      }
      let parsed;
      try {
        parsed = parseCodexJsonl(stdout, { allowPartial: exitCode !== 0 });
      } catch {
        parsed = { events: [], incompleteLine: null };
      }
      const turnCompleted = didCodexTurnComplete(parsed.events);
      if (exitCode !== 0 || !turnCompleted) {
        const sanitizedStdout = sanitizeCodexText(stdout, {
          temporaryRepository: options.repositoryRoot,
        });
        const sanitizedStderr = sanitizeCodexText(stderr, {
          temporaryRepository: options.repositoryRoot,
        });
        const diagnostic = sanitizedStderr
          .trim()
          .split("\n")
          .slice(-8)
          .join("\n");
        reject(
          new CodexExecutionError(
            `Codex CLI did not complete successfully (exit ${exitCode ?? -1}).${diagnostic ? ` ${diagnostic}` : ""}`,
            {
              exitCode: exitCode ?? -1,
              stdout: sanitizedStdout,
              stderr: sanitizedStderr,
              turnCompleted,
            },
          ),
        );
        return;
      }
      const threadId = getCodexThreadId(parsed.events);
      const finalMessage = getCodexFinalMessage(parsed.events);
      if (!threadId || !finalMessage) {
        reject(new Error("Codex CLI output omitted required thread or final-response data."));
        return;
      }
      let output: T;
      try {
        output = options.outputSchema.parse(JSON.parse(finalMessage));
      } catch (error) {
        reject(new Error("Codex final response failed the Zod artifact contract.", { cause: error }));
        return;
      }
      resolve({
        command,
        exitCode: exitCode ?? -1,
        threadId,
        events: parsed.events,
        stdout,
        stderr,
        output,
      });
    });

    child.stdin.end(options.prompt);
  });
}
