import { mkdir } from "node:fs/promises";

import type { DomainAdapter } from "@/lib/adapter/types";
import { CorrectionStore } from "@/lib/correction/store";
import { createDeterministicId } from "@/lib/domain/ids";
import {
  correctionRecordSchema,
  type CorrectionRecord,
} from "@/lib/correction/schema";

export const DEFAULT_CORRECTIONS_DIR = "corrections";

export interface InitResult {
  directory: string;
  created: boolean;
}

export async function commandInit(directory: string = DEFAULT_CORRECTIONS_DIR): Promise<InitResult> {
  await mkdir(directory, { recursive: true });
  return { directory, created: true };
}

export interface AddCorrectionInput {
  domain: string;
  wrongPattern: string;
  correctAnswer: string;
  keywords?: string[];
  entities?: string[];
  explanation?: string;
  sourceRef?: string;
  submittedBy?: string;
}

export async function commandAdd(
  store: CorrectionStore,
  input: AddCorrectionInput,
): Promise<CorrectionRecord> {
  const correctionId = createDeterministicId(
    "corr",
    `${input.domain}:${input.wrongPattern}:${input.correctAnswer}`,
  );

  const existing = store.get(correctionId);
  if (existing) {
    const updated = correctionRecordSchema.parse({
      ...existing,
      confirmCount: existing.confirmCount + 1,
    });
    await store.save(updated);
    return updated;
  }

  const correction = correctionRecordSchema.parse({
    correctionId,
    version: 1,
    status: "suggested",
    domain: input.domain,
    trigger: {
      keywords: input.keywords ?? [],
      entities: input.entities ?? [],
    },
    wrongPattern: input.wrongPattern,
    correctAnswer: input.correctAnswer,
    explanation: input.explanation ?? "",
    sourceRef: input.sourceRef ?? "",
    submittedBy: input.submittedBy ?? "cli",
    submittedAt: new Date().toISOString(),
    validatedBy: null,
    validatedAt: null,
    deprecatedAt: null,
    deprecatedReason: null,
    confirmCount: 0,
  });

  await store.save(correction);
  return correction;
}

export interface ListResult {
  corrections: CorrectionRecord[];
  total: number;
}

export function commandList(
  store: CorrectionStore,
  filter: { status?: string; domain?: string; keyword?: string } = {},
): ListResult {
  const corrections = store.list({
    status: filter.status as CorrectionRecord["status"] | undefined,
    domain: filter.domain,
    keyword: filter.keyword,
  });
  return { corrections, total: corrections.length };
}

export interface ValidateResult {
  correctionId: string;
  passed: boolean;
  detail: string;
  newStatus: string;
}

export async function commandValidate(
  store: CorrectionStore,
  adapter: DomainAdapter,
  correctionId: string,
): Promise<ValidateResult> {
  const correction = store.get(correctionId);
  if (!correction) {
    return {
      correctionId,
      passed: false,
      detail: `Correction "${correctionId}" not found.`,
      newStatus: "unknown",
    };
  }

  const oracle = adapter.createOracle(correction);
  const result = await oracle.evaluate(correction);

  const newStatus = result.passed ? "validated" : "quarantined";
  const updated = correctionRecordSchema.parse({
    ...correction,
    status: newStatus,
    validatedBy: result.passed ? oracle.id : null,
    validatedAt: result.passed ? new Date().toISOString() : null,
  });
  await store.save(updated);

  return {
    correctionId,
    passed: result.passed,
    detail: result.detail,
    newStatus,
  };
}

export interface ActivateResult {
  correctionId: string;
  previousStatus: string;
  newStatus: string;
}

export async function commandActivate(
  store: CorrectionStore,
  correctionId: string,
): Promise<ActivateResult> {
  const correction = store.get(correctionId);
  if (!correction) {
    throw new Error(`Correction "${correctionId}" not found.`);
  }
  if (correction.status !== "validated") {
    throw new Error(
      `Correction "${correctionId}" must be validated before activation (current: ${correction.status}).`,
    );
  }

  const updated = correctionRecordSchema.parse({
    ...correction,
    status: "active",
  });
  await store.save(updated);

  return {
    correctionId,
    previousStatus: correction.status,
    newStatus: "active",
  };
}

export interface CheckResult {
  blocked: boolean;
  warnings: string[];
  matchedCorrections: Array<{
    correctionId: string;
    correctAnswer: string;
    sourceRef: string;
  }>;
}

export function commandCheck(
  store: CorrectionStore,
  query: string,
  answer: string,
  domain?: string,
): CheckResult {
  const active = store.list({ status: "active", domain });

  const matchedCorrections = active
    .filter(
      (correction) =>
        answer.toLowerCase().includes(correction.wrongPattern.toLowerCase()),
    )
    .map((correction) => ({
      correctionId: correction.correctionId,
      correctAnswer: correction.correctAnswer,
      sourceRef: correction.sourceRef,
    }));

  return {
    blocked: matchedCorrections.length > 0,
    warnings: [],
    matchedCorrections,
  };
}

export interface MatchResult {
  query: string;
  corrections: CorrectionRecord[];
  context: string;
}

export function commandMatch(
  store: CorrectionStore,
  adapter: DomainAdapter,
  query: string,
): MatchResult {
  const corrections = store.match(query, adapter.domain);
  const context = adapter.buildContext(corrections);
  return { query, corrections, context };
}
