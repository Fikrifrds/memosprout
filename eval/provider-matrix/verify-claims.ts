/**
 * Offline verifier for the published report.
 *
 *   pnpm tsx eval/provider-matrix/verify-claims.ts
 *
 * Recomputes every headline number in docs/evaluations/PROVIDER_MATRIX.md
 * from the stored raw results and fails if the document and the data have
 * drifted apart. No network, no paid calls.
 *
 * It also re-asserts the four methodology rules that MATRIX_REVISION_V2
 * exists to enforce, so a future edit cannot quietly reintroduce the
 * mistakes: precision must span controls, transfer must exclude
 * self-pairs, rates must be item-level, and control metrics must exist for
 * every arm.
 */
import { readFileSync } from "node:fs";

import {
  correctedSummary,
  correctedTransfer,
  itemRate,
  regrade,
  type CorrectedSummary,
} from "@/eval/provider-matrix/analysis";
import type { ProviderRun } from "@/eval/provider-matrix/runner";
import { gradePasses } from "@/eval/provider-matrix/runner";
import { matrixCases } from "@/eval/provider-matrix/tasks";

const RAW_PATH = "eval/provider-matrix/results/raw-results.json";
const REPORT_PATH = "docs/evaluations/PROVIDER_MATRIX.md";

const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
  runs: ProviderRun[];
  transfer: Parameters<typeof correctedTransfer>[0];
};
const report = readFileSync(REPORT_PATH, "utf8");

/**
 * The report deliberately quotes v1's wrong figures in its corrections
 * table. Stale-figure guards run against everything else, so documenting
 * a past mistake does not read as repeating it.
 */
const claimText = (() => {
  const start = report.indexOf("## Corrections to v1");
  if (start === -1) return report;
  const end = report.indexOf("\n## ", start + 1);
  return report.slice(0, start) + (end === -1 ? "" : report.slice(end));
})();
check(
  report.includes("## Corrections to v1"),
  "report no longer documents what v1 got wrong",
);

const summaries = raw.runs.map(correctedSummary);
const transfer = correctedTransfer(raw.transfer);
const find = (id: string): CorrectedSummary => {
  const summary = summaries.find((candidate) => candidate.provider.id === id);
  if (!summary) throw new Error(`No run for ${id}`);
  return summary;
};

// --- the bootstrap must be deterministic, or no interval is checkable ---
const first = itemRate([1, 1, 0.667, 0, 1, 0.333, 1, 1, 0], 27);
const second = itemRate([1, 1, 0.667, 0, 1, 0.333, 1, 1, 0], 27);
check(
  first.ci95[0] === second.ci95[0] && first.ci95[1] === second.ci95[1],
  "bootstrap is not deterministic across calls",
);

// --- methodology rule 1: precision spans controls -----------------------
for (const summary of summaries) {
  const servedOnControls = summary.retrieval.servedOnControls;
  if (servedOnControls === 0) continue;
  check(
    summary.retrieval.microRetrieved > summary.retrieval.microRelevant,
    `${summary.provider.id}: micro precision denominator ignores control retrievals`,
  );
}

const reportLabel = (id: string) => id === "anthropic/claude-haiku-4-5-20251001"
  ? "anthropic/claude-haiku-4-5"
  : id;
const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const interval = (rate: { ci95: [number, number] }) =>
  `[${Math.round(rate.ci95[0] * 100)}-${Math.round(rate.ci95[1] * 100)}]`;

// The two central result tables are headline claims, not illustrative text.
for (const summary of summaries) {
  const b = summary.arms.baseline.correctionCases;
  const i = summary.arms.injection.correctionCases;
  const g = summary.arms.gate.correctionCases;
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
  const row = `| ${reportLabel(summary.provider.id)} | ${percent(b.rate)} ${interval(b)} | ` +
    `${percent(i.rate)} ${interval(i)} | ${percent(g.rate)} ${interval(g)} | ` +
    `${signed(summary.liftPoints)} | ${summary.provider.id === "xiaomi/mimo-v2.5" ? `**${signed(summary.gateDeltaPoints)}**` : signed(summary.gateDeltaPoints)} |`;
  check(report.includes(row), `${summary.provider.id}: correction headline row is missing or stale`);

  const controls = summary.arms;
  const controlRow = `| ${reportLabel(summary.provider.id)} | ` +
    `${percent(controls.baseline.controlCorrect.rate)} / ${percent(controls.injection.controlCorrect.rate)} / ${percent(controls.gate.controlCorrect.rate)} | ` +
    `${percent(controls.baseline.controlContaminated.rate)} / ${controls.injection.controlContaminated.rate === 0.1667 ? "**17%**" : percent(controls.injection.controlContaminated.rate)} / ${controls.gate.controlContaminated.rate === 0.1667 ? "**17%**" : percent(controls.gate.controlContaminated.rate)} |`;
  check(report.includes(controlRow), `${summary.provider.id}: control headline row is missing or stale`);
}

