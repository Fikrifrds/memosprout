/**
 * Measures what semantic retrieval actually buys, against a live embedding
 * provider. Run: pnpm semantic:eval
 *
 * The corpus is deliberately split into three query classes, because a
 * single recall number would hide the trade:
 *
 *   shared    — the query reuses trigger vocabulary. Lexical already wins
 *               here; semantic must not regress it.
 *   paraphrase — the query means the same thing in different words. This is
 *               the gap semantic retrieval exists to close.
 *   unrelated — the query is about something else in the same domain. This
 *               is the cost side: embeddings will happily return a
 *               "somewhat similar" correction, and serving a wrong
 *               correction is worse than serving none.
 *
 * Precision on the unrelated set is therefore reported alongside recall.
 * A configuration that lifts recall while dragging precision down is not an
 * improvement, and this script is built to make that visible.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is required. Run with: pnpm semantic:eval");
  process.exit(1);
}

const EMBEDDING_MODEL = process.env.MEMOSPROUT_EMBEDDING_MODEL ?? "text-embedding-3-small";
const THRESHOLD = Number(process.env.MEMOSPROUT_SEMANTIC_THRESHOLD ?? 0.35);

const corrections = [
  {
    wrong: "The annual uniform allowance is EUR 120",
    correct: "The annual uniform allowance is EUR 200",
    keywords: ["uniform allowance"],
  },
  {
    wrong: "A parking permit costs EUR 40 per month",
    correct: "A parking permit costs EUR 55 per month",
    keywords: ["parking permit"],
  },
  {
    wrong: "Laptops carry a 12 month warranty",
    correct: "Laptops carry a 36 month warranty",
    keywords: ["laptop warranty"],
  },
  {
    wrong: "Sick leave requires a doctor's note after 2 days",
    correct: "Sick leave requires a doctor's note after 4 days",
    keywords: ["sick leave", "doctor's note"],
  },
  {
    wrong: "Expense claims are reimbursed within 10 working days",
    correct: "Expense claims are reimbursed within 21 working days",
    keywords: ["expense claim", "reimbursement"],
  },
];

interface Query {
  text: string;
  /** Index into `corrections`, or null when nothing should be retrieved. */
  expect: number | null;
  kind: "shared" | "paraphrase" | "unrelated";
}

const queries: Query[] = [
  { text: "What is the uniform allowance?", expect: 0, kind: "shared" },
  { text: "How much is the parking permit?", expect: 1, kind: "shared" },
  { text: "What is the laptop warranty?", expect: 2, kind: "shared" },
  { text: "When do I need a doctor's note for sick leave?", expect: 3, kind: "shared" },
  { text: "How long does an expense claim take?", expect: 4, kind: "shared" },

  { text: "How much can I claim back for workwear each year?", expect: 0, kind: "paraphrase" },
  { text: "What do I pay to leave my car at the office?", expect: 1, kind: "paraphrase" },
  { text: "If my company computer breaks, how long is it covered?", expect: 2, kind: "paraphrase" },
  { text: "How many days off ill before I need proof from a physician?", expect: 3, kind: "paraphrase" },
  { text: "When will I get my money back after submitting receipts?", expect: 4, kind: "paraphrase" },
  { text: "Is protective clothing paid for by the employer?", expect: 0, kind: "paraphrase" },
  { text: "What is the monthly charge for a staff car space?", expect: 1, kind: "paraphrase" },

  { text: "What time does the office open?", expect: null, kind: "unrelated" },
  { text: "Who is the CEO of the company?", expect: null, kind: "unrelated" },
  { text: "Can I bring my dog to work?", expect: null, kind: "unrelated" },
  { text: "How do I book a meeting room?", expect: null, kind: "unrelated" },
];

async function seed(directory: string, semantic: boolean): Promise<MemoSprout> {
  const ms = new MemoSprout(directory, {
    ...(semantic
      ? {
          semanticRetrieval: true,
          semanticRetrievalThreshold: THRESHOLD,
          embedding: { apiKey, model: EMBEDDING_MODEL },
        }
      : {}),
  });
  for (const correction of corrections) {
    await ms.correct({ ...correction, domain: "handbook" });
  }
  return ms;
}

interface Outcome {
  hits: number;
  total: number;
  /** Retrieved something, but not the right thing. */
  wrong: number;
}

async function measure(semantic: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "memosprout-eval-"));
  try {
    const ms = await seed(directory, semantic);
    const byKind = new Map<Query["kind"], Outcome>();

    for (const query of queries) {
      const outcome = byKind.get(query.kind) ?? { hits: 0, total: 0, wrong: 0 };
      outcome.total += 1;

      const { corrections: got } = await ms.context(query.text, "handbook");
      const top = got[0];

      if (query.expect === null) {
        // Correct behaviour is retrieving nothing at all.
        if (got.length === 0) outcome.hits += 1;
        else outcome.wrong += 1;
      } else if (top && top.correctAnswer === corrections[query.expect]!.correct) {
        outcome.hits += 1;
      } else if (top) {
        outcome.wrong += 1;
      }

      byKind.set(query.kind, outcome);
    }
    return byKind;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function pct(hits: number, total: number): string {
  return total === 0 ? "  n/a" : `${Math.round((hits / total) * 100)}%`.padStart(5);
}

const kinds: Array<Query["kind"]> = ["shared", "paraphrase", "unrelated"];

console.log(`embedding model : ${EMBEDDING_MODEL}`);
console.log(`threshold       : ${THRESHOLD}\n`);

const off = await measure(false);
const on = await measure(true);

console.log("query class   n    lexical   +semantic   delta");
console.log("-".repeat(50));
for (const kind of kinds) {
  const a = off.get(kind)!;
  const b = on.get(kind)!;
  const delta = Math.round((b.hits / b.total - a.hits / a.total) * 100);
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  console.log(
    `${kind.padEnd(12)} ${String(a.total).padStart(2)}    ` +
      `${pct(a.hits, a.total)}      ${pct(b.hits, b.total)}    ${sign.padStart(5)} pts`,
  );
}

const totals = (m: Map<Query["kind"], Outcome>) =>
  kinds.reduce(
    (acc, kind) => {
      const o = m.get(kind)!;
      return { hits: acc.hits + o.hits, total: acc.total + o.total, wrong: acc.wrong + o.wrong };
    },
    { hits: 0, total: 0, wrong: 0 },
  );

const offTotal = totals(off);
const onTotal = totals(on);
console.log("-".repeat(50));
console.log(
  `${"overall".padEnd(12)} ${String(offTotal.total).padStart(2)}    ` +
    `${pct(offTotal.hits, offTotal.total)}      ${pct(onTotal.hits, onTotal.total)}`,
);
console.log(
  `\nwrong correction served: lexical ${offTotal.wrong}, +semantic ${onTotal.wrong}`,
);
console.log(
  "\nCost: one embedding call per query that lexical did not answer, plus one\n" +
    "batched call per correction the first time it is indexed (then cached).",
);
