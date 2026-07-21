import { CorrectionStore } from "@/lib/correction/store";
import { feedbackRecordSchema, type FeedbackRecord, type FeedbackSummary } from "@/lib/feedback/schema";
import { FeedbackStore } from "@/lib/feedback/store";
import { createDeterministicId } from "@/lib/domain/ids";
import {
  correctionRecordSchema,
  type CorrectionFilter,
  type CorrectionRecord,
  type CorrectionStatus,
} from "@/lib/correction/schema";
import {
  evaluateStaleness,
  findConflicts,
  type SourceHashProvider,
} from "@/lib/correction/staleness";
import {
  resolveProviderConfig,
  type LLMProviderConfig,
} from "@/lib/llm/provider";
import { extractCorrection } from "@/lib/llm/extractor";

export interface MemoSproutOptions {
  llm?: {
    provider?: string;
    baseUrl?: string;
    apiKey: string;
    model?: string;
  };
  /**
   * When true, all corrections require manual approval before going active.
   * Default: false (smart confidence-based routing).
   */
  approvalRequired?: boolean;
  /**
   * Minimum confidence for auto-activation. Corrections below this
   * threshold are saved as "suggested" and need manual approval.
   * Default: 0.5
   */
  autoActivateThreshold?: number;
}

export interface ProcessResult {
  isCorrection: boolean;
  confidence: number;
  correctionSaved: CorrectionRecord | null;
  correctionStatus: "active" | "suggested" | null;
  context: string;
  staleSkipped: number;
}

export interface CorrectOptions {
  wrong: string;
  correct: string;
  domain?: string;
  keywords?: string[];
  entities?: string[];
  explanation?: string;
  source?: string;
  sourceHash?: string;
  expiresAt?: string;
  by?: string;
  /**
   * Role of the person making the correction.
   * - "agent" or "admin": trusted source, can auto-activate.
   * - "customer": untrusted, correction saved as "suggested" regardless of confidence.
   * Default: "agent"
   */
  role?: "customer" | "agent" | "admin" | "system";
}

export interface FeedbackOptions {
  topic: string;
  message: string;
  domain?: string;
  by?: string;
  role?: "customer" | "agent" | "admin" | "system";
}

export interface ContextResult {
  corrections: CorrectionRecord[];
  context: string;
  staleSkipped: number;
}

export interface CheckResult {
  ok: boolean;
  corrections: Array<{
    id: string;
    correct: string;
    source: string;
  }>;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: CorrectionRecord[];
}

export class MemoSprout {
  private readonly store: CorrectionStore;
  private readonly feedbackStore: FeedbackStore;
  private readonly llmConfig: LLMProviderConfig | null;
  private readonly approvalRequired: boolean;
  private readonly autoActivateThreshold: number;
  private ready = false;
  private sourceHashProvider: SourceHashProvider | null = null;

  constructor(directory: string = "corrections", options: MemoSproutOptions = {}) {
    this.store = new CorrectionStore(directory);
    this.feedbackStore = new FeedbackStore(`${directory}/feedback`);
    this.llmConfig = options.llm
      ? resolveProviderConfig(options.llm)
      : null;
    this.approvalRequired = options.approvalRequired ?? false;
    this.autoActivateThreshold = options.autoActivateThreshold ?? 0.5;
  }

