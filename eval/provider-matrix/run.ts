/**
 * Live provider matrix.
 *
 *   pnpm tsx eval/provider-matrix/preflight.ts     # which endpoints answer
 *   pnpm tsx eval/provider-matrix/run.ts           # full matrix
 *   pnpm tsx eval/provider-matrix/run.ts --reps 1 --no-transfer
 *
 * Reads `.provider_list_to_test` (gitignored). Writes raw results to
 * eval/provider-matrix/results/ — provider and model labels plus redacted
 * error categories only, never a credential.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadProviders, type ProviderEntry } from "@/eval/provider-matrix/providers";
import { probeAll } from "@/eval/provider-matrix/preflight";
import { runProvider, type ProviderRun } from "@/eval/provider-matrix/runner";
import { summarize, type ProviderSummary } from "@/eval/provider-matrix/report";
import { runTransfer, type TransferReport } from "@/eval/provider-matrix/transfer";
import { matrixCases } from "@/eval/provider-matrix/tasks";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? "");
}

const repetitions = Number(flag("reps") ?? 3);
const runTransferTests = !process.argv.includes("--no-transfer");

const entries = loadProviders();
console.log(`Configured providers: ${entries.length}`);

const probes = await probeAll(entries);
const operational: ProviderEntry[] = [];
for (const result of probes) {
  console.log(
    `  ${result.id.padEnd(38)} ${result.operational ? "operational" : `UNAVAILABLE [${result.errorCategory}]`}`,
  );
  if (result.operational) {
    const entry = entries.find((candidate) => candidate.id === result.id);
    if (entry) operational.push(entry);
  }
}

if (operational.length === 0) {
  console.error("\nNo operational provider. Nothing to measure.");
  process.exit(1);
}

const observationsPerProvider = matrixCases.length * repetitions;
const baseGenerationsPerProvider = observationsPerProvider * 2;
console.log(
  `\nRunning ${matrixCases.length} cases x ${repetitions} reps with ` +
    `${baseGenerationsPerProvider} baseline/injection generations per provider, plus ` +
    `one conditional repair generation whenever the gate blocks. ` +
    `${operational.length} providers run in parallel.\n`,
);

const directories: string[] = [];
const runs: ProviderRun[] = await Promise.all(
  operational.map(async (entry) => {
    const directory = await mkdtemp(join(tmpdir(), "memosprout-matrix-"));
    directories.push(directory);
    let done = 0;
    return runProvider({
      entry,
      directory,
      repetitions,
      onProgress: (result) => {
        done += 1;
        if (done % 15 === 0 || result.status === "error") {
          console.log(
            `  ${entry.id.padEnd(38)} ${done}/${observationsPerProvider}` +
              `${result.status === "error" ? `  [${result.errorCategory}] ${result.caseId}` : ""}`,
          );
        }
      },
    });
  }),
);

let transfer: TransferReport | null = null;
if (runTransferTests) {
  console.log("\nCross-provider transfer...");
  const reports = await Promise.all(
    operational.map((extractor) => runTransfer(extractor, operational)),
  );
  transfer = {
    extractions: reports.flatMap((report) => report.extractions),
    transfers: reports.flatMap((report) => report.transfers),
  };
}

await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));

const summaries: ProviderSummary[] = runs.map(summarize);
const output = {
  createdAt: new Date().toISOString(),
  configuration: {
    cases: matrixCases.length,
    repetitions,
    armsPerCase: 3,
    baseGenerationsPerCase: 2,
    gateRepairGeneration: "conditional_on_block",
    providersConfigured: entries.length,
    providersOperational: operational.length,
    requestedGenerations: runs.reduce((sum, run) => sum + (run.generationCalls ?? 0), 0),
  },
  probes,
  summaries,
  transfer,
  runs,
};

const directory = join("eval", "provider-matrix", "results");
await mkdir(directory, { recursive: true });
const rawPath = join(directory, "raw-results.json");
const summaryPath = join(directory, "summary.json");
await writeFile(rawPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(
  summaryPath,
  `${JSON.stringify({ ...output, runs: undefined }, null, 2)}\n`,
  "utf8",
);

const percent = (value: { rate: number; ci95: [number, number]; total: number }) =>
  `${(value.rate * 100).toFixed(0)}% [${(value.ci95[0] * 100).toFixed(0)}-${(value.ci95[1] * 100).toFixed(0)}] n=${value.total}`;

console.log("\n=== Correction cases (drift + multifact) ===");
for (const summary of summaries) {
  console.log(`\n${summary.provider.id}`);
  console.log(`  baseline   ${percent(summary.arms.baseline.correct)}`);
  console.log(`  injection  ${percent(summary.arms.injection.correct)}`);
  console.log(`  gate       ${percent(summary.arms.gate.correct)}`);
  console.log(
    `  lift ${summary.liftPoints >= 0 ? "+" : ""}${summary.liftPoints}pp` +
      `   gate delta ${summary.gateDeltaPoints >= 0 ? "+" : ""}${summary.gateDeltaPoints}pp`,
  );
  console.log(
    `  retrieval recall ${percent(summary.retrieval.recall)}` +
      `  precision ${(summary.retrieval.precision * 100).toFixed(0)}%`,
  );
  console.log(
    `  contamination ${percent(summary.contamination)}` +
      `  multifact preserved ${percent(summary.multifactPreservation)}`,
  );
  console.log(
    `  blocks ${percent(summary.gateBehaviour.blocks)}  harmful ${summary.gateBehaviour.harmfulBlocks}` +
      `  latency median ${summary.arms.injection.latencyMs.median}ms`,
  );
  if (summary.samples.errored > 0) {
    console.log(
      `  errors ${summary.samples.errored}/${summary.samples.attempted} ` +
        JSON.stringify(summary.samples.errorCategories),
    );
  }
}

if (transfer) {
  const ok = transfer.transfers.filter((result) => result.status === "ok");
  const applied = ok.filter((result) => result.applied);
  console.log(
    `\nTransfer: ${applied.length}/${ok.length} applied` +
      `  (extractions ok ${transfer.extractions.filter((e) => e.status === "extracted").length}/${transfer.extractions.length})`,
  );
}

console.log(`\nRaw: ${rawPath}\nSummary: ${summaryPath}`);
