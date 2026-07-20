import { readFile } from "node:fs/promises";
import { join } from "node:path";

import OpenAI from "openai";
import { z } from "zod";

import type { ScenarioOracle, ScenarioOracleResult } from "@/lib/eval/engine/oracle";

export type StructuredCheckOracleResult =
  | { passed: true; reason: "structured-checks-passed"; failures: string[] }
  | { passed: false; reason: "structured-checks-failed"; failures: string[] };

export interface StructuredCheck {
  path: string;
  expected: unknown;
}

function getPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        typeof current === "object" && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface StructuredCheckOracleOptions {
  outputPath: string;
  checks: StructuredCheck[];
}

export class StructuredCheckOracle implements ScenarioOracle {
  readonly id: string;

  constructor(private readonly options: StructuredCheckOracleOptions) {
    this.id = `structured-check:${options.outputPath}`;
  }

  async evaluate(repositoryRoot: string): Promise<StructuredCheckOracleResult> {
    const raw = await readFile(join(repositoryRoot, this.options.outputPath), "utf8");
    const output: unknown = JSON.parse(raw);
    const failures: string[] = [];
    for (const check of this.options.checks) {
      const actual = getPath(output, check.path);
      if (!valuesEqual(actual, check.expected)) {
        failures.push(
          `${check.path}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
    if (failures.length === 0) {
      return { passed: true, reason: "structured-checks-passed", failures };
    }
    return { passed: false, reason: "structured-checks-failed", failures };
  }
}

export interface JudgeTransportRequest {
  output: string;
  rubric: string;
}

export interface Judgment {
  passed: boolean;
  reasoning: string;
}

export interface JudgeTransport {
  judge(request: JudgeTransportRequest): Promise<Judgment>;
}

export type RubricJudgeOracleResult =
  | { passed: true; reason: "rubric-satisfied"; reasoning: string }
  | { passed: false; reason: "rubric-not-satisfied"; reasoning: string };

export interface RubricJudgeOracleOptions {
  outputPath: string;
  rubric: string;
  transport: JudgeTransport;
}

export class RubricJudgeOracle implements ScenarioOracle {
  readonly id: string;

  constructor(private readonly options: RubricJudgeOracleOptions) {
    this.id = `rubric-judge:${options.outputPath}`;
  }

  async evaluate(repositoryRoot: string): Promise<RubricJudgeOracleResult> {
    const output = await readFile(join(repositoryRoot, this.options.outputPath), "utf8");
    const judgment = await this.options.transport.judge({
      output,
      rubric: this.options.rubric,
    });
    if (judgment.passed) {
      return { passed: true, reason: "rubric-satisfied", reasoning: judgment.reasoning };
    }
    return { passed: false, reason: "rubric-not-satisfied", reasoning: judgment.reasoning };
  }
}

const judgmentSchema = z
  .object({
    passed: z.boolean(),
    reasoning: z.string(),
  })
  .strict();

export const judgeModel = "gpt-5.6-sol" as const;
export const judgeTimeoutMs = 60_000;

export function createOpenAIJudgeTransport(apiKey: string): JudgeTransport {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: judgeTimeoutMs });
  return {
    async judge(request) {
      const response = await client.responses.parse({
        model: judgeModel,
        instructions:
          "You are an impartial evaluator. Decide whether the supplied output satisfies the rubric. " +
          "Return only the required structured output.",
        input: JSON.stringify({ rubric: request.rubric, output: request.output }, null, 2),
        store: false,
        text: { format: { type: "json_schema", name: "judgment", strict: true, schema: judgmentSchema } as never },
      });
      const parsed = judgmentSchema.parse(
        (response as unknown as { output_parsed?: unknown }).output_parsed,
      );
      return parsed;
    },
  };
}

export function isScenarioOracle(value: unknown): value is ScenarioOracle {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ScenarioOracle).evaluate === "function"
  );
}

export type AnyOracleResult = ScenarioOracleResult;