  setSourceHashProvider(provider: SourceHashProvider): void {
    this.sourceHashProvider = provider;
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      await this.store.init();
      await this.feedbackStore.init();
      this.ready = true;
    }
  }

  async correct(options: CorrectOptions): Promise<CorrectionRecord> {
    await this.ensureReady();

    const domain = options.domain ?? "general";
    const role = options.role ?? "agent";
    const isTrustedSource = role === "agent" || role === "admin" || role === "system";
    const forcedStatus = isTrustedSource ? undefined : "suggested";

    const conflicts = findConflicts(
      this.store.list({ status: "active", domain }),
      { wrongPattern: options.wrong, correctAnswer: options.correct, domain },
    );

    for (const conflict of conflicts) {
      const quarantined = correctionRecordSchema.parse({
        ...conflict,
        staleness: "conflict",
        status: "quarantined",
      });
      await this.store.save(quarantined);
    }

    const correctionId = createDeterministicId(
      "corr",
      `${domain}:${options.wrong}:${options.correct}`,
    );

    const existing = this.store.get(correctionId);
    if (existing) {
      const updated = correctionRecordSchema.parse({
        ...existing,
        confirmCount: existing.confirmCount + 1,
        staleness: "fresh",
        status: "active",
      });
      await this.store.save(updated);
      return updated;
    }

    const correction = correctionRecordSchema.parse({
      correctionId,
      version: 1,
      status: forcedStatus ?? "active",
      domain,
      trigger: {
        keywords: options.keywords ?? [],
        entities: options.entities ?? [],
      },
      wrongPattern: options.wrong,
      correctAnswer: options.correct,
      explanation: options.explanation ?? "",
      sourceRef: options.source ?? "",
      submittedBy: options.by ?? "api",
      submittedAt: new Date().toISOString(),
      validatedBy: null,
      validatedAt: null,
      deprecatedAt: null,
      deprecatedReason: null,
      confirmCount: 0,
      sourceHash: options.sourceHash ?? null,
      expiresAt: options.expiresAt ?? null,
      lastValidatedAt: null,
      staleness: "fresh",
    });

    await this.store.save(correction);
    return correction;
  }

  async feedback(options: FeedbackOptions): Promise<FeedbackRecord> {
    await this.ensureReady();

    const feedbackId = createDeterministicId(
      "fb",
      `${options.domain ?? "general"}:${options.topic}:${options.message}`,
    );

    const existing = this.feedbackStore.get(feedbackId);
    if (existing) return existing;

    const record = feedbackRecordSchema.parse({
      feedbackId,
      topic: options.topic,
      message: options.message,
      role: options.role ?? "customer",
      submittedBy: options.by ?? "anonymous",
      submittedAt: new Date().toISOString(),
      domain: options.domain ?? "general",
      status: "pending",
      convertedCorrectionId: null,
    });

    await this.feedbackStore.save(record);
    return record;
  }

  async feedbackSummary(domain?: string): Promise<FeedbackSummary[]> {
    await this.ensureReady();
    return this.feedbackStore.summarize(domain);
  }

  async context(query: string, domain?: string): Promise<ContextResult> {
    await this.ensureReady();

    const matched = this.store.match(query, domain);

    const fresh: CorrectionRecord[] = [];
    let staleSkipped = 0;

    for (const correction of matched) {
      const evaluated = await evaluateStaleness(correction, {
        sourceHashProvider: this.sourceHashProvider ?? undefined,
      });
      if (evaluated.staleness !== "fresh" || evaluated.status !== "active") {
        if (evaluated !== correction) await this.store.save(evaluated);
        staleSkipped++;
        continue;
      }
      fresh.push(correction);
    }

    if (fresh.length === 0) {
      return { corrections: [], context: "", staleSkipped };
    }

    const lines = fresh.map((correction) => {
      const parts = [`- Do NOT say "${correction.wrongPattern}".`];
      parts.push(`  The correct answer is: ${correction.correctAnswer}`);
      if (correction.sourceRef) {
        parts.push(`  Source: ${correction.sourceRef}`);
      }
      return parts.join("\n");
    });

    const context = [
      "Important corrections (verified knowledge — apply these):",
      "",
      ...lines,
    ].join("\n");

    return { corrections: fresh, context, staleSkipped };
  }

  async check(answer: string, domain?: string): Promise<CheckResult> {
    await this.ensureReady();

    const active = this.store.list({ status: "active", domain });

    const fresh = active.filter(
      (correction) =>
        correction.staleness === "fresh" && !isExpiredByDate(correction),
    );

    const matched = fresh
      .filter((correction) =>
        answer.toLowerCase().includes(correction.wrongPattern.toLowerCase()),
      )
      .map((correction) => ({
        id: correction.correctionId,
        correct: correction.correctAnswer,
        source: correction.sourceRef,
      }));

    return {
      ok: matched.length === 0,
      corrections: matched,
    };
  }

  async refreshStaleness(): Promise<{ checked: number; stale: number }> {
    await this.ensureReady();

    const all = this.store.list();
    let stale = 0;

    for (const correction of all) {
      const evaluated = await evaluateStaleness(correction, {
        sourceHashProvider: this.sourceHashProvider ?? undefined,
      });
      if (evaluated.staleness !== correction.staleness || evaluated.status !== correction.status) {
        await this.store.save(evaluated);
        stale++;
      }
    }

    return { checked: all.length, stale };
  }

  async list(filter?: {
    status?: CorrectionStatus;
    domain?: string;
    keyword?: string;
  }): Promise<CorrectionRecord[]> {
    await this.ensureReady();
    return this.store.list(filter as CorrectionFilter);
  }

  async get(correctionId: string): Promise<CorrectionRecord | undefined> {
    await this.ensureReady();
    return this.store.get(correctionId);
  }

  async remove(correctionId: string): Promise<void> {
    await this.ensureReady();
    const correction = this.store.get(correctionId);
    if (!correction) return;
    const deprecated = correctionRecordSchema.parse({
      ...correction,
      status: "deprecated",
      deprecatedAt: new Date().toISOString(),
      deprecatedReason: "Removed by user",
    });
    await this.store.save(deprecated);
  }

  async processMessage(
    userMessage: string,
    previousAIAnswer: string,
    domain?: string,
  ): Promise<ProcessResult> {
    await this.ensureReady();

    let correctionSaved: CorrectionRecord | null = null;
    let correctionStatus: "active" | "suggested" | null = null;
    let isCorrection = false;
    let confidence = 0;

    if (this.llmConfig) {
      const extraction = await extractCorrection(
        this.llmConfig,
        userMessage,
        previousAIAnswer,
      );

      confidence = extraction.confidence;

      if (extraction.isCorrection && extraction.wrong && extraction.correct) {
        isCorrection = true;

        const shouldAutoActivate =
          !this.approvalRequired && confidence >= this.autoActivateThreshold;

        correctionSaved = await this.correctWithStatus({
          wrong: extraction.wrong,
          correct: extraction.correct,
          keywords: extraction.keywords,
          explanation: extraction.explanation,
          source: extraction.source,
          domain,
          by: "llm-extraction",
        }, shouldAutoActivate ? "active" : "suggested");

        correctionStatus = correctionSaved.status === "active" ? "active" : "suggested";
      }
    }

    const { context, staleSkipped } = await this.context(userMessage, domain);

    return { isCorrection, confidence, correctionSaved, correctionStatus, context, staleSkipped };
  }

  async approve(correctionId: string): Promise<CorrectionRecord> {
    await this.ensureReady();
    const correction = this.store.get(correctionId);
    if (!correction) {
      throw new Error(`Correction "${correctionId}" not found.`);
    }
    if (correction.status !== "suggested" && correction.status !== "quarantined") {
      throw new Error(
        `Correction "${correctionId}" cannot be approved (current status: ${correction.status}).`,
      );
    }
    const approved = correctionRecordSchema.parse({
      ...correction,
      status: "active",
      staleness: "fresh",
      validatedBy: "admin-approval",
      validatedAt: new Date().toISOString(),
    });
    await this.store.save(approved);
    return approved;
  }

  private async correctWithStatus(
    options: CorrectOptions,
    status: "active" | "suggested",
  ): Promise<CorrectionRecord> {
    await this.ensureReady();

    const domain = options.domain ?? "general";

    if (status === "active") {
      const conflicts = findConflicts(
        this.store.list({ status: "active", domain }),
        { wrongPattern: options.wrong, correctAnswer: options.correct, domain },
      );
      for (const conflict of conflicts) {
        const quarantined = correctionRecordSchema.parse({
          ...conflict,
          staleness: "conflict",
          status: "quarantined",
        });
        await this.store.save(quarantined);
      }
    }

    const correctionId = createDeterministicId(
      "corr",
      `${domain}:${options.wrong}:${options.correct}`,
    );

    const existing = this.store.get(correctionId);
    if (existing) {
      const updated = correctionRecordSchema.parse({
        ...existing,
        confirmCount: existing.confirmCount + 1,
        staleness: "fresh",
        status: status === "active" ? "active" : existing.status,
      });
      await this.store.save(updated);
      return updated;
    }

    const correction = correctionRecordSchema.parse({
      correctionId,
      version: 1,
      status,
      domain,
      trigger: {
        keywords: options.keywords ?? [],
        entities: options.entities ?? [],
      },
      wrongPattern: options.wrong,
      correctAnswer: options.correct,
      explanation: options.explanation ?? "",
      sourceRef: options.source ?? "",
      submittedBy: options.by ?? "api",
      submittedAt: new Date().toISOString(),
      validatedBy: null,
      validatedAt: null,
      deprecatedAt: null,
      deprecatedReason: null,
      confirmCount: 0,
      sourceHash: options.sourceHash ?? null,
      expiresAt: options.expiresAt ?? null,
      lastValidatedAt: null,
      staleness: "fresh",
    });

    await this.store.save(correction);
    return correction;
  }
}

