import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import OpenAI from "openai";
import { z } from "zod";

import {
  convergenceWorkerOutputSchema,
  type ConvergenceWorkerOutput,
  type WorkerAdapter,
  type WorkerTurnEvidence,
  type WorkerTurnOptions,
} from "@/lib/eval/v3/worker";

export const frontierTimeoutMs = 5 * 60 * 1000;
export const frontierCommandTimeoutMs = 2 * 60 * 1000;
export const frontierMaxTurns = 12;

export type FrontierWorkerErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "timeout"
  | "turn_limit"
  | "malformed_output"
  | "tool_error"
  | "api_error";

const safeErrorMessages: Record<FrontierWorkerErrorCode, string> = {
  missing_credentials:
    "Live frontier execution requires an OPENAI_API_KEY environment variable (separate API billing).",
  invalid_credentials:
    "OpenAI rejected the configured credentials for frontier execution. Verify API access without exposing the key.",
  timeout: "The live frontier worker request timed out.",
  turn_limit: "The frontier worker exceeded the maximum number of tool-loop turns.",
  malformed_output: "The frontier worker returned output that did not satisfy the worker schema.",
  tool_error: "The frontier worker issued an invalid tool call.",
  api_error: "The live frontier worker request failed.",
};

export class FrontierWorkerError extends Error {
  readonly code: FrontierWorkerErrorCode;

  constructor(code: FrontierWorkerErrorCode, options?: ErrorOptions) {
    super(safeErrorMessages[code], options);
    this.name = "FrontierWorkerError";
    this.code = code;
  }
}

export const frontierTools = [
  {
    type: "function",
    name: "read_file",
    description:
      "Read a UTF-8 text file from the repository. The path is relative to the repository root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "write_file",
    description:
      "Write UTF-8 text to a file in the repository, creating or overwriting it. The path is relative to the repository root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "run_command",
    description:
      "Run a shell command in the repository working directory and return stdout, stderr, and exit code. Use this to run the tests.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "submit_result",
    description: "Submit the final structured result once the task is complete.",
    parameters: {
      type: "object",
      properties: {
        version: { type: "string", const: "1" },
        taskId: { type: "string", enum: ["idempotency-implement-handler"] },
        summary: { type: "string" },
        commandsRun: { type: "array", items: { type: "string" } },
      },
      required: ["version", "taskId", "summary", "commandsRun"],
      additionalProperties: false,
    },
  },
] as const;

const frontierFunctionCallSchema = z
  .object({
    type: z.literal("function_call"),
    name: z.string().min(1),
    call_id: z.string().min(1),
    arguments: z.string(),
  })
  .passthrough();

const frontierResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    status: z.string().min(1),
    output: z.array(z.object({ type: z.string() }).passthrough()),
  })
  .passthrough();

export interface FrontierTransportRequest {
  model: string;
  instructions: string;
  input: Array<Record<string, unknown>>;
  tools: ReadonlyArray<Record<string, unknown>>;
}

export interface FrontierTransport {
  create(request: FrontierTransportRequest): Promise<unknown>;
}

export function createOpenAIFrontierTransport(options: {
  apiKey: string;
  timeoutMs?: number;
}): FrontierTransport {
  const client = new OpenAI({
    apiKey: options.apiKey,
    maxRetries: 1,
    timeout: options.timeoutMs ?? frontierTimeoutMs,
  });
  return {
    async create(request) {
      return client.responses.create({
        model: request.model,
        instructions: request.instructions,
        input: request.input as never,
        tools: request.tools as never,
        store: false,
      });
    },
  };
}

function resolveContainedPath(repositoryRoot: string, requestedPath: string): string {
  const normalizedRoot = resolve(repositoryRoot);
  const resolved = resolve(normalizedRoot, requestedPath);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + sep)) {
    throw new FrontierWorkerError("tool_error", {
      cause: new Error(`Path escapes the repository root: ${requestedPath}`),
    });
  }
  return resolved;
}

