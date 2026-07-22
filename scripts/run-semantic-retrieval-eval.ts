/**
 * Measures what semantic retrieval actually buys, against a live embedding
 * provider. Run: pnpm semantic:eval
 *
 * The corpus is 24 corrections rather than a handful, and that size is the
 * point. On a toy store of five corrections almost any threshold scores
 * well, because no two corrections are close enough to be confused — an
 * earlier version of this script made exactly that mistake and reported a
 * flattering number. Precision is what degrades as a domain fills up, so
 * the corrections here form deliberate near-neighbour clusters: four
 * allowances, three warranties, four kinds of leave.
 *
 * Queries are split into four classes, because one recall number hides the
 * trade:
 *
 *   paraphrase   — same fact, different words. The gap semantic exists to close.
 *   near-miss    — a paraphrase whose cluster holds a very similar sibling;
 *                  retrieving the sibling is worse than retrieving nothing.
 *   should-miss  — topically adjacent to the corpus, but no correction covers
 *                  it. The honest answer is silence.
 *   unrelated    — off-topic entirely.
 *
 * `should-miss` is the class that punishes a low threshold, and it is
 * reported alongside recall so a configuration that lifts recall by
 * hallucinating relevance cannot look like an improvement.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";
import { CorrectionStore } from "@/lib/correction/store";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is required. Run with: pnpm semantic:eval");
  process.exit(1);
}

const EMBEDDING_MODEL = process.env.MEMOSPROUT_EMBEDDING_MODEL ?? "text-embedding-3-small";
const THRESHOLD = Number(process.env.MEMOSPROUT_SEMANTIC_THRESHOLD ?? 0.42);

interface Correction {
  key: string;
  wrong: string;
  correct: string;
  keywords: string[];
}

const corrections: Correction[] = [
  // Allowances — four near neighbours.
  { key: "uniform", wrong: "The annual uniform allowance is EUR 120", correct: "The annual uniform allowance is EUR 200", keywords: ["uniform allowance"] },
  { key: "tool", wrong: "The annual tool allowance is EUR 300", correct: "The annual tool allowance is EUR 450", keywords: ["tool allowance"] },
  { key: "meal", wrong: "The daily meal allowance is EUR 8", correct: "The daily meal allowance is EUR 14", keywords: ["meal allowance"] },
  { key: "homeoffice", wrong: "The home office allowance is EUR 25 per month", correct: "The home office allowance is EUR 40 per month", keywords: ["home office allowance"] },

  // Transport.
  { key: "carpark", wrong: "A car parking permit costs EUR 40 per month", correct: "A car parking permit costs EUR 55 per month", keywords: ["parking permit"] },
  { key: "bike", wrong: "Bicycle storage costs EUR 5 per month", correct: "Bicycle storage is free", keywords: ["bicycle storage"] },
  { key: "transit", wrong: "The public transit subsidy is 30 percent", correct: "The public transit subsidy is 50 percent", keywords: ["transit subsidy"] },

  // Leave — four near neighbours.
  { key: "sick", wrong: "Sick leave requires a doctor's note after 2 days", correct: "Sick leave requires a doctor's note after 4 days", keywords: ["sick leave"] },
  { key: "annual", wrong: "Annual leave is 20 days", correct: "Annual leave is 26 days", keywords: ["annual leave"] },
  { key: "parental", wrong: "Parental leave is 12 weeks", correct: "Parental leave is 16 weeks", keywords: ["parental leave"] },
  { key: "bereave", wrong: "Bereavement leave is 1 day", correct: "Bereavement leave is 3 days", keywords: ["bereavement leave"] },

  // Warranties — three near neighbours.
  { key: "laptop", wrong: "Laptops carry a 12 month warranty", correct: "Laptops carry a 36 month warranty", keywords: ["laptop warranty"] },
  { key: "phone", wrong: "Company phones carry a 12 month warranty", correct: "Company phones carry a 24 month warranty", keywords: ["phone warranty"] },
  { key: "monitor", wrong: "Monitors carry a 24 month warranty", correct: "Monitors carry a 60 month warranty", keywords: ["monitor warranty"] },

  // Money.
  { key: "expense", wrong: "Expense claims are reimbursed within 10 working days", correct: "Expense claims are reimbursed within 21 working days", keywords: ["expense claim"] },
  { key: "invoice", wrong: "Supplier invoices are paid within 30 days", correct: "Supplier invoices are paid within 45 days", keywords: ["supplier invoice"] },
  { key: "payroll", wrong: "Payroll runs on the 25th of the month", correct: "Payroll runs on the 28th of the month", keywords: ["payroll"] },
  { key: "refund", wrong: "Customer refunds take 3 business days", correct: "Customer refunds take 5 business days", keywords: ["refund"] },

  // Employment terms.
  { key: "probation", wrong: "Probation period is 3 months", correct: "Probation period is 6 months", keywords: ["probation"] },
  { key: "notice", wrong: "Notice period is 1 month", correct: "Notice period is 2 months", keywords: ["notice period"] },
  { key: "training", wrong: "The training budget is EUR 500 per year", correct: "The training budget is EUR 1200 per year", keywords: ["training budget"] },
  { key: "wfh", wrong: "Employees may work from home 1 day per week", correct: "Employees may work from home 3 days per week", keywords: ["work from home"] },
  { key: "onboard", wrong: "Onboarding takes 2 days", correct: "Onboarding takes 5 days", keywords: ["onboarding"] },
  { key: "review", wrong: "Performance reviews happen annually", correct: "Performance reviews happen twice a year", keywords: ["performance review"] },
];

type QueryKind = "paraphrase" | "near-miss" | "should-miss" | "unrelated";

interface Query {
  text: string;
  /** Correction key that should rank first, or null when nothing should match. */
  expect: string | null;
  kind: QueryKind;
}

