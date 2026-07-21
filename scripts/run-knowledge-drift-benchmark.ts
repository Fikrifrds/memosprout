/**
 * Live knowledge-drift benchmark.
 *
 *   pnpm drift:bench
 *   pnpm drift:bench --semantic-check
 *
 * Needs an LLM in .env: OPENAI_API_KEY, or MEMOSPROUT_LLM_API_KEY plus
 * MEMOSPROUT_LLM_PROVIDER / _BASE_URL / _MODEL for any other endpoint.
 *
 * Writes the full report — every prompt-level answer included — to
 * demo/generated-files/evidence/knowledge-drift/report.json.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";
import { callLLM, resolveProviderConfig } from "@/lib/llm/provider";

import { driftCaseSchema, driftCases } from "@/lib/eval/knowledge-drift/dataset";
import { runKnowledgeDriftBenchmark, type AnswerModel } from "@/lib/eval/knowledge-drift/runner";

try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional; the variables may already be exported.
}

const apiKey = process.env.MEMOSPROUT_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(
    "No API key. Set OPENAI_API_KEY, or MEMOSPROUT_LLM_API_KEY with " +
      "MEMOSPROUT_LLM_PROVIDER/_BASE_URL/_MODEL, in .env.",
  );
  process.exit(1);
}

const llmOptions = {
  provider: process.env.MEMOSPROUT_LLM_PROVIDER ?? "openai",
  baseUrl: process.env.MEMOSPROUT_LLM_BASE_URL,
  apiKey,
  model: process.env.MEMOSPROUT_LLM_MODEL,
};
const llm = resolveProviderConfig(llmOptions);

const semanticCheck = process.argv.includes("--semantic-check");
const cases = driftCases.map((testCase) => driftCaseSchema.parse(testCase));

const answer: AnswerModel = async ({ system, user }) => {
  const response = await callLLM(llm, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  return response.content.trim();
};

const directory = await mkdtemp(join(tmpdir(), "memosprout-drift-"));
const memosprout = new MemoSprout(directory, {
  llm: llmOptions,
  semanticCheck,
});

console.log(
  `Running ${cases.length} cases against ${llm.model}` +
    `${semanticCheck ? " (semantic check on)" : ""}...\n`,
);

let report;
try {
  report = await runKnowledgeDriftBenchmark({
    memosprout,
    answer,
    cases,
    model: llm.model,
    onCaseComplete: (result) => {
      const mark = (passed: boolean) => (passed ? "pass" : "FAIL");
      console.log(
        `  ${result.caseId.padEnd(22)} baseline ${mark(result.baseline.grade.passed)}` +
          `  protected ${mark(result.protected.grade.passed)}` +
          `${result.protected.blocked ? "  [blocked]" : ""}`,
      );
    },
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}

const { drift, control } = report;
const percent = (passed: number, total: number) =>
  total === 0 ? "n/a" : `${((passed / total) * 100).toFixed(0)}% (${passed}/${total})`;

console.log("\nDrift cases (stale snippet, correction available)");
console.log(`  baseline accuracy       ${percent(drift.baselinePassed, report.totals.driftCases)}`);
console.log(
  `  protected, context only ${percent(drift.protectedPassedBeforeGate, report.totals.driftCases)}`,
);
console.log(
  `  protected, with gate    ${percent(drift.protectedPassed, report.totals.driftCases)}`,
);
console.log(`  lift                    ${drift.liftPoints >= 0 ? "+" : ""}${drift.liftPoints} points`);
console.log(`  retrieval recall        ${(drift.retrievalRecall * 100).toFixed(0)}%`);
console.log(`  retrieval precision     ${(drift.retrievalPrecision * 100).toFixed(0)}%`);

console.log("\nControl cases (current snippet, no correction applies)");
console.log(
  `  baseline accuracy       ${percent(control.baselinePassed, report.totals.controlCases)}`,
);
console.log(
  `  protected accuracy      ${percent(control.protectedPassed, report.totals.controlCases)}`,
);
console.log(`  false blocks            ${control.falseBlocks}`);

console.log(
  `\nHarmful blocks (model was right, gate overwrote it): ` +
    `${report.harmfulBlocks.length === 0 ? "none" : report.harmfulBlocks.join(", ")}`,
);
console.log(
  `Regressions (baseline right, protected wrong): ` +
    `${report.regressions.length === 0 ? "none" : report.regressions.join(", ")}`,
);

const outputDirectory = join("demo", "generated-files", "evidence", "knowledge-drift");
await mkdir(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, "report.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\nFull report: ${outputPath}`);