interface CommandExecution {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

const secretKeyPattern =
  /KEY|SECRET|TOKEN|PASSWORD|PASSWD|AUTHORIZATION|CREDENTIAL/i;

export function minimalCommandEnvironment(
  source: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (secretKeyPattern.test(key)) continue;
    environment[key] = value;
  }
  return environment;
}

const allowedCommandPatterns = [
  /^pnpm test( .*)?$/,
  /^pnpm run test( .*)?$/,
  /^pnpm exec vitest( .*)?$/,
  /^pnpm exec tsx( .*)?$/,
  /^pnpm vitest( .*)?$/,
  /^npm test( .*)?$/,
  /^npm run test( .*)?$/,
  /^npx vitest( .*)?$/,
  /^\.\/node_modules\/\.bin\/vitest( .*)?$/,
  /^vitest( .*)?$/,
  /^node( .*)?$/,
  /^tsx( .*)?$/,
];

const forbiddenCommandFragments = [
  "&&",
  "||",
  ";",
  "|",
  "`",
  "$(",
  ">",
  "<",
  "\n",
  "\r",
];

export function assertAllowedCommand(command: string): void {
  const trimmed = command.trim();
  if (forbiddenCommandFragments.some((fragment) => trimmed.includes(fragment))) {
    throw new FrontierWorkerError("tool_error", {
      cause: new Error("Command chaining and redirection are not allowed."),
    });
  }
  if (!allowedCommandPatterns.some((pattern) => pattern.test(trimmed))) {
    throw new FrontierWorkerError("tool_error", {
      cause: new Error(`Command is not in the allowlist: ${trimmed}`),
    });
  }
}

function runRepositoryCommand(
  repositoryRoot: string,
  command: string,
  timeoutMs: number,
): Promise<CommandExecution> {
  assertAllowedCommand(command);
  return new Promise((resolvePromise) => {
    const child = spawn("/bin/zsh", ["-c", command], {
      cwd: repositoryRoot,
      env: minimalCommandEnvironment() as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ command, exitCode: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ command, exitCode: code ?? -1, stdout, stderr });
    });
  });
}

export interface FrontierWorkerOptions {
  model: string;
  instructions?: string;
  transport?: FrontierTransport;
  apiKey?: string;
  maxTurns?: number;
  commandTimeoutMs?: number;
}

const defaultInstructions =
  "You are an autonomous coding agent working inside a single repository. " +
  "Use read_file, write_file, and run_command to complete the task, then call submit_result exactly once. " +
  "Do not modify src/payment-store.ts or src/types.ts.";

export class FrontierApiWorkerAdapter implements WorkerAdapter {
  readonly id: string;
  readonly model: string;

  constructor(private readonly options: FrontierWorkerOptions) {
    this.model = options.model;
    this.id = `frontier-api:${options.model}`;
  }