// --- methodology rule 2: transfer excludes self-pairs -------------------
check(transfer !== null, "transfer results missing");
if (transfer) {
  check(
    transfer.crossProvider.total === 50 && transfer.crossProvider.applied === 43,
    `cross-provider transfer is ${transfer?.crossProvider.applied}/${transfer?.crossProvider.total}, expected 43/50`,
  );
  check(
    transfer.selfTransfer.total === 10,
    `expected 10 self-transfer pairs held out, found ${transfer.selfTransfer.total}`,
  );
  check(
    report.includes(`${transfer.crossProvider.applied}/${transfer.crossProvider.total}`),
    "report does not state the cross-provider transfer figure",
  );
  check(!/\b53\/60\b/.test(claimText), "report still carries the pooled 53/60 transfer figure");
}

// --- methodology rule 3: rates are item-level ---------------------------
for (const summary of summaries) {
  for (const [name, arm] of Object.entries(summary.arms)) {
    check(
      arm.correctionCases.items <= 9,
      `${summary.provider.id}/${name}: ${arm.correctionCases.items} items, expected at most 9 cases`,
    );
    check(
      arm.correctionCases.observations >= arm.correctionCases.items,
      `${summary.provider.id}/${name}: fewer observations than items`,
    );
  }
}
check(
  !/n=27/.test(claimText),
  "report still presents 27 repetitions as independent observations (n=27)",
);

// Paired outcomes must be present and must reproduce exactly. They are
// repetition-level matched comparisons, never relabelled as independent n.
for (const summary of summaries) {
  const label = reportLabel(summary.provider.id);
  const before = summary.paired.baselineToInjection;
  const gate = summary.paired.injectionToGate;
  const row = `| ${label} | ${before.wins}/${before.losses}/${before.ties} (${before.pairs}) | ` +
    `${gate.wins}/${gate.losses}/${gate.ties} (${gate.pairs}) |`;
  check(report.includes(row), `${summary.provider.id}: paired W/L/T row is missing or stale`);
}

// Every observed correction case must appear with its exact injection and
// gate repetition counts. Provider columns are verified in report order.
const reportOrder = [
  "openai/gpt-4o-mini",
  "openrouter/openai/gpt-4o-mini",
  "qwen/qwen3.8-max-preview",
  "anthropic/claude-haiku-4-5-20251001",
  "xiaomi/mimo-v2.5",
  "togetherai/openai/gpt-oss-120b",
];
for (const testCase of matrixCases.filter((entry) => entry.kind !== "control")) {
  const cells = reportOrder.map((providerId) => {
    const rates = find(providerId).perCase[testCase.id];
    if (!rates || (rates.injection.observations === 0 && rates.gate.observations === 0)) return "—";
    return `${rates.injection.passed}/${rates.injection.observations}→${rates.gate.passed}/${rates.gate.observations}`;
  });
  const row = `| ${testCase.id} | ${cells.join(" | ")} |`;
  check(report.includes(row), `${testCase.id}: per-case repetition row is missing or stale`);
}

// --- methodology rule 4: control metrics exist for every arm ------------
for (const summary of summaries) {
  for (const [name, arm] of Object.entries(summary.arms)) {
    check(
      arm.controlCorrect.items > 0 && arm.controlContaminated.items > 0,
      `${summary.provider.id}/${name}: missing control correctness or contamination`,
    );
  }
}

