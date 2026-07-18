import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";
import {
  evaluationCases,
  frozenEvaluationRubric,
  frozenRubricSha256,
} from "@/lib/eval/cases";
import {
  readExecutableVersion,
  resolveExecutable,
  runEvaluationCase,
} from "@/lib/eval/runner";

const root = process.cwd();
const evidenceRoot = join(root, "demo", "generated-files", "evidence", "live", "evaluation");
const rubricPath = join(evidenceRoot, "rubric.json");
const promptRoot = join(root, "demo", "generated-files", "prompts");
const schemaPath = join(root, "demo", "generated-files", "schemas", "codex-eval-output.schema.json");

await Promise.all([
  loadAndAssertCodexOutputSchema(schemaPath),
  (async () => {
    const [baseline, protectedPrompt] = await Promise.all([
      readFile(join(promptRoot, "baseline.md"), "utf8"),
      readFile(join(promptRoot, "protected.md"), "utf8"),
    ]);
    if (baseline !== protectedPrompt) {
      throw new Error("Baseline and protected task prompts must be byte-identical.");
    }
  })(),
]);

try {
  await stat(rubricPath);
  throw new Error("Live baseline evidence already exists; model outcomes must not be rerun.");
} catch (error) {
  if (error instanceof Error && error.message.includes("must not be rerun")) throw error;
}

await mkdir(evidenceRoot, { recursive: true });
await writeFile(
  rubricPath,
  `${JSON.stringify({ ...frozenEvaluationRubric, sha256: frozenRubricSha256 }, null, 2)}\n`,
  "utf8",
);

const [codexExecutable, pnpmExecutable] = await Promise.all([
  resolveExecutable("codex"),
  resolveExecutable("pnpm"),
]);
const codexVersion = await readExecutableVersion(codexExecutable);

for (const testCase of evaluationCases) {
  const run = await runEvaluationCase({
    testCase,
    condition: "baseline",
    evidenceDirectory: join(evidenceRoot, "cases"),
    codexExecutable,
    codexVersion,
    pnpmExecutable,
  });
  process.stdout.write(
    `Baseline ${testCase.id}: ${run.outcome.taskSuccess ? "success" : "failure"}; policy violation ${run.outcome.policyViolation}.\n`,
  );
}

process.stdout.write(`Five live baseline cases completed with frozen rubric ${frozenRubricSha256}.\n`);
