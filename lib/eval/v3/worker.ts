import { z } from "zod";

import { CodexExecutionError, runCodexExec } from "@/lib/codex/exec";
import type { CodexEvent } from "@/lib/codex/jsonl";
import { convergenceCaseSchema } from "@/lib/eval/v3/cases";

export const convergenceWorkerOutputSchema = z
  .object({
    version: z.literal("1"),
    taskId: convergenceCaseSchema.shape.id,
    summary: z.string().min(1),
    commandsRun: z.array(z.string().min(1)),
  })
  .strict();

export type ConvergenceWorkerOutput = z.infer<typeof convergenceWorkerOutputSchema>;

/**
 * The same shape with an unconstrained task id, for scenarios outside the convergence
 * experiment that reuse the worker adapter.
 */
export interface WorkerOutput {
  version: "1";
  taskId: string;
  summary: string;
  commandsRun: string[];
}

export interface WorkerTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface WorkerTurnEvidence {
  command: string;
  exitCode: number;
  turnCompleted: boolean;
  threadId: string | null;
  events: CodexEvent[];
  stdout: string;
  stderr: string;
  finalOutput: WorkerOutput | null;
  usage?: WorkerTokenUsage | null;
}

export interface WorkerTurnOptions {
  repositoryRoot: string;
  prompt: string;
  outputSchemaPath: string;
}

export interface WorkerAdapter {
  readonly id: string;
  readonly model: string;
  runTurn(options: WorkerTurnOptions): Promise<WorkerTurnEvidence>;
}

export interface CodexWorkerAdapterOptions {
  executablePath: string;
  model: string;
  reasoningEffort?: string;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export class CodexWorkerAdapter implements WorkerAdapter {
  readonly id: string;
  readonly model: string;

  constructor(private readonly options: CodexWorkerAdapterOptions) {
    this.model = options.model;
    this.id = `codex:${options.model}`;
  }

  async runTurn(options: WorkerTurnOptions): Promise<WorkerTurnEvidence> {
    try {
      const execution = await runCodexExec({
        executablePath: this.options.executablePath,
        repositoryRoot: options.repositoryRoot,
        prompt: options.prompt,
        outputSchemaPath: options.outputSchemaPath,
        outputSchema: convergenceWorkerOutputSchema,
        environment: this.options.environment,
        timeoutMs: this.options.timeoutMs,
        model: this.options.model,
        reasoningEffort: this.options.reasoningEffort,
      });
      return {
        command: execution.command,
        exitCode: execution.exitCode,
        turnCompleted: true,
        threadId: execution.threadId,
        events: execution.events,
        stdout: execution.stdout,
        stderr: execution.stderr,
        finalOutput: execution.output,
      };
    } catch (error) {
      if (error instanceof CodexExecutionError) {
        return {
          command: "codex exec (failed before completion)",
          exitCode: error.details.exitCode,
          turnCompleted: error.details.turnCompleted,
          threadId: null,
          events: [],
          stdout: error.details.stdout,
          stderr: error.details.stderr,
          finalOutput: null,
        };
      }
      throw error;
    }
  }
}

export class MockWorkerAdapter implements WorkerAdapter {
  readonly id: string;
  readonly model: string;

  constructor(
    model: string,
    private readonly evidence: WorkerTurnEvidence,
  ) {
    this.model = model;
    this.id = `mock:${model}`;
  }

  async runTurn(): Promise<WorkerTurnEvidence> {
    return this.evidence;
  }
}
