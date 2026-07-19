import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const convergenceAuthorizationDomain =
  "memosprout-convergence-runtime-authorization-v1";
export const convergenceAuthorizationEnvironmentKey =
  "MEMOSPROUT_CONVERGENCE_AUTHORIZATION_ID";

export const convergenceEvaluationPaths = {
  contract: "demo/idempotency/evaluation/convergence-contract.json",
  frozenInputsManifest: "demo/idempotency/evaluation/frozen-inputs.manifest.json",
  promptTemplate: "demo/idempotency/evaluation/prompts/task.md",
  workerOutputSchema: "demo/idempotency/schemas/convergence-worker-output.schema.json",
} as const;

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export class ConvergenceUnauthorizedError extends Error {
  constructor() {
    super(
      "Convergence experiment is installed but execution remains unauthorized; no worker process was spawned.",
    );
    this.name = "ConvergenceUnauthorizedError";
  }
}

export async function deriveConvergenceAuthorizationId(
  root: string = process.cwd(),
): Promise<string> {
  const [contract, frozenInputs] = await Promise.all([
    readFile(join(root, convergenceEvaluationPaths.contract)),
    readFile(join(root, convergenceEvaluationPaths.frozenInputsManifest)),
  ]);
  return sha256Hex(
    `${convergenceAuthorizationDomain}\0${sha256Hex(contract)}\0${sha256Hex(frozenInputs)}`,
  );
}

export function consumeConvergenceAuthorization(
  environment: Record<string, string | undefined>,
): string | undefined {
  const authorization = environment[convergenceAuthorizationEnvironmentKey];
  delete environment[convergenceAuthorizationEnvironmentKey];
  return authorization;
}

export async function assertConvergenceAuthorization(options: {
  root: string;
  provided: string | undefined;
}): Promise<void> {
  if (!options.provided) throw new ConvergenceUnauthorizedError();
  const expected = await deriveConvergenceAuthorizationId(options.root);
  const providedDigest = Buffer.from(sha256Hex(options.provided), "hex");
  const expectedDigest = Buffer.from(sha256Hex(expected), "hex");
  if (!timingSafeEqual(providedDigest, expectedDigest)) {
    throw new ConvergenceUnauthorizedError();
  }
}
