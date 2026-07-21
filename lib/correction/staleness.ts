import { correctionRecordSchema, type CorrectionRecord } from "@/lib/correction/schema";

export interface SourceHashProvider {
  getCurrentHash(sourceRef: string): Promise<string | null>;
}

export function isExpired(correction: CorrectionRecord, now: Date = new Date()): boolean {
  if (!correction.expiresAt) return false;
  return new Date(correction.expiresAt).getTime() < now.getTime();
}

export function detectConflict(
  existing: CorrectionRecord,
  incoming: { wrongPattern: string; correctAnswer: string },
): boolean {
  if (existing.status !== "active") return false;
  const sameTopic =
    existing.correctAnswer.toLowerCase() === incoming.wrongPattern.toLowerCase() ||
    existing.wrongPattern.toLowerCase() === incoming.correctAnswer.toLowerCase();
  const differentAnswer =
    existing.correctAnswer.toLowerCase() !== incoming.correctAnswer.toLowerCase();
  return sameTopic && differentAnswer;
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