const queries: Query[] = [
  { text: "How much can I claim back for workwear each year?", expect: "uniform", kind: "paraphrase" },
  { text: "What do I pay to leave my car at the office?", expect: "carpark", kind: "paraphrase" },
  { text: "If my company computer breaks, how long is it covered?", expect: "laptop", kind: "paraphrase" },
  { text: "How many days off ill before I need proof from a physician?", expect: "sick", kind: "paraphrase" },
  { text: "When will I get my money back after submitting receipts?", expect: "expense", kind: "paraphrase" },
  { text: "How much time off do I get after having a baby?", expect: "parental", kind: "paraphrase" },
  { text: "How many vacation days am I entitled to?", expect: "annual", kind: "paraphrase" },
  { text: "How long is the trial period for a new hire?", expect: "probation", kind: "paraphrase" },
  { text: "How much does the firm spend on my professional development?", expect: "training", kind: "paraphrase" },
  { text: "How often does the company assess how I'm doing?", expect: "review", kind: "paraphrase" },
  { text: "How many days a week can I stay home to work?", expect: "wfh", kind: "paraphrase" },
  { text: "What day of the month do I get paid?", expect: "payroll", kind: "paraphrase" },

  { text: "How much is the allowance for buying my own hand tools?", expect: "tool", kind: "near-miss" },
  { text: "What do I get for lunch each day?", expect: "meal", kind: "near-miss" },
  { text: "Is there a charge for keeping my bike at work?", expect: "bike", kind: "near-miss" },
  { text: "How long is my work mobile guaranteed for?", expect: "phone", kind: "near-miss" },
  { text: "How many days off when a family member dies?", expect: "bereave", kind: "near-miss" },
  { text: "How long before a vendor gets their money?", expect: "invoice", kind: "near-miss" },
  { text: "How much do I get toward my desk setup at home?", expect: "homeoffice", kind: "near-miss" },
  { text: "How long are my screens covered for?", expect: "monitor", kind: "near-miss" },

  { text: "Can I expense a taxi to the airport?", expect: null, kind: "should-miss" },
  { text: "Does the company pay for my gym membership?", expect: null, kind: "should-miss" },
  { text: "What is the dress code in the office?", expect: null, kind: "should-miss" },
  { text: "How do I report a workplace injury?", expect: null, kind: "should-miss" },
  { text: "Is there a pension scheme?", expect: null, kind: "should-miss" },
  { text: "Can I take unpaid leave for travel?", expect: null, kind: "should-miss" },

  { text: "What time does the office open?", expect: null, kind: "unrelated" },
  { text: "Who is the CEO?", expect: null, kind: "unrelated" },
  { text: "Can I bring my dog to work?", expect: null, kind: "unrelated" },
  { text: "How do I book a meeting room?", expect: null, kind: "unrelated" },
];

interface Tally {
  correct: number;
  wrong: number;
  total: number;
}

/**
 * How the lexical layer classified each query, before embeddings ran.
 *
 * This is the diagnostic that says whether the hybrid design is doing
 * anything for your corpus. `confident` queries keep the lexical answer and
 * never reach the embedding provider; `weak` and `empty` both fall through.
 * If `confident` is 0, hybrid is behaving exactly like pure semantic
 * retrieval, and the two are indistinguishable on your data.
 */
interface GateCounts {
  confident: number;
  weak: number;
  empty: number;
}

/** Mirrors the WEAK_LEXICAL_SCORE gate in lib/index.ts. */
const WEAK_LEXICAL_SCORE = 4;

