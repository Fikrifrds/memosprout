import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  frozenConvergenceRubric,
  frozenConvergenceRubricSha256,
} from "@/lib/eval/v3/cases";

const root = process.cwd();
const evaluationRoot = join(root, "demo", "idempotency", "evaluation");

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  await mkdir(join(evaluationRoot, "prompts"), { recursive: true });

  const contract = {
    version: "convergence-experiment-v1",
    executionAuthorized: false,
    scenario: "idempotency",
    conditions: ["cheap-baseline", "cheap-protected", "frontier-baseline"],
    caseIds: [...frozenConvergenceRubric.caseIds],
    trialsPerCase: 3,
    worker: {
      cheapModel: "gpt-5.4-mini",
      cheapReasoningEffort: "low",
      frontierModel: "gpt-5.6-sol",
    },
    rubricSha256: frozenConvergenceRubricSha256,
    gate: { ...frozenConvergenceRubric.gate },
    evidencePath: "demo/idempotency/evidence/convergence/live",
  };
  await writeFile(
    join(evaluationRoot, "convergence-contract.json"),
    `${JSON.stringify(contract, null, 2)}\n`,
    "utf8",
  );

  const frozenInputPaths = [
    "demo/idempotency/evaluation/convergence-contract.json",
    "demo/idempotency/evaluation/prompts/task.md",
    "demo/idempotency/schemas/convergence-worker-output.schema.json",
  ];
  const files = await Promise.all(
    frozenInputPaths.map(async (path) => ({
      path,
      sha256: sha256Hex(await readFile(join(root, path))),
    })),
  );
  const manifest = { version: "convergence-frozen-inputs-v1", files };
  await writeFile(
    join(evaluationRoot, "frozen-inputs.manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log("Convergence configuration written.");
  console.log(`rubricSha256: ${frozenConvergenceRubricSha256}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