function isExpiredByDate(correction: CorrectionRecord): boolean {
  if (!correction.expiresAt) return false;
  return new Date(correction.expiresAt).getTime() < Date.now();
}

export { CorrectionStore } from "@/lib/correction/store";
export {
  correctionRecordSchema,
  type CorrectionRecord,
  type CorrectionStatus,
  type CorrectionFilter,
  type Staleness,
} from "@/lib/correction/schema";
export {
  renderCorrectionMarkdown,
  parseCorrectionMarkdown,
} from "@/lib/correction/render";
export {
  evaluateStaleness,
  findConflicts,
  isExpired,
  detectConflict,
  type SourceHashProvider,
} from "@/lib/correction/staleness";
export type {
  DomainAdapter,
  Oracle,
  OracleResult,
  ProtectionResult,
} from "@/lib/adapter/types";
export { CodingAdapter } from "@/lib/adapter/coding";
export {
  callLLM,
  resolveProviderConfig,
  knownProviders,
  type LLMProviderConfig,
} from "@/lib/llm/provider";
export {
  extractCorrection,
  type ExtractionResult,
} from "@/lib/llm/extractor";
export {
  feedbackRecordSchema,
  type FeedbackRecord,
  type FeedbackRole,
  type FeedbackSummary,
} from "@/lib/feedback/schema";
export { FeedbackStore } from "@/lib/feedback/store";
