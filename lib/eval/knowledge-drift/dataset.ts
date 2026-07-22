/**
 * Knowledge-drift benchmark dataset.
 *
 * The scenario this benchmark measures is the one MemoSprout claims to
 * solve: a retrieval corpus has gone stale, a human corrected the answer
 * once, and every later question about that fact must come back correct.
 *
 * Design constraints that keep the measurement honest:
 *
 * - The corpus is a fictional company, so no model can recover the
 *   current fact from pretraining. Baseline failure comes from the stale
 *   snippet alone, not from trivia the model happens to lack.
 * - `control` cases carry a *current* snippet and no correction. They
 *   measure whether MemoSprout degrades answers it should not touch.
 * - `distractorCorrections` fill the store with same-vocabulary noise, so
 *   retrieval has to discriminate rather than return the only record it
 *   has.
 */
import { z } from "zod";

export const driftCaseSchema = z
  .object({
    id: z.string().min(1),
    /**
     * `drift`: the snippet is stale and a correction exists.
     * `control`: the snippet is current and no correction applies.
     */
    kind: z.enum(["drift", "control"]),
    question: z.string().min(1),
    /** The passage a RAG pipeline retrieves for this question. */
    kbSnippet: z.string().min(1),
    /** Oracle: every entry must appear. `a|b` means "a or b". */
    mustInclude: z.array(z.string().min(1)).min(1),
    /** Oracle: no entry may appear. */
    mustExclude: z.array(z.string().min(1)),
    /** Present on drift cases only: the correction seeded before the run. */
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
  .refine((testCase) => (testCase.kind === "drift") === (testCase.correction !== undefined), {
    message: "drift cases require a correction; control cases must not have one",
  });

export type DriftCase = z.infer<typeof driftCaseSchema>;

export const benchmarkDomain = "handbook";

/**
 * Calyx Freight is fictional. Every fact below exists only in this file.
 */
export const driftCases: DriftCase[] = [
  {
    id: "annual-leave",
    kind: "drift",
    question: "How many days of annual leave does a full-time Calyx Freight employee get?",
    kbSnippet:
      "Calyx Freight Handbook, section 4.1 (Leave). Full-time employees accrue 12 days of annual leave per calendar year.",
    mustInclude: ["18 days|eighteen days"],
    mustExclude: ["12 days", "twelve days"],
    correction: {
      wrong: "Full-time employees accrue 12 days of annual leave per year",
      correct:
        "Full-time employees accrue 18 days of annual leave per year, effective 1 January 2026",
      keywords: ["annual leave", "leave", "vacation", "days off"],
      source: "Handbook 4.1 rev. 2026-01",
    },
  },
  {
    id: "probation-period",
    kind: "drift",
    question: "How long is the probation period for a new hire?",
    kbSnippet:
      "Calyx Freight Handbook, section 2.3 (Onboarding). New hires serve a probation period of 3 months.",
    mustInclude: ["6 months|six months"],
    mustExclude: ["3 months", "three months"],
    correction: {
      wrong: "New hires serve a probation period of 3 months",
      correct: "New hires serve a probation period of 6 months",
      keywords: ["probation", "new hire", "onboarding"],
      source: "Handbook 2.3 rev. 2026-01",
    },
  },
  {
    id: "expense-window",
    kind: "drift",
    question: "How long do I have to submit an expense claim after the purchase date?",
    kbSnippet:
      "Calyx Freight Handbook, section 7.2 (Expenses). Expense claims must be submitted within 30 days of the purchase date.",
    mustInclude: ["45 days|forty-five days"],
    mustExclude: ["30 days", "thirty days"],
    correction: {
      wrong: "Expense claims must be submitted within 30 days of the purchase date",
      correct: "Expense claims must be submitted within 45 days of the purchase date",
      keywords: ["expense", "claim", "reimbursement", "submit"],
      source: "Finance Policy FP-12",
    },
  },
  {
    id: "mileage-rate",
    kind: "drift",
    question: "What is the mileage reimbursement rate per kilometre for using my own car?",
    kbSnippet:
      "Calyx Freight Handbook, section 7.4 (Travel). Private car use is reimbursed at EUR 0.58 per kilometre.",
    mustInclude: ["0.67"],
    mustExclude: ["0.58"],
    correction: {
      wrong: "Private car use is reimbursed at EUR 0.58 per kilometre",
      correct: "Private car use is reimbursed at EUR 0.67 per kilometre",
      keywords: ["mileage", "kilometre", "private car", "reimbursed"],
      source: "Finance Policy FP-14",
    },
  },
  {
    id: "per-diem",
    kind: "drift",
    question: "What is the domestic per diem allowance for an overnight trip?",
    kbSnippet:
      "Calyx Freight Handbook, section 7.5 (Travel). The domestic per diem allowance is EUR 45 per overnight stay.",
    mustInclude: ["60"],
    mustExclude: ["45"],
    correction: {
      wrong: "The domestic per diem allowance is EUR 45 per overnight stay",
      correct: "The domestic per diem allowance is EUR 60 per overnight stay",
      keywords: ["per diem", "allowance", "overnight", "domestic"],
      source: "Finance Policy FP-15",
    },
  },
  {
    id: "laptop-refresh",
    kind: "drift",
    question: "How often is a company laptop replaced?",
    kbSnippet:
      "Calyx Freight Handbook, section 9.1 (IT Equipment). Company laptops are replaced on a 4-year refresh cycle.",
    mustInclude: ["3 year|three year|3 years|three years"],
    mustExclude: ["4 year", "four year", "4 years", "four years"],
    correction: {
      wrong: "Company laptops are replaced on a 4-year refresh cycle",
      correct: "Company laptops are replaced on a 3-year refresh cycle",
      keywords: ["laptop", "refresh", "replaced", "equipment"],
      source: "IT Policy IT-07",
    },
  },
  {
    id: "overtime-threshold",
    kind: "drift",
    question: "At how many overtime hours per month do I need written manager approval?",
    kbSnippet:
      "Calyx Freight Handbook, section 3.6 (Working Time). Written manager approval is required beyond 10 overtime hours per month.",
    mustInclude: ["6 overtime hours|6 hours|six hours"],
    mustExclude: ["10 overtime hours", "10 hours", "ten hours"],
    correction: {
      wrong: "Written manager approval is required beyond 10 overtime hours per month",
      correct: "Written manager approval is required beyond 6 overtime hours per month",
      keywords: ["overtime", "approval", "working time"],
      source: "Handbook 3.6 rev. 2026-02",
    },
  },
  {
    id: "parental-leave",
    kind: "drift",
    question: "How many weeks of paid parental leave does Calyx Freight offer?",
    kbSnippet:
      "Calyx Freight Handbook, section 4.5 (Leave). Paid parental leave is 8 weeks.",
    mustInclude: ["16 weeks|sixteen weeks"],
    mustExclude: ["8 weeks", "eight weeks"],
    correction: {
      wrong: "Paid parental leave is 8 weeks",
      correct: "Paid parental leave is 16 weeks",
      keywords: ["parental leave", "paid leave", "weeks"],
      source: "Handbook 4.5 rev. 2026-01",
    },
  },
  {
    id: "remote-days",
    kind: "drift",
    question: "How many days per week may office staff work remotely?",
    kbSnippet:
      "Calyx Freight Handbook, section 3.2 (Ways of Working). Office staff may work remotely 2 days per week.",
    mustInclude: ["3 days|three days"],
    mustExclude: ["2 days", "two days"],
    correction: {
      wrong: "Office staff may work remotely 2 days per week",
      correct: "Office staff may work remotely 3 days per week",
      keywords: ["remote", "work from home", "hybrid", "days per week"],
      source: "Handbook 3.2 rev. 2026-03",
    },
  },
  {
    id: "payment-terms",
    kind: "drift",
    question: "What are the standard payment terms on a Calyx Freight customer invoice?",
    kbSnippet:
      "Calyx Freight Handbook, section 8.1 (Billing). Standard customer invoices carry net 60 payment terms.",
    mustInclude: ["net 30|30 day"],
    mustExclude: ["net 60", "60 day"],
    correction: {
      wrong: "Standard customer invoices carry net 60 payment terms",
      correct: "Standard customer invoices carry net 30 payment terms",
      keywords: ["payment terms", "invoice", "billing", "net"],
      source: "Billing Policy BP-03",
    },
  },
  {
    id: "claim-window",
    kind: "drift",
    question: "How long does a customer have to file a freight damage claim?",
    kbSnippet:
      "Calyx Freight Handbook, section 11.4 (Claims). Freight damage claims must be filed within 9 months of delivery.",
    mustInclude: ["12 months|twelve months"],
    mustExclude: ["9 months", "nine months"],
    correction: {
      wrong: "Freight damage claims must be filed within 9 months of delivery",
      correct: "Freight damage claims must be filed within 12 months of delivery",
      keywords: ["claim", "damage", "filed", "delivery"],
      source: "Claims Policy CL-02",
    },
  },
  {
    id: "ltl-discount",
    kind: "drift",
    question: "What is the minimum shipment weight to qualify for the LTL volume discount?",
    kbSnippet:
      "Calyx Freight Handbook, section 10.2 (Pricing). The LTL volume discount applies from 500 kg per shipment.",
    mustInclude: ["300"],
    mustExclude: ["500"],
    correction: {
      wrong: "The LTL volume discount applies from 500 kg per shipment",
      correct: "The LTL volume discount applies from 300 kg per shipment",
      keywords: ["ltl", "volume discount", "shipment weight", "minimum"],
      source: "Pricing Policy PR-09",
    },
  },
  {
    id: "fuel-surcharge",
    kind: "drift",
    question: "How often is the fuel surcharge recalculated?",
    kbSnippet:
      "Calyx Freight Handbook, section 10.5 (Pricing). The fuel surcharge is recalculated quarterly.",
    mustInclude: ["monthly|each month|every month"],
    mustExclude: ["quarterly", "every quarter"],
    correction: {
      wrong: "The fuel surcharge is recalculated quarterly",
      correct: "The fuel surcharge is recalculated monthly",
      keywords: ["fuel surcharge", "recalculated", "surcharge"],
      source: "Pricing Policy PR-11",
    },
  },
  {
    id: "temperature-log",
    kind: "drift",
    question: "How often must cold-chain warehouse temperatures be logged?",
    kbSnippet:
      "Calyx Freight Handbook, section 12.3 (Warehouse). Cold-chain temperatures are logged every 4 hours.",
    mustInclude: ["every 2 hours|2 hours|two hours"],
    mustExclude: ["every 4 hours", "4 hours", "four hours"],
    correction: {
      wrong: "Cold-chain temperatures are logged every 4 hours",
      correct: "Cold-chain temperatures are logged every 2 hours",
      keywords: ["temperature", "cold chain", "logged", "warehouse"],
      source: "Warehouse SOP WH-05",
    },
  },
  {
    id: "driver-rest",
    kind: "drift",
    question: "After how many hours of driving must a driver take a rest break?",
    kbSnippet:
      "Calyx Freight Handbook, section 13.1 (Drivers). Drivers take a mandatory rest break after 5 hours of driving.",
    mustInclude: ["4 hours|four hours"],
    mustExclude: ["5 hours", "five hours"],
    correction: {
      wrong: "Drivers take a mandatory rest break after 5 hours of driving",
      correct: "Drivers take a mandatory rest break after 4 hours of driving",
      keywords: ["driver", "rest break", "driving hours"],
      source: "Driver SOP DR-01",
    },
  },
  {
    id: "badge-renewal",
    kind: "drift",
    question: "How often must a site security badge be renewed?",
    kbSnippet:
      "Calyx Freight Handbook, section 14.2 (Security). Site security badges are renewed every 24 months.",
    mustInclude: ["12 months|twelve months|every year|annually"],
    mustExclude: ["24 months", "twenty-four months"],
    correction: {
      wrong: "Site security badges are renewed every 24 months",
      correct: "Site security badges are renewed every 12 months",
      keywords: ["badge", "security", "renewed"],
      source: "Security Policy SEC-04",
    },
  },
  {
    id: "password-rotation",
    kind: "drift",
    question: "How often do employees have to change their password?",
    kbSnippet:
      "Calyx Freight Handbook, section 9.6 (IT Security). Employees must change their password every 90 days.",
    mustInclude: ["no longer|not required|only|breach|suspect"],
    mustExclude: ["every 90 days", "90 days"],
    correction: {
      wrong: "Employees must change their password every 90 days",
      correct:
        "Scheduled password rotation is no longer required; passwords are changed only on suspected compromise",
      keywords: ["password", "rotation", "change password"],
      source: "IT Policy IT-11",
    },
  },
  {
    id: "incident-report",
    kind: "drift",
    question: "What is the deadline for filing a workplace incident report?",
    kbSnippet:
      "Calyx Freight Handbook, section 15.1 (Safety). Workplace incident reports are filed within 72 hours.",
    mustInclude: ["24 hours|twenty-four hours"],
    mustExclude: ["72 hours", "seventy-two hours"],
    correction: {
      wrong: "Workplace incident reports are filed within 72 hours",
      correct: "Workplace incident reports are filed within 24 hours",
      keywords: ["incident report", "incident", "safety", "deadline"],
      source: "Safety Policy SA-02",
    },
  },
  {
    id: "vendor-approvals",
    kind: "drift",
    question: "How many approvers does a new vendor need before onboarding?",
    kbSnippet:
      "Calyx Freight Handbook, section 8.7 (Procurement). New vendors require 2 approvers before onboarding.",
    mustInclude: ["3 approvers|three approvers"],
    mustExclude: ["2 approvers", "two approvers"],
    correction: {
      wrong: "New vendors require 2 approvers before onboarding",
      correct: "New vendors require 3 approvers before onboarding",
      keywords: ["vendor", "approvers", "procurement", "onboarding"],
      source: "Procurement Policy PC-06",
    },
  },
  {
    id: "training-hours",
    kind: "drift",
    question: "How many training hours per year is each employee expected to complete?",
    kbSnippet:
      "Calyx Freight Handbook, section 5.3 (Development). Each employee completes 16 training hours per year.",
    mustInclude: ["24 training hours|24 hours|twenty-four hours"],
    mustExclude: ["16 training hours", "16 hours", "sixteen hours"],
    correction: {
      wrong: "Each employee completes 16 training hours per year",
      correct: "Each employee completes 24 training hours per year",
      keywords: ["training hours", "training", "development"],
      source: "Handbook 5.3 rev. 2026-02",
    },
  },

  // Control cases: the snippet is current, no correction applies. A
  // healthy system answers these exactly as the baseline does.
  {
    id: "control-office-hours",
    kind: "control",
    question: "What are the opening hours of the Calyx Freight head office?",
    kbSnippet:
      "Calyx Freight Handbook, section 1.2 (Offices). The head office is open from 08:00 to 17:00 on weekdays.",
    mustInclude: ["08:00|8:00|8 am", "17:00|5:00|5 pm"],
    mustExclude: [],
  },
  {
    id: "control-hq-location",
    kind: "control",
    question: "Where is the Calyx Freight head office located?",
    kbSnippet:
      "Calyx Freight Handbook, section 1.1 (Offices). The head office is located in Rotterdam, the Netherlands.",
    mustInclude: ["rotterdam"],
    mustExclude: [],
  },
  {
    id: "control-po-approver",
    kind: "control",
    question: "Who approves a purchase order above EUR 10,000?",
    kbSnippet:
      "Calyx Freight Handbook, section 8.4 (Procurement). Purchase orders above EUR 10,000 are approved by the Finance Director.",
    mustInclude: ["finance director"],
    mustExclude: [],
  },
  {
    id: "control-safety-hotline",
    kind: "control",
    question: "What number do I call to report an urgent safety hazard?",
    kbSnippet:
      "Calyx Freight Handbook, section 15.4 (Safety). Urgent safety hazards are reported to the safety hotline on extension 4400.",
    mustInclude: ["4400"],
    mustExclude: [],
  },
  {
    id: "control-meeting-room",
    kind: "control",
    question: "How do I book a meeting room at the head office?",
    kbSnippet:
      "Calyx Freight Handbook, section 1.6 (Offices). Meeting rooms are booked through the Deskly portal.",
    mustInclude: ["deskly"],
    mustExclude: [],
  },
  {
    id: "control-uniform",
    kind: "control",
    question: "Who is required to wear high-visibility clothing on site?",
    kbSnippet:
      "Calyx Freight Handbook, section 12.1 (Warehouse). Everyone entering the warehouse floor wears high-visibility clothing, including visitors.",
    mustInclude: ["visitors|visitor"],
    mustExclude: [],
  },
];

/**
 * Same-vocabulary corrections for facts nobody asks about in this run.
 * Their only job is to make retrieval choose, not merely return.
 */
export const distractorCorrections: Array<{
  wrong: string;
  correct: string;
  keywords: string[];
  source: string;
}> = [
  {
    wrong: "Unused annual leave expires on 31 December",
    correct: "Unused annual leave carries over until 31 March of the following year",
    keywords: ["leave carryover", "expires", "unused leave"],
    source: "Handbook 4.2 rev. 2026-01",
  },
  {
    wrong: "Sick leave requires a doctor's note from day 1",
    correct: "Sick leave requires a doctor's note from day 3",
    keywords: ["sick leave", "doctor", "note"],
    source: "Handbook 4.7 rev. 2026-01",
  },
  {
    wrong: "Study leave is capped at 2 days per year",
    correct: "Study leave is capped at 5 days per year",
    keywords: ["study leave", "exam"],
    source: "Handbook 5.6 rev. 2026-02",
  },
  {
    wrong: "Expense claims under EUR 25 need no receipt",
    correct: "Expense claims under EUR 15 need no receipt",
    keywords: ["receipt", "small expense"],
    source: "Finance Policy FP-13",
  },
  {
    wrong: "International per diem is EUR 70 per overnight stay",
    correct: "International per diem is EUR 95 per overnight stay",
    keywords: ["international per diem", "abroad"],
    source: "Finance Policy FP-16",
  },
  {
    wrong: "Rail travel is booked in first class for trips above 3 hours",
    correct: "Rail travel is booked in second class regardless of trip length",
    keywords: ["rail", "train", "class"],
    source: "Finance Policy FP-18",
  },
  {
    wrong: "Hotel bookings are capped at EUR 140 per night",
    correct: "Hotel bookings are capped at EUR 175 per night",
    keywords: ["hotel", "accommodation", "per night"],
    source: "Finance Policy FP-19",
  },
  {
    wrong: "Company phones are replaced every 2 years",
    correct: "Company phones are replaced every 4 years",
    keywords: ["phone", "mobile", "replaced"],
    source: "IT Policy IT-08",
  },
  {
    wrong: "Monitors are issued one per desk",
    correct: "Monitors are issued two per desk",
    keywords: ["monitor", "desk", "issued"],
    source: "IT Policy IT-09",
  },
  {
    wrong: "Software requests are approved by the line manager",
    correct: "Software requests are approved by the IT security lead",
    keywords: ["software request", "approval", "install"],
    source: "IT Policy IT-12",
  },
  {
    wrong: "VPN access is granted to all employees by default",
    correct: "VPN access is granted on request and reviewed every 6 months",
    keywords: ["vpn", "access"],
    source: "IT Policy IT-14",
  },
  {
    wrong: "Supplier invoices are paid on the 15th of the month",
    correct: "Supplier invoices are paid on the last working day of the month",
    keywords: ["supplier invoice", "paid", "payment run"],
    source: "Billing Policy BP-05",
  },
  {
    wrong: "Credit notes are issued within 10 working days",
    correct: "Credit notes are issued within 5 working days",
    keywords: ["credit note", "issued"],
    source: "Billing Policy BP-07",
  },
  {
    wrong: "Late payment interest is charged at 4% per annum",
    correct: "Late payment interest is charged at 8% per annum",
    keywords: ["late payment", "interest"],
    source: "Billing Policy BP-08",
  },
  {
    wrong: "Pallet exchange is offered on all domestic routes",
    correct: "Pallet exchange is offered only on contracted domestic routes",
    keywords: ["pallet exchange", "pallets"],
    source: "Warehouse SOP WH-07",
  },
  {
    wrong: "Stock counts are performed twice per year",
    correct: "Stock counts are performed four times per year",
    keywords: ["stock count", "inventory count"],
    source: "Warehouse SOP WH-09",
  },
  {
    wrong: "Forklift certification is valid for 5 years",
    correct: "Forklift certification is valid for 3 years",
    keywords: ["forklift", "certification"],
    source: "Warehouse SOP WH-11",
  },
  {
    wrong: "Dangerous goods shipments need 24 hours notice",
    correct: "Dangerous goods shipments need 48 hours notice",
    keywords: ["dangerous goods", "adr", "notice"],
    source: "Compliance Policy CO-03",
  },
  {
    wrong: "Customs paperwork is retained for 3 years",
    correct: "Customs paperwork is retained for 7 years",
    keywords: ["customs", "retention", "paperwork"],
    source: "Compliance Policy CO-05",
  },
  {
    wrong: "Subcontracted carriers are audited every 3 years",
    correct: "Subcontracted carriers are audited every year",
    keywords: ["subcontractor", "carrier audit"],
    source: "Compliance Policy CO-08",
  },
];