  async runTurn(turnOptions: WorkerTurnOptions): Promise<WorkerTurnEvidence> {
    const transport =
      this.options.transport ??
      (() => {
        const apiKey = this.options.apiKey?.trim();
        if (!apiKey) throw new FrontierWorkerError("missing_credentials");
        return createOpenAIFrontierTransport({ apiKey });
      })();

    const maxTurns = this.options.maxTurns ?? frontierMaxTurns;
    const commandTimeoutMs = this.options.commandTimeoutMs ?? frontierCommandTimeoutMs;
    const instructions = this.options.instructions ?? defaultInstructions;

    const input: Array<Record<string, unknown>> = [
      { type: "message", role: "user", content: turnOptions.prompt },
    ];
    const traceEvents: Array<Record<string, unknown>> = [];
    const commandExecutions: CommandExecution[] = [];
    let threadId: string | null = null;
    let finalOutput: ConvergenceWorkerOutput | null = null;
    let turnCompleted = false;

    try {
      outer: for (let turn = 0; turn < maxTurns; turn += 1) {
        const raw = await transport.create({
          model: this.model,
          instructions,
          input,
          tools: frontierTools,
        });
        const response = frontierResponseSchema.parse(raw);
        threadId = response.id;
        if (response.status !== "completed") {
          break;
        }
        for (const item of response.output) {
          input.push(item);
        }

        const functionCalls = response.output.flatMap((item) => {
          const parsed = frontierFunctionCallSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
        if (functionCalls.length === 0) {
          turnCompleted = true;
          break;
        }

        for (const call of functionCalls) {
          traceEvents.push({
            type: "function_call",
            name: call.name,
            call_id: call.call_id,
            arguments: call.arguments,
          });

          if (call.name === "submit_result") {
            const parsedOutput = convergenceWorkerOutputSchema.safeParse(
              JSON.parse(call.arguments),
            );
            if (!parsedOutput.success) {
              throw new FrontierWorkerError("malformed_output", { cause: parsedOutput.error });
            }
            finalOutput = parsedOutput.data;
            input.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: "accepted",
            });
            turnCompleted = true;
            break outer;
          }

          const toolResult = await this.executeTool(
            call.name,
            JSON.parse(call.arguments) as Record<string, unknown>,
            turnOptions.repositoryRoot,
            commandTimeoutMs,
            commandExecutions,
          );
          traceEvents.push({ type: "function_call_result", call_id: call.call_id, toolResult });
          input.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(toolResult),
          });
        }
      }

      if (!turnCompleted && finalOutput === null) {
        throw new FrontierWorkerError("turn_limit");
      }

      const trace = traceEvents.map((event) => JSON.stringify(event)).join("\n");
      const combinedStdout = [trace, ...commandExecutions.map((c) => c.stdout)]
        .filter(Boolean)
        .join("\n");
      const combinedStderr = commandExecutions.map((c) => c.stderr).filter(Boolean).join("\n");

      return {
        command: `frontier-api ${this.model} tool-loop`,
        exitCode: finalOutput !== null ? 0 : 1,
        turnCompleted,
        threadId,
        events: [],
        stdout: combinedStdout,
        stderr: combinedStderr,
        finalOutput,
      };
    } catch (error) {
      if (error instanceof FrontierWorkerError) {
        throw error;
      }
      throw classifyFrontierTransportError(error);
    }
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    repositoryRoot: string,
    commandTimeoutMs: number,
    commandExecutions: CommandExecution[],
  ): Promise<unknown> {
    try {
      if (name === "read_file") {
        const path = resolveContainedPath(repositoryRoot, String(args.path ?? ""));
        return { content: await readFile(path, "utf8") };
      }
      if (name === "write_file") {
        const path = resolveContainedPath(repositoryRoot, String(args.path ?? ""));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, String(args.content ?? ""), "utf8");
        return { written: true };
      }
      if (name === "run_command") {
        const execution = await runRepositoryCommand(
          repositoryRoot,
          String(args.command ?? ""),
          commandTimeoutMs,
        );
        commandExecutions.push(execution);
        return {
          exitCode: execution.exitCode,
          stdout: execution.stdout.slice(-8000),
          stderr: execution.stderr.slice(-4000),
        };
      }
      return { error: `Unknown tool: ${name}` };
    } catch (error) {
      const message =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.message
            : String(error);
      return { error: message };
    }
  }
}

function classifyFrontierTransportError(error: unknown): FrontierWorkerError {
  const errorRecord =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const status = errorRecord.status;
  const name = typeof errorRecord.name === "string" ? errorRecord.name : "";

  if (status === 401 || status === 403) {
    return new FrontierWorkerError("invalid_credentials", { cause: error });
  }
  if (name.includes("Timeout") || name === "AbortError") {
    return new FrontierWorkerError("timeout", { cause: error });
  }
  if (error instanceof z.ZodError) {
    return new FrontierWorkerError("malformed_output", { cause: error });
  }
  return new FrontierWorkerError("api_error", { cause: error });
}