async function measure(semantic: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "memosprout-eval-"));
  try {
    const ms = new MemoSprout(
      directory,
      semantic
        ? {
            semanticRetrieval: true,
            semanticRetrievalThreshold: THRESHOLD,
            embedding: { apiKey, model: EMBEDDING_MODEL },
          }
        : {},
    );
    for (const correction of corrections) {
      await ms.correct({ ...correction, domain: "handbook" });
    }

    // Read the lexical scores directly from a second store over the same
    // directory: context() reports what it served, not how it decided.
    const store = new CorrectionStore(directory);
    await store.init();
    const gate: GateCounts = { confident: 0, weak: 0, empty: 0 };

    const byKind = new Map<QueryKind, Tally>();
    const failures: string[] = [];

    for (const query of queries) {
      const tally = byKind.get(query.kind) ?? { correct: 0, wrong: 0, total: 0 };
      tally.total += 1;

      const lexicalScore = store.matchScored(query.text, "handbook")[0]?.score ?? 0;
      if (lexicalScore === 0) gate.empty += 1;
      else if (lexicalScore >= WEAK_LEXICAL_SCORE) gate.confident += 1;
      else gate.weak += 1;

      const { corrections: got } = await ms.context(query.text, "handbook");
      const top = got[0];
      const topKey = top
        ? corrections.find((c) => c.correct === top.correctAnswer)?.key
        : undefined;

      if (query.expect === null) {
        if (got.length === 0) tally.correct += 1;
        else {
          tally.wrong += 1;
          failures.push(`  [${query.kind}] "${query.text}"\n      expected nothing, got ${topKey}`);
        }
      } else if (topKey === query.expect) {
        tally.correct += 1;
      } else {
        if (top) tally.wrong += 1;
        failures.push(
          `  [${query.kind}] "${query.text}"\n      expected ${query.expect}, got ${topKey ?? "NOTHING"}`,
        );
      }

      byKind.set(query.kind, tally);
    }
    return { byKind, failures, gate };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const kinds: QueryKind[] = ["paraphrase", "near-miss", "should-miss", "unrelated"];

function pct(tally: Tally): string {
  return `${Math.round((tally.correct / tally.total) * 100)}%`.padStart(5);
}

console.log(`embedding model : ${EMBEDDING_MODEL}`);
console.log(`threshold       : ${THRESHOLD}`);
console.log(`corpus          : ${corrections.length} corrections, ${queries.length} queries\n`);

const off = await measure(false);
const on = await measure(true);

console.log("query class     n    lexical   +semantic");
console.log("-".repeat(46));
for (const kind of kinds) {
  const a = off.byKind.get(kind)!;
  const b = on.byKind.get(kind)!;
  console.log(`${kind.padEnd(14)}${String(a.total).padStart(2)}     ${pct(a)}     ${pct(b)}`);
}

const totals = (m: Map<QueryKind, Tally>): Tally =>
  kinds.reduce(
    (acc, kind) => {
      const t = m.get(kind)!;
      return {
        correct: acc.correct + t.correct,
        wrong: acc.wrong + t.wrong,
        total: acc.total + t.total,
      };
    },
    { correct: 0, wrong: 0, total: 0 },
  );

const offTotal = totals(off.byKind);
const onTotal = totals(on.byKind);
console.log("-".repeat(46));
console.log(
  `${"overall".padEnd(14)}${String(offTotal.total).padStart(2)}     ${pct(offTotal)}     ${pct(onTotal)}`,
);
console.log(`\nwrong correction served: lexical ${offTotal.wrong}, +semantic ${onTotal.wrong}`);

console.log(`\n--- remaining failures with semantic on (${on.failures.length}) ---`);
console.log(on.failures.join("\n") || "  none");

// The hybrid design keeps a confident lexical answer and sends everything
// else to the embeddings. That split is what distinguishes hybrid from pure
// semantic retrieval — and when `confident` is 0, there is nothing to
// distinguish: every query took the semantic path anyway.
const { confident, weak, empty } = on.gate;
console.log("\n--- lexical gate (how hybrid decided) ---");
console.log(`  confident (kept lexical, no embedding call): ${confident}`);
console.log(`  weak      (fell through to embeddings):      ${weak}`);
console.log(`  empty     (fell through to embeddings):      ${empty}`);
console.log(
  confident === 0
    ? "\n  No query had a confident lexical hit, so hybrid behaved exactly like\n" +
        "  pure semantic retrieval on this corpus. A 'full semantic' mode would\n" +
        "  return identical answers here — it would only cost more."
    : `\n  ${confident} quer${confident === 1 ? "y" : "ies"} skipped the embedding provider entirely.\n` +
        "  Those are the only queries where hybrid and pure semantic retrieval\n" +
        "  can disagree; inspect them if you are weighing the two.",
);

console.log(
  "\nCost: one embedding call per query that lexical did not answer, plus one\n" +
    "batched call per correction the first time it is indexed (then cached).",
);
