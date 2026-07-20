/**
 * Scenario integrity check for api-conventions. Proves the scenario is honest before any
 * money is spent measuring with it:
 *
 *   1. A correct implementation (following the conventions) passes the acceptance oracle.
 *   2. A plausible naive implementation (what an agent writes without knowing the
 *      conventions) fails it — so the scenario actually discriminates.
 *   3. The ordinary test suite passes in both cases, so failure is attributable to the
 *      hidden conventions rather than to a broken task.
 */
import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createScenarioOracle } from "@/lib/eval/engine/oracle";
import { prepareScenarioRepository } from "@/lib/eval/engine/runner";
import { apiConventionsScenario, apiConventionsScenarioPaths } from "@/lib/scenario/api-conventions";

const root = process.cwd();

function vitest(cwd: string, file: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn("pnpm", ["exec", "vitest", "run", file], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", () => resolvePromise({ exitCode: -1, stdout, stderr }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? -1, stdout, stderr }));
  });
}

/** Follows every documented convention. */
const correctImplementation = `import { ok } from "../lib/response.js";
import type { OkResponse } from "../lib/response.js";
import { optionalPositiveInteger } from "../lib/validation.js";
import type { Invoice, Page, RequestContext } from "../lib/types.js";
import type { InvoiceRepository } from "../repositories/invoice-repository.js";

export function listInvoices(
  repository: InvoiceRepository,
  context: RequestContext,
  query: Record<string, unknown> = {},
): OkResponse<Invoice[]> {
  const limit = optionalPositiveInteger(query, "limit");
  const cursor = typeof query.cursor === "string" ? query.cursor : null;
  const page: Page<Invoice> = repository.list(context, { limit, cursor });
  return ok(page.items, { nextCursor: page.nextCursor });
}
`;

/**
 * What an agent plausibly writes without the conventions: reads the table directly, filters
 * tenant by hand, forgets archived rows and sorting, and hand-builds the envelope with the
 * cursor inside `data`.
 */
const naiveImplementation = `import type { OkResponse } from "../lib/response.js";
import type { Invoice, RequestContext } from "../lib/types.js";
import type { InvoiceRepository } from "../repositories/invoice-repository.js";

export function listInvoices(
  repository: InvoiceRepository,
  context: RequestContext,
  query: Record<string, unknown> = {},
): OkResponse<Invoice[]> {
  const db = (repository as unknown as { db: { table: (name: string) => Invoice[] } }).db;
  const all = db.table("invoices");
  const mine = all.filter((invoice) => invoice.tenantId === context.tenantId);
  const limit = typeof query.limit === "number" ? query.limit : 20;
  const items = mine.slice(0, limit);
  return { status: 200, body: { data: items } };
}
`;

async function evaluate(label: string, source: string): Promise<{ oracle: boolean; ordinary: boolean }> {
  const { repositoryRoot } = await prepareScenarioRepository({
    scenario: apiConventionsScenario,
    exposeProtection: false,
    root,
  });
  try {
    await writeFile(join(repositoryRoot, apiConventionsScenarioPaths.target), source, "utf8");
    const oracle = await createScenarioOracle({
      scenario: apiConventionsScenario,
      runAcceptanceTests: (repo) => vitest(repo, "tests/invoices.acceptance.test.ts"),
      root,
    });
    const oracleResult = await oracle.evaluate(repositoryRoot);
    const ordinary = await vitest(repositoryRoot, "tests/invoices.test.ts");
    console.log(
      `${label}: oracle=${oracleResult.passed ? "PASS" : "FAIL"} ordinary=${
        ordinary.exitCode === 0 ? "PASS" : "FAIL"
      }`,
    );
    if (!oracleResult.passed && label === "correct implementation") {
      console.log(`  oracle output:\n${ordinary.stdout.slice(-2000)}`);
    }
    return { oracle: oracleResult.passed, ordinary: ordinary.exitCode === 0 };
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const correct = await evaluate("correct implementation", correctImplementation);
  const naive = await evaluate("naive implementation  ", naiveImplementation);

  const valid = correct.oracle && correct.ordinary && !naive.oracle;
  console.log(
    valid
      ? "\nPASS: the scenario discriminates — conventions-following code passes, naive code fails."
      : "\nFAIL: the scenario is not valid as a measurement instrument.",
  );
  process.exit(valid ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
