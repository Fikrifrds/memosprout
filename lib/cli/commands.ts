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

/**
 * Approve a pending correction — the human sign-off that lets it be served.
 *
 * Distinct from `commandActivate`, which is the last step of the *oracle*
 * path and only accepts an already-validated correction. Approval is the
 * path for corrections a person vouches for: those from customers, and
 * those an LLM extracted from a conversation. Without it, everything the
 * store marks `suggested` is unreachable from the CLI.
 *
 * Delegates to MemoSprout rather than writing through the store, because
 * approving must reach the audit log and the outcome tracker. A bare status
 * write would serve the correction while losing the record of who cleared it.
 */
export async function commandApprove(
  directory: string,
  correctionId: string,
): Promise<CorrectionRecord> {
  const { MemoSprout } = await import("@/lib/index");
  return new MemoSprout(directory).approve(correctionId);
}

/**
 * Outcome report, including the approval queue.
 *
 * Exposed on the CLI because the two things most worth acting on —
 * corrections waiting for a human, and questions retrieval could not answer
 * — are both silent failures. Neither surfaces unless someone looks.
 */
export async function commandReport(
  directory: string,
  domain?: string,
): Promise<import("@/lib/outcome/tracker").OutcomeReport> {
  const { MemoSprout } = await import("@/lib/index");
  return new MemoSprout(directory).report(domain);
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

export interface SyncOptions {
  url: string;
  apiKey: string;
  directory: string;
}

export interface SyncResult {
  pushed: number;
  pushRejected: number;
  pulled: number;
  cursor: string | null;
}

const snapshotResponseSchema = correctionRecordSchema.array();

/**
 * Sync with a MemoSprout Cloud remote: push local `suggested` corrections,
 * then pull the approved snapshot and write it into the local store. The
 * cursor persists in `<dir>/.sync-cursor` so pulls are incremental.
 */
export async function commandSync(
  store: CorrectionStore,
  options: SyncOptions,
): Promise<SyncResult> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const cursorPath = join(options.directory, ".sync-cursor");
  const headers = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
  };

  let pushed = 0;
  let pushRejected = 0;
  for (const correction of store.list({ status: "suggested" })) {
    const response = await fetch(`${options.url}/v1/corrections`, {
      method: "POST",
      headers,
      body: JSON.stringify(correction),
    });
    if (!response.ok) {
      throw new Error(`push failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as { accepted: boolean };
    if (body.accepted) pushed++;
    else pushRejected++;
  }

  let cursor: string | null = null;
  try {
    cursor = (await readFile(cursorPath, "utf8")).trim() || null;
  } catch {
    // first sync: no cursor yet
  }

  let pulled = 0;
  let hasMore = true;
  while (hasMore) {
    const query = cursor ? `?since=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`${options.url}/v1/snapshot${query}`, { headers });
    if (!response.ok) {
      throw new Error(`pull failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as {
      corrections: unknown;
      cursor: string | null;
      hasMore: boolean;
    };
    const corrections = snapshotResponseSchema.parse(body.corrections);
    for (const record of corrections) {
      await store.save(record);
      pulled++;
    }
    cursor = body.cursor ?? cursor;
    hasMore = body.hasMore && corrections.length > 0;
  }

  if (cursor) {
    await writeFile(cursorPath, cursor, "utf8");
  }
  return { pushed, pushRejected, pulled, cursor };
}
