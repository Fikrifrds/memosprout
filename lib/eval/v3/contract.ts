import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { loadAndAssertCodexOutputSchema } from "@/lib/codex/output-schema";
import {
  convergenceCaseSchema,
  convergenceConditionSchema,
  convergenceCases,
  frozenConvergenceRubric,
  frozenConvergenceRubricSha256,
} from "@/lib/eval/v3/cases";
import { convergenceEvaluationPaths } from "@/lib/eval/v3/authorization";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const convergenceContractSchema = z
  .object({
    version: z.literal("convergence-experiment-v1"),
    executionAuthorized: z.literal(false),
    scenario: z.literal("idempotency"),
    conditions: z.array(convergenceConditionSchema).length(3),
    caseIds: z.array(convergenceCaseSchema.shape.id).min(1),
    trialsPerCase: z.number().int().positive(),
    worker: z
      .object({
        cheapModel: z.string().min(1),
        cheapReasoningEffort: z.string().min(1).optional(),
        frontierModel: z.string().min(1),
      })
      .strict(),
    rubricSha256: sha256Schema,
    gate: z
      .object({
        minimumSproutLift: z.number(),
        minimumCheapProtectedRate: z.number(),
        maximumFalseBlockRate: z.number(),
      })
      .strict(),
    evidencePath: z.string().min(1),
  })
  .strict();

export type ConvergenceContract = z.infer<typeof convergenceContractSchema>;

export const convergenceFrozenInputsManifestSchema = z
  .object({
    version: z.literal("convergence-frozen-inputs-v1"),
    files: z
      .array(z.object({ path: z.string().min(1), sha256: sha256Schema }).strict())
      .min(1)
      .refine((files) => new Set(files.map((file) => file.path)).size === files.length),
  })
  .strict();

export type ConvergenceFrozenInputsManifest = z.infer<
  typeof convergenceFrozenInputsManifestSchema
>;

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface ConvergenceDesign {
  contract: ConvergenceContract;
  manifest: ConvergenceFrozenInputsManifest;
}

export async function verifyConvergenceDesign(
  root: string = process.cwd(),
  options: { allowExistingEvidence?: boolean } = {},
): Promise<ConvergenceDesign> {
  const contract = convergenceContractSchema.parse(
    JSON.parse(await readFile(join(root, convergenceEvaluationPaths.contract), "utf8")),
  );
  if (contract.executionAuthorized !== false) {
    throw new Error("Frozen convergence contract authorization flag changed unexpectedly.");
  }
  if (contract.rubricSha256 !== frozenConvergenceRubricSha256) {
    throw new Error("Convergence contract rubric hash does not match the frozen rubric.");
  }
  const frozenGate = frozenConvergenceRubric.gate;
  if (
    contract.gate.minimumSproutLift !== frozenGate.minimumSproutLift ||
    contract.gate.minimumCheapProtectedRate !== frozenGate.minimumCheapProtectedRate ||
    contract.gate.maximumFalseBlockRate !== frozenGate.maximumFalseBlockRate
  ) {
    throw new Error("Convergence contract gate does not match the frozen rubric gate.");
  }
  const knownCaseIds = new Set(convergenceCases.map((testCase) => testCase.id));
  for (const caseId of contract.caseIds) {
    if (!knownCaseIds.has(caseId)) {
      throw new Error(`Convergence contract references an unknown case id: ${caseId}.`);
    }
  }

  const manifest = convergenceFrozenInputsManifestSchema.parse(
    JSON.parse(await readFile(join(root, convergenceEvaluationPaths.frozenInputsManifest), "utf8")),
  );
  for (const file of manifest.files) {
    const actual = sha256Hex(await readFile(join(root, file.path)));
    if (actual !== file.sha256) {
      throw new Error(`Frozen input hash mismatch: ${file.path}.`);
    }
  }

  const promptTemplate = await readFile(join(root, convergenceEvaluationPaths.promptTemplate), "utf8");
  if (!promptTemplate.includes("{{TASK}}")) {
    throw new Error("Convergence prompt template is missing the {{TASK}} placeholder.");
  }

  await loadAndAssertCodexOutputSchema(join(root, convergenceEvaluationPaths.workerOutputSchema));

  if (!options.allowExistingEvidence) {
    if (await pathExists(join(root, contract.evidencePath))) {
      throw new Error("Convergence evidence already exists; design verification expects none.");
    }
  }

  return { contract, manifest };
}
