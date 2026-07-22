/**
 * Offline verifier for the post-fix report.
 *
 *   pnpm tsx eval/provider-matrix/verify-post-fix.ts
 *
 * Recomputes every headline figure in docs/evaluations/PROVIDER_MATRIX_POST_FIX.md
 * from that run's raw results and fails if the document has drifted. The
 * pre-fix verifier (verify-claims.ts) still guards the older run; this one
 * exists so the two reports cannot be confused for one another.
 */
import { readFileSync } from "node:fs";

import { correctedSummary, correctedTransfer } from "@/eval/provider-matrix/analysis";
import type { ProviderRun } from "@/eval/provider-matrix/runner";

const RAW = "eval/provider-matrix/results/2026-07-22-post-fix/raw-results.json";
const REPORT = "docs/evaluations/PROVIDER_MATRIX_POST_FIX.md";

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

const raw = JSON.parse(readFileSync(RAW, "utf8")) as {
  runs: ProviderRun[];
  transfer: Parameters<typeof correctedTransfer>[0];
};
const report = readFileSync(REPORT, "utf8");
const summaries = raw.runs.map(correctedSummary);

const label = (id: string) =>
  id === "anthropic/claude-haiku-4-5-20251001" ? "anthropic/claude-haiku-4-5" : id;
const pct = (r: { rate: number }) => `${Math.round(r.rate * 100)}%`;
const interval = (r: { ci95: [number, number] }) =>
  `[${Math.round(r.ci95[0] * 100)}-${Math.round(r.ci95[1] * 100)}]`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;

// Every correction-case row must reproduce exactly from the raw data.
for (const s of summaries) {
  const b = s.arms.baseline.correctionCases;
  const i = s.arms.injection.correctionCases;
  const g = s.arms.gate.correctionCases;
  const row =
    `| ${label(s.provider.id)} | ${pct(b)} ${interval(b)} | ${pct(i)} ${interval(i)} | ` +
    `${pct(g)} ${interval(g)} | ${signed(s.liftPoints)} | ${signed(s.gateDeltaPoints)} |`;
  check(report.includes(row), `${s.provider.id}: correction row missing or stale\n    expected: ${row}`);
}

// Baseline must be zero everywhere — the stress test's defining property.
for (const s of summaries) {
  check(
    s.arms.baseline.correctionCases.rate === 0,
    `${s.provider.id}: baseline is ${s.arms.baseline.correctionCases.rate}, must be 0`,
  );
}

// The frozen expectations, recomputed.
const first = summaries[0]!;
check(
  Math.abs(first.retrieval.recall.rate - 8 / 9) < 0.001,
  `retrieval recall is ${first.retrieval.recall.rate}, expected 8/9`,
);
check(
  Math.abs(first.retrieval.microPrecision - 24 / 30) < 0.001,
  `micro precision is ${first.retrieval.microPrecision}, expected 24/30`,
);
check(report.includes("80.0% (24/30)"), "report does not state micro precision 80.0% (24/30)");

// The one expected miss, on every provider, and nothing else.
const misses = new Set<string>();
for (const run of raw.runs) {
  for (const r of run.repetitions) {
    if (r.status === "error" || !r.retrieval?.expectedId) continue;
    if (!r.retrieval.servedIds.includes(r.retrieval.expectedId)) misses.add(r.caseId);
  }
}
check(
  misses.size === 1 && misses.has("h-workwear-allowance"),
  `retrieval misses are ${[...misses].join(", ")}, expected only h-workwear-allowance`,
);

// Transfer: both the fact-level and clean-output figures.
const transfer = correctedTransfer(raw.transfer);
check(transfer !== null, "transfer results missing");
if (transfer) {
  check(
    report.includes(`${transfer.crossProvider.applied}/${transfer.crossProvider.total} applied`),
    `report does not state applied transfer ${transfer.crossProvider.applied}/${transfer.crossProvider.total}`,
  );
  check(
    transfer.crossProviderClean !== null &&
      report.includes(`${transfer.crossProviderClean.applied}/${transfer.crossProviderClean.total} applied *and* returned as prose`),
    "report does not state the clean-output transfer figure",
  );
  check(transfer.selfTransfer.total === 10, `self-transfer held out is ${transfer.selfTransfer.total}, expected 10`);
}

// Two providers must be zero under the shippable-output rule, and the
// report must say why rather than hiding it.
for (const id of ["xiaomi/mimo-v2.5", "togetherai/openai/gpt-oss-120b"]) {
  const s = summaries.find((x) => x.provider.id === id)!;
  check(
    s.arms.injection.correctionCases.rate === 0,
    `${id}: injection is ${s.arms.injection.correctionCases.rate}, expected 0 under shippable scoring`,
  );
}
check(/looksStructured/.test(report), "report no longer explains the structured-output zero");
check(
  /togetherai produced zero server errors/i.test(report),
  "report must note togetherai's errors were output shape, not endpoint health",
);

const harmful = summaries.reduce((sum, s) => sum + s.gate.harmfulBlocks, 0);
check(harmful === 1, `expected 1 harmful block, found ${harmful}`);

console.log(
  `providers ${summaries.length} | recall ${pct(first.retrieval.recall)} | ` +
    `precision ${(first.retrieval.microPrecision * 100).toFixed(1)}% | ` +
    `transfer ${transfer?.crossProvider.applied}/${transfer?.crossProvider.total} ` +
    `(clean ${transfer?.crossProviderClean?.applied}/${transfer?.crossProviderClean?.total}) | harmful ${harmful}`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} claim check failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Post-fix report reproduces from its raw results.");
