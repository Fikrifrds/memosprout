import { correctionRecordSchema, type CorrectionRecord } from "@/lib/correction/schema";

export interface SourceHashProvider {
  getCurrentHash(sourceRef: string): Promise<string | null>;
}

export function isExpired(correction: CorrectionRecord, now: Date = new Date()): boolean {
  if (!correction.expiresAt) return false;
  return new Date(correction.expiresAt).getTime() < now.getTime();
}

/**
 * Does an incoming correction contradict an existing active one?
 *
 * Two shapes count as a conflict:
 * 1. Same wrong pattern, different correct answer — two answers claiming
 *    to fix the same mistake. Without this, both stay active and the AI
 *    is handed contradictory "verified" facts.
 * 2. Chained supersede — the existing correct answer is now the wrong
 *    pattern (or vice versa), with a different answer.
 */
export function detectConflict(
  existing: CorrectionRecord,
  incoming: { wrongPattern: string; correctAnswer: string },
): boolean {
  if (existing.status !== "active") return false;

  const existingWrong = existing.wrongPattern.toLowerCase();
  const existingCorrect = existing.correctAnswer.toLowerCase();
  const incomingWrong = incoming.wrongPattern.toLowerCase();
  const incomingCorrect = incoming.correctAnswer.toLowerCase();

  if (existingCorrect === incomingCorrect) return false;

  const sameWrongPattern = existingWrong === incomingWrong;
  const chainedSupersede =
    existingCorrect === incomingWrong || existingWrong === incomingCorrect;

  return sameWrongPattern || chainedSupersede;
}

export async function checkSourceChanged(
  correction: CorrectionRecord,
  provider: SourceHashProvider,
): Promise<boolean> {
  if (!correction.sourceHash || !correction.sourceRef) return false;
  const currentHash = await provider.getCurrentHash(correction.sourceRef);
  if (currentHash === null) return false;
  return currentHash !== correction.sourceHash;
}

export async function evaluateStaleness(
  correction: CorrectionRecord,
  options: {
    sourceHashProvider?: SourceHashProvider;
    now?: Date;
  } = {},
): Promise<CorrectionRecord> {
  const now = options.now ?? new Date();

  if (correction.status === "deprecated") return correction;

  if (isExpired(correction, now)) {
    return correctionRecordSchema.parse({
      ...correction,
      staleness: "expired",
      status: "quarantined",
    });
  }

  if (options.sourceHashProvider && correction.sourceHash && correction.sourceRef) {
    const changed = await checkSourceChanged(correction, options.sourceHashProvider);
    if (changed) {
      return correctionRecordSchema.parse({
        ...correction,
        staleness: "source_changed",
        status: "quarantined",
      });
    }
  }

  if (correction.staleness !== "fresh") {
    return correction;
  }

  return correctionRecordSchema.parse({
    ...correction,
    staleness: "fresh",
  });
}

export function findConflicts(
  activeCorrections: CorrectionRecord[],
  incoming: { wrongPattern: string; correctAnswer: string; domain: string },
): CorrectionRecord[] {
  return activeCorrections.filter(
    (existing) =>
      existing.domain === incoming.domain &&
      detectConflict(existing, incoming),
  );
}