// --- headline claims, recomputed ---------------------------------------
for (const summary of summaries) {
  check(
    summary.arms.baseline.correctionCases.rate === 0,
    `${summary.provider.id}: baseline is ${summary.arms.baseline.correctionCases.rate}, the report claims 0 everywhere`,
  );
}

const mimo = find("xiaomi/mimo-v2.5");
check(
  mimo.gateDeltaPoints > 40,
  `gate delta on mimo-v2.5 is ${mimo.gateDeltaPoints}pp; the report calls it the case where the gate earns its place`,
);
for (const summary of summaries) {
  if (summary.provider.id === "xiaomi/mimo-v2.5") continue;
  check(
    summary.gateDeltaPoints < mimo.gateDeltaPoints,
    `${summary.provider.id} gate delta (${summary.gateDeltaPoints}pp) is not below mimo's; the weak-model claim breaks`,
  );
}

const harmful = summaries.reduce((sum, summary) => sum + summary.gate.harmfulBlocks, 0);
check(harmful === 1, `expected 1 re-graded harmful block in the stored run, found ${harmful}`);

// The retrieval ceiling claim: nothing was ever correct without retrieval.
for (const rawRun of raw.runs) {
  const run = regrade(rawRun);
  const correctWithoutRetrieval = run.repetitions.filter((result) => {
    if (result.status === "error" || !result.retrieval?.expectedId || !result.injection) return false;
    const retrieved = result.retrieval.servedIds.includes(result.retrieval.expectedId);
    return !retrieved && gradePasses(result.injection.grade);
  }).length;
  check(
    correctWithoutRetrieval === 0,
    `${rawRun.provider.id}: ${correctWithoutRetrieval} answers were correct without retrieval, contradicting the ceiling claim`,
  );
}

// Compatibility wrappers must never count as clean output. This protects
// against phrase-only grading accidentally rehabilitating broken clients.
for (const rawRun of raw.runs.filter((run) =>
  run.provider.id.startsWith("togetherai/") || run.provider.id === "xiaomi/mimo-v2.5")) {
  const run = regrade(rawRun);
  const wrappedCountedClean = run.repetitions.filter((result) =>
    [result.baseline, result.injection].some((outcome) =>
      outcome !== null && outcome.answer.trim().startsWith("{") && gradePasses(outcome.grade))).length;
  check(wrappedCountedClean === 0, `${rawRun.provider.id}: wrapper artefact counted as clean output`);
}

// The paraphrase failure must still be the same two cases, on every provider.
const misses = new Set<string>();
for (const run of raw.runs) {
  for (const result of run.repetitions) {
    if (result.status === "error" || !result.retrieval?.expectedId) continue;
    if (!result.retrieval.servedIds.includes(result.retrieval.expectedId)) misses.add(result.caseId);
  }
}
check(
  misses.size === 2 &&
    misses.has("h-workwear-allowance") &&
    misses.has("s-deleted-ticket-retention"),
  `retrieval misses are ${[...misses].join(", ")}, expected exactly the two paraphrase cases`,
);

// --- report hygiene -----------------------------------------------------
check(
  /pre-retrieval-fix/i.test(report),
  "report is not labelled as pre-retrieval-fix",
);
check(
  /gpt-oss-120b/.test(report) && /name.*final.*content|wrapper|envelope/i.test(report),
  "report no longer documents the TogetherAI wrapper defect",
);
check(
  !/general production accuracy/i.test(report) || /stress test/i.test(report),
  "report must frame results as a constructed stress test",
);
check(
  transfer ? report.includes(`${transfer.crossProvider.applied}/${transfer.crossProvider.total}`) : true,
  "transfer figure missing from report",
);

const precisions = [...new Set(summaries.map((summary) => summary.retrieval.microPrecision))];
console.log(
  `providers ${summaries.length} | micro precision ${precisions.map((p) => `${(p * 100).toFixed(1)}%`).join(", ")} | ` +
    `cross-provider transfer ${transfer?.crossProvider.applied}/${transfer?.crossProvider.total} | harmful blocks ${harmful}`,
);
check(
  !precisions.some((precision) => precision > 0.8),
  `a micro precision above 80% suggests the control retrievals dropped out again (${precisions.join(", ")})`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} claim check failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("All published claims reproduce from the raw results.");
