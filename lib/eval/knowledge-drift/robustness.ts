import { z } from "zod";

/**
 * Fresh query formulations for the release-readiness retrieval check.
 *
 * These are deliberately kept outside the correction dataset: the stored
 * correction wording was not authored against these questions. The lexical
 * set uses realistic synonyms that a correction author supplied as trigger
 * keywords. The semantic set avoids those triggers and is diagnostic only;
 * MemoSprout's deterministic retriever does not claim embedding-style recall.
 */
export const retrievalProbeSchema = z.object({
  caseId: z.string().min(1),
  lexical: z.string().min(1),
  semantic: z.string().min(1),
}).strict();

export type RetrievalProbe = z.infer<typeof retrievalProbeSchema>;

export const retrievalProbes: RetrievalProbe[] = [
  {
    caseId: "annual-leave",
    lexical: "How much vacation time does a full-time employee receive?",
    semantic: "What holiday entitlement do permanent staff receive?",
  },
  {
    caseId: "probation-period",
    lexical: "What is the onboarding probation for a newcomer?",
    semantic: "How long are newly recruited people on trial?",
  },
  {
    caseId: "expense-window",
    lexical: "What is the reimbursement claim submission window?",
    semantic: "Until when may staff lodge spending paperwork?",
  },
  {
    caseId: "mileage-rate",
    lexical: "How much is reimbursed for using a private car?",
    semantic: "What do I receive per km when I drive my own vehicle?",
  },
  {
    caseId: "per-diem",
    lexical: "What is the domestic overnight allowance?",
    semantic: "How much meal money comes with a local night away?",
  },
  {
    caseId: "laptop-refresh",
    lexical: "When is company laptop equipment refreshed?",
    semantic: "How frequently are employee computers swapped out?",
  },
  {
    caseId: "overtime-threshold",
    lexical: "When does overtime need manager approval?",
    semantic: "At what extra-work limit is written sign-off mandatory?",
  },
  {
    caseId: "parental-leave",
    lexical: "What is the paid parental leave entitlement?",
    semantic: "How long can a new parent stay home on salary?",
  },
  {
    caseId: "remote-days",
    lexical: "What is the hybrid work allowance each week?",
    semantic: "How often may office staff do their job from home?",
  },
  {
    caseId: "payment-terms",
    lexical: "Which net payment terms apply to a customer invoice?",
    semantic: "When is money due after we bill a client?",
  },
  {
    caseId: "claim-window",
    lexical: "What is the deadline after delivery for a damage claim?",
    semantic: "How long may a customer report freight harm?",
  },
  {
    caseId: "ltl-discount",
    lexical: "Which shipment weight unlocks the LTL volume discount?",
    semantic: "At what load size does the cheaper freight price begin?",
  },
  {
    caseId: "fuel-surcharge",
    lexical: "When is the fuel surcharge recalculated?",
    semantic: "How often do we revise the diesel fee?",
  },
  {
    caseId: "temperature-log",
    lexical: "What is the cold chain warehouse temperature logging interval?",
    semantic: "How frequently must chilled storage readings be recorded?",
  },
  {
    caseId: "driver-rest",
    lexical: "When is a rest break due for a driver?",
    semantic: "After what time behind the wheel must someone pause?",
  },
  {
    caseId: "badge-renewal",
    lexical: "What is the security badge renewal interval?",
    semantic: "How frequently must an access credential be replaced?",
  },
  {
    caseId: "password-rotation",
    lexical: "What is the password rotation rule?",
    semantic: "When must employees choose a new login secret?",
  },
  {
    caseId: "incident-report",
    lexical: "What is the safety incident report deadline?",
    semantic: "How soon must an injury at work be formally recorded?",
  },
  {
    caseId: "vendor-approvals",
    lexical: "How many procurement approvals are needed for supplier onboarding?",
    semantic: "How many people must sign off before a new seller is accepted?",
  },
  {
    caseId: "training-hours",
    lexical: "What is the annual development training requirement?",
    semantic: "How much learning must each worker complete in a year?",
  },
];

/**
 * Queries that share numbers or broad business words with the corpus but do
 * not ask about any corrected fact. They expose over-broad retrieval.
 */
export const irrelevantQueries = [
  "How many days does an ordinary parcel delivery take?",
  "Who approves the annual office party budget?",
  "Where can I find the employee training room?",
  "Can visitors use a private car park at the head office?",
  "What is the customer support telephone number?",
  "How do I replace a lost warehouse locker key?",
  "Which currency does the expense portal display?",
  "When is the monthly all-hands meeting?",
  "Do suppliers receive a security questionnaire?",
  "What temperature is the Rotterdam office kept at?",
] as const;

/**
 * Post-change holdout frozen after the retrieval matcher was implemented.
 * These queries were not inspected against matcher output while tuning it.
 * Do not change the matcher in response to this set: failures are release
 * evidence, not new training examples.
 */
export const postChangeHoldoutIrrelevantQueries = [
  "Where will the annual general meeting be held?",
  "Can visitors reserve a space in the company car park?",
  "Where is the staff training calendar published?",
  "Who administers the customer expense portal?",
  "What is the monthly rent for the head office?",
  "When does the warehouse close each day?",
  "Which employee chairs the workplace safety committee?",
  "May a supplier enter through the visitor entrance?",
  "Does the office provide a room for nursing parents?",
  "Where can I order a protective sleeve for my laptop?",
  "What is the password for the guest Wi-Fi network?",
  "Who maintains the public incident status page?",
] as const;
