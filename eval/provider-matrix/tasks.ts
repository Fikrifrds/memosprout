/**
 * Task set for the live provider matrix.
 *
 * Three domains, three case kinds, three difficulty levels. All entities
 * are fictional and unique to this file, so no provider can recover an
 * answer from pretraining and every baseline failure comes from the stale
 * snippet in front of it.
 *
 * Case kinds and what each one is for:
 *
 * - `drift`    — the snippet is stale and a correction holds the current
 *                fact. Measures correction adherence and stale-fact
 *                rejection.
 * - `multifact`— the question asks for two facts, only one of which
 *                drifted. Measures whether the pipeline preserves the
 *                untouched fact instead of collapsing the answer to a
 *                single correction.
 * - `control`  — the snippet is current and no correction applies. The
 *                `hard` controls sit deliberately adjacent to a real
 *                correction, so retrieval is tempted to inject something
 *                irrelevant. Measures contamination.
 *
 * Difficulty is about retrieval, not about the fact: `easy` questions
 * repeat the correction's trigger words, `medium` questions paraphrase
 * them away, `hard` questions mix topics.
 */
import { z } from "zod";

export const matrixCaseSchema = z
  .object({
    id: z.string().min(1),
    domain: z.enum(["handbook", "billing", "support"]),
    kind: z.enum(["drift", "multifact", "control"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
    question: z.string().min(1),
    kbSnippet: z.string().min(1),
    /**
     * Every entry must be asserted. `a|b` means "a or b".
     * On a `multifact` case the first entry is the drifted fact and the
     * rest are the stable facts the snippet already supplies.
     */
    mustInclude: z.array(z.string().min(1)).min(1),
    /** No entry may be asserted (naming one to reject it is fine). */
    mustExclude: z.array(z.string().min(1)),
    /**
     * Facts from *other* corrections that must not leak into this answer.
     * Scored separately from correctness: an answer can be right and still
     * drag in an irrelevant memory.
     */
    contaminationPhrases: z.array(z.string().min(1)).default([]),
    correction: z
      .object({
        wrong: z.string().min(1),
        correct: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        source: z.string().min(1),
      })
      .optional(),
  })
  .strict()
  .refine((testCase) => (testCase.kind === "control") === (testCase.correction === undefined), {
    message: "drift and multifact cases need a correction; control cases must not have one",
  });

export type MatrixCase = z.infer<typeof matrixCaseSchema>;

export const matrixCases: MatrixCase[] = [
  // ---------------------------------------------------------------- handbook
  {
    id: "h-shift-length",
    domain: "handbook",
    kind: "drift",
    difficulty: "easy",
    question: "How long is a standard depot shift at Verity Rail?",
    kbSnippet:
      "Verity Rail Handbook 3.1 (Shifts). A standard depot shift is 10 hours.",
    mustInclude: ["8 hours|eight hours"],
    mustExclude: ["10 hours", "ten hours"],
    contaminationPhrases: [],
    correction: {
      wrong: "A standard depot shift is 10 hours",
      correct: "A standard depot shift is 8 hours",
      keywords: ["shift", "depot shift", "standard shift"],
      source: "Verity Rail Handbook 3.1 rev. 2026-02",
    },
  },
  {
    id: "h-workwear-allowance",
    domain: "handbook",
    kind: "drift",
    difficulty: "medium",
    // The question says "workwear"; the correction is filed under
    // "uniform allowance". Retrieval has to bridge the wording.
    question: "How much can a depot employee claim back for workwear each year?",
    kbSnippet:
      "Verity Rail Handbook 6.2 (Allowances). The annual uniform allowance is EUR 120.",
    mustInclude: ["200"],
    mustExclude: ["120"],
    contaminationPhrases: [],
    correction: {
      wrong: "The annual uniform allowance is EUR 120",
      correct: "The annual uniform allowance is EUR 200",
      // No "workwear" alias on purpose. This case exists to measure the
      // synonym gap; configuring the question's own word as a trigger
      // would delete the measurement rather than close the gap.
      keywords: ["uniform allowance", "allowance", "uniform"],
      source: "Verity Rail Handbook 6.2 rev. 2026-03",
    },
  },
  {
    id: "h-onboarding-multifact",
    domain: "handbook",
    kind: "multifact",
    difficulty: "hard",
    question:
      "For a new depot hire, how long is the probation period and who signs off the completed probation?",
    kbSnippet:
      "Verity Rail Handbook 2.4 (Onboarding). New depot hires serve a probation period of 3 months. " +
      "Completed probation is signed off by the depot manager.",
    mustInclude: ["6 months|six months", "depot manager"],
    mustExclude: ["3 months", "three months"],
    contaminationPhrases: [],
    correction: {
      wrong: "New depot hires serve a probation period of 3 months",
      correct: "New depot hires serve a probation period of 6 months",
      keywords: ["probation", "new hire", "onboarding"],
      source: "Verity Rail Handbook 2.4 rev. 2026-01",
    },
  },
  {
    id: "h-locker-control",
    domain: "handbook",
    kind: "control",
    difficulty: "easy",
    question: "Where do depot staff collect a locker key?",
    kbSnippet:
      "Verity Rail Handbook 1.8 (Facilities). Locker keys are collected from the depot reception desk.",
    mustInclude: ["reception"],
    mustExclude: [],
    contaminationPhrases: ["8 hours", "200", "6 months"],
  },
  {
    id: "h-unpaid-leave-control",
    domain: "handbook",
    kind: "control",
    difficulty: "hard",
    // A correction exists for *paid* leave. This asks about *unpaid*
    // leave, which never changed.
    question: "What is the maximum unpaid leave a Verity Rail employee can take in one year?",
    kbSnippet:
      "Verity Rail Handbook 4.9 (Leave). Unpaid leave is capped at 20 working days per year.",
    mustInclude: ["20"],
    mustExclude: [],
    contaminationPhrases: ["28 days", "22 days"],
  },

  // ----------------------------------------------------------------- billing
  {
    id: "b-settlement-window",
    domain: "billing",
    kind: "drift",
    difficulty: "easy",
    question: "What is the settlement window for a Northmark Payments merchant?",
    kbSnippet:
      "Northmark Payments Merchant Guide 5.1 (Settlement). Funds settle on a T+3 basis.",
    mustInclude: ["t 1|t plus 1|next business day"],
    mustExclude: ["t 3", "t plus 3"],
    contaminationPhrases: [],
    correction: {
      wrong: "Funds settle on a T+3 basis",
      correct: "Funds settle on a T+1 basis",
      keywords: ["settlement", "settle", "funds"],
      source: "Northmark Merchant Guide 5.1 rev. 2026-04",
    },
  },
  {
    id: "b-dispute-fee",
    domain: "billing",
    kind: "drift",
    difficulty: "medium",
    // "disputed transaction" in the question, "chargeback" in the store.
    question: "What does a disputed transaction cost a Northmark merchant?",
    kbSnippet:
      "Northmark Payments Merchant Guide 7.3 (Chargebacks). The chargeback fee is EUR 15 per case.",
    mustInclude: ["25"],
    mustExclude: ["15"],
    contaminationPhrases: [],
    correction: {
      wrong: "The chargeback fee is EUR 15 per case",
      correct: "The chargeback fee is EUR 25 per case",
      keywords: ["chargeback", "chargeback fee", "dispute"],
      source: "Northmark Merchant Guide 7.3 rev. 2026-02",
    },
  },
  {
    id: "b-payout-multifact",
    domain: "billing",
    kind: "multifact",
    difficulty: "hard",
    question:
      "How often are Northmark payouts sent, and what is the minimum payout amount?",
    kbSnippet:
      "Northmark Payments Merchant Guide 5.6 (Payouts). Payouts are sent weekly. " +
      "The minimum payout amount is EUR 50.",
    mustInclude: ["daily|every day|each day", "50"],
    mustExclude: ["weekly", "once a week"],
    contaminationPhrases: [],
    correction: {
      wrong: "Payouts are sent weekly",
      correct: "Payouts are sent daily",
      keywords: ["payout", "payouts", "sent"],
      source: "Northmark Merchant Guide 5.6 rev. 2026-04",
    },
  },
  {
    id: "b-currency-control",
    domain: "billing",
    kind: "control",
    difficulty: "easy",
    question: "Which currency does Northmark Payments settle in by default?",
    kbSnippet:
      "Northmark Payments Merchant Guide 5.2 (Settlement). Default settlement currency is the euro.",
    mustInclude: ["euro|euros|eur"],
    mustExclude: [],
    contaminationPhrases: ["t 1", "25", "daily"],
  },
  {
    id: "b-partial-refund-control",
    domain: "billing",
    kind: "control",
    difficulty: "hard",
    // A correction exists for the *full* refund window. Partial refunds
    // are unchanged.
    question: "How many partial refunds can a Northmark merchant issue against one transaction?",
    kbSnippet:
      "Northmark Payments Merchant Guide 8.4 (Refunds). Up to 4 partial refunds may be issued against a single transaction.",
    mustInclude: ["4"],
    mustExclude: [],
    contaminationPhrases: ["180 days", "90 days"],
  },

  // ----------------------------------------------------------------- support
  {
    id: "s-sla-response",
    domain: "support",
    kind: "drift",
    difficulty: "easy",
    question: "What is the first-response SLA on a Lumen Desk priority ticket?",
    kbSnippet:
      "Lumen Desk Service Terms 2.2 (SLA). Priority tickets receive a first response within 24 hours.",
    mustInclude: ["4 hours|four hours"],
    mustExclude: ["24 hours", "twenty-four hours"],
    contaminationPhrases: [],
    correction: {
      wrong: "Priority tickets receive a first response within 24 hours",
      correct: "Priority tickets receive a first response within 4 hours",
      keywords: ["sla", "first response", "priority ticket"],
      source: "Lumen Desk Service Terms 2.2 rev. 2026-05",
    },
  },
  {
    id: "s-deleted-ticket-retention",
    domain: "support",
    kind: "drift",
    difficulty: "medium",
    // "keep deleted tickets" in the question, "retention" in the store.
    question: "How long does Lumen Desk keep a ticket after a customer deletes it?",
    kbSnippet:
      "Lumen Desk Service Terms 9.1 (Data). Deleted ticket retention is 30 days.",
    mustInclude: ["90 days|ninety days"],
    mustExclude: ["30 days", "thirty days"],
    contaminationPhrases: [],
    correction: {
      wrong: "Deleted ticket retention is 30 days",
      correct: "Deleted ticket retention is 90 days",
      keywords: ["retention", "deleted ticket", "data retention"],
      source: "Lumen Desk Service Terms 9.1 rev. 2026-03",
    },
  },
  {
    id: "s-plan-multifact",
    domain: "support",
    kind: "multifact",
    difficulty: "hard",
    question:
      "On the Lumen Desk Team plan, how many agent seats are included and how much file storage?",
    kbSnippet:
      "Lumen Desk Plans 1.3 (Team). The Team plan includes 25 agent seats. " +
      "The Team plan includes 100 GB of file storage.",
    mustInclude: ["50", "100 gb"],
    mustExclude: ["25 agent seats", "25 seats"],
    contaminationPhrases: [],
    correction: {
      wrong: "The Team plan includes 25 agent seats",
      correct: "The Team plan includes 50 agent seats",
      keywords: ["agent seats", "seats", "team plan"],
      source: "Lumen Desk Plans 1.3 rev. 2026-04",
    },
  },
  {
    id: "s-status-page-control",
    domain: "support",
    kind: "control",
    difficulty: "easy",
    question: "Where does Lumen Desk publish incident updates?",
    kbSnippet:
      "Lumen Desk Service Terms 3.5 (Incidents). Incident updates are published on the Lumen Desk status page.",
    mustInclude: ["status page"],
    mustExclude: [],
    contaminationPhrases: ["4 hours", "90 days", "50"],
  },
  {
    id: "s-csv-export-control",
    domain: "support",
    kind: "control",
    difficulty: "hard",
    // A correction exists for the *API* rate limit. CSV export is
    // unchanged.
    question: "How many tickets can be included in a single Lumen Desk CSV export?",
    kbSnippet:
      "Lumen Desk Service Terms 6.7 (Exports). A single CSV export may contain up to 5000 tickets.",
    mustInclude: ["5000|5,000"],
    mustExclude: [],
    contaminationPhrases: ["600 requests", "120 requests"],
  },
];

/**
 * Corrections for facts nobody asks about, in the same vocabulary as the
 * cases above. Some are the near-neighbours the `hard` controls are meant
 * to attract.
 */
export const distractorCorrections: Array<{
  domain: MatrixCase["domain"];
  wrong: string;
  correct: string;
  keywords: string[];
  source: string;
}> = [
  {
    domain: "handbook",
    wrong: "Paid leave is capped at 22 days per year",
    correct: "Paid leave is capped at 28 days per year",
    keywords: ["paid leave", "leave", "annual leave"],
    source: "Verity Rail Handbook 4.1 rev. 2026-01",
  },
  {
    domain: "handbook",
    wrong: "Safety boots are replaced every 3 years",
    correct: "Safety boots are replaced every 2 years",
    keywords: ["safety boots", "boots", "ppe"],
    source: "Verity Rail Handbook 6.5 rev. 2026-02",
  },
  {
    domain: "handbook",
    wrong: "Night shift premium is 12 percent",
    correct: "Night shift premium is 18 percent",
    keywords: ["night shift", "premium", "shift premium"],
    source: "Verity Rail Handbook 3.4 rev. 2026-02",
  },
  {
    domain: "handbook",
    wrong: "Depot inductions run every quarter",
    correct: "Depot inductions run every month",
    keywords: ["induction", "depot induction"],
    source: "Verity Rail Handbook 2.7 rev. 2026-01",
  },
  {
    domain: "billing",
    wrong: "Full refunds may be issued within 90 days of the transaction",
    correct: "Full refunds may be issued within 180 days of the transaction",
    keywords: ["full refund", "refund window", "refund"],
    source: "Northmark Merchant Guide 8.1 rev. 2026-03",
  },
  {
    domain: "billing",
    wrong: "The monthly gateway fee is EUR 29",
    correct: "The monthly gateway fee is EUR 19",
    keywords: ["gateway fee", "monthly fee"],
    source: "Northmark Merchant Guide 4.2 rev. 2026-02",
  },
  {
    domain: "billing",
    wrong: "Merchant onboarding review takes 5 working days",
    correct: "Merchant onboarding review takes 2 working days",
    keywords: ["onboarding review", "merchant onboarding"],
    source: "Northmark Merchant Guide 2.1 rev. 2026-04",
  },
  {
    domain: "billing",
    wrong: "Statements are issued on the 1st of the month",
    correct: "Statements are issued on the 5th of the month",
    keywords: ["statement", "statements"],
    source: "Northmark Merchant Guide 6.3 rev. 2026-01",
  },
  {
    domain: "support",
    wrong: "The API rate limit is 120 requests per minute",
    correct: "The API rate limit is 600 requests per minute",
    keywords: ["api rate limit", "rate limit", "api"],
    source: "Lumen Desk Service Terms 7.2 rev. 2026-05",
  },
  {
    domain: "support",
    wrong: "Sandbox environments are reset every 30 days",
    correct: "Sandbox environments are reset every 7 days",
    keywords: ["sandbox", "reset"],
    source: "Lumen Desk Service Terms 8.3 rev. 2026-02",
  },
  {
    domain: "support",
    wrong: "The Starter plan includes 3 agent seats",
    correct: "The Starter plan includes 5 agent seats",
    keywords: ["starter plan", "agent seats"],
    source: "Lumen Desk Plans 1.1 rev. 2026-04",
  },
  {
    domain: "support",
    wrong: "Webhook retries stop after 3 attempts",
    correct: "Webhook retries stop after 8 attempts",
    keywords: ["webhook", "retries"],
    source: "Lumen Desk Service Terms 7.6 rev. 2026-03",
  },
];

/**
 * Corrections stated the way a user actually states them, for the
 * cross-provider transfer test: one provider extracts the structured
 * correction from the utterance, a different provider has to apply it.
 */
export const transferCases: Array<{
  id: string;
  domain: MatrixCase["domain"];
  userMessage: string;
  previousAnswer: string;
  question: string;
  kbSnippet: string;
  mustInclude: string[];
  mustExclude: string[];
}> = [
  {
    id: "t-inspection-interval",
    domain: "handbook",
    previousAnswer: "Rolling stock is inspected every 12 months.",
    userMessage:
      "That is out of date. Rolling stock is inspected every 6 months now, see Verity Rail Handbook 5.2.",
    question: "How often is Verity Rail rolling stock inspected?",
    kbSnippet:
      "Verity Rail Handbook 5.2 (Maintenance). Rolling stock is inspected every 12 months.",
    mustInclude: ["6 months|six months"],
    mustExclude: ["12 months", "twelve months"],
  },
  {
    id: "t-payment-retry",
    domain: "billing",
    previousAnswer: "A failed card payment is retried 2 times.",
    userMessage:
      "No, that changed. A failed card payment is retried 4 times, per Northmark Merchant Guide 9.5.",
    question: "How many times does Northmark retry a failed card payment?",
    kbSnippet:
      "Northmark Payments Merchant Guide 9.5 (Retries). A failed card payment is retried 2 times.",
    mustInclude: ["4 times|four times"],
    mustExclude: ["2 times", "two times"],
  },
];
