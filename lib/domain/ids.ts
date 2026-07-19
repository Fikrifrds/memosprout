import { createHash } from "node:crypto";

export const idPrefixes = {
  agentRun: "run",
  humanCorrection: "correction",
  correctedOutcome: "outcome",
  deterministicEvidence: "evidence",
  candidateSprout: "sprout",
  auditEntry: "audit",
  reflexRule: "reflex",
} as const;

export type IdPrefix = (typeof idPrefixes)[keyof typeof idPrefixes];

export function createDeterministicId(prefix: IdPrefix, value: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")
    .slice(0, 16);

  return `${prefix}_${digest}`;
}
