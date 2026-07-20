import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type JudgeTransport,
  RubricJudgeOracle,
  StructuredCheckOracle,
} from "@/lib/eval/engine/oracles";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRepoWithFile(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "memosprout-oracles-"));
  tempDirs.push(dir);
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}

describe("StructuredCheckOracle", () => {
  it("passes when every check matches", async () => {
    const repo = await makeRepoWithFile(
      "output.json",
      JSON.stringify({ resolution: "refunded", category: "billing" }),
    );
    const oracle = new StructuredCheckOracle({
      outputPath: "output.json",
      checks: [
        { path: "resolution", expected: "refunded" },
        { path: "category", expected: "billing" },
      ],
    });
    const result = await oracle.evaluate(repo);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails and reports the mismatched fields", async () => {
    const repo = await makeRepoWithFile(
      "output.json",
      JSON.stringify({ resolution: "escalated", category: "billing" }),
    );
    const oracle = new StructuredCheckOracle({
      outputPath: "output.json",
      checks: [{ path: "resolution", expected: "refunded" }],
    });
    const result = await oracle.evaluate(repo);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toContain("resolution");
  });

  it("resolves nested paths", async () => {
    const repo = await makeRepoWithFile(
      "output.json",
      JSON.stringify({ metadata: { category: "billing" } }),
    );
    const oracle = new StructuredCheckOracle({
      outputPath: "output.json",
      checks: [{ path: "metadata.category", expected: "billing" }],
    });
    expect((await oracle.evaluate(repo)).passed).toBe(true);
  });
});

describe("RubricJudgeOracle", () => {
  function mockTransport(judgment: { passed: boolean; reasoning: string }): JudgeTransport {
    return { async judge() { return judgment; } };
  }

  it("passes when the judge is satisfied", async () => {
    const repo = await makeRepoWithFile("response.txt", "We refunded the order.");
    const oracle = new RubricJudgeOracle({
      outputPath: "response.txt",
      rubric: "The reply must refund the order.",
      transport: mockTransport({ passed: true, reasoning: "Refund issued." }),
    });
    const result = await oracle.evaluate(repo);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe("rubric-satisfied");
  });

  it("fails when the judge is not satisfied", async () => {
    const repo = await makeRepoWithFile("response.txt", "Please try again later.");
    const oracle = new RubricJudgeOracle({
      outputPath: "response.txt",
      rubric: "The reply must refund the order.",
      transport: mockTransport({ passed: false, reasoning: "No refund offered." }),
    });
    const result = await oracle.evaluate(repo);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("rubric-not-satisfied");
  });
});
