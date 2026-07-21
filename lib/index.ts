import { AuditLog, type AuditEntry } from "@/lib/audit/log";
import { CorrectionStore } from "@/lib/correction/store";
import { feedbackRecordSchema, type FeedbackRecord, type FeedbackSummary } from "@/lib/feedback/schema";
import { FeedbackStore } from "@/lib/feedback/store";
import { createDeterministicId } from "@/lib/domain/ids";
import { OutcomeTracker, type OutcomeReport } from "@/lib/outcome/tracker";
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
import { wrongPatternMatchScore } from "@/lib/correction/matching";
import { Mutex } from "@/lib/store/atomic";

export interface MemoSproutOptions {
  llm?: {
    /**
     * One of the supported providers (see docs/PROVIDERS.md): openai,
     * anthropic, deepseek, qwen, kimi, xiaomi, minimax, groq,
     * togetherai, openrouter, ollama — or, for custom/self-hosted
     * endpoints,
     * "openai-compatible" / "anthropic-compatible" (these require
     * baseUrl + model). Unsupported names throw an LLMError.
     */
    provider?: string;
    /**
     * Endpoint URL. Required for "openai-compatible" /
     * "anthropic-compatible"; optional override for named providers.
     * Must speak the wire format of the chosen provider.
     */
    baseUrl?: string;
    apiKey: string;
    model?: string;
    /** Request timeout in ms. Default: 30000. */
    timeoutMs?: number;
  };
  /**
   * When true, all corrections require manual approval before going active.
   * Default: false (smart confidence-based routing).
   */
  approvalRequired?: boolean;
  /**
   * Minimum confidence for auto-activation. Corrections below this
   * threshold are saved as "suggested" and need manual approval.
   * Default: 0.8 — auto-activating extracted corrections writes directly
   * into the knowledge base, so the bar is deliberately high.
   */
  autoActivateThreshold?: number;
  /**
   * When true and an LLM is configured, check() falls back to an LLM
   * semantic pass for corrections that lexical matching did not catch —
   * catching paraphrased or translated wrong answers. Costs one LLM call
   * per check() with unmatched active corrections. Default: false.
   */
  semanticCheck?: boolean;
}

export interface ProcessResult {
  type: "correction" | "feedback" | "none";
  confidence: number;
  correctionSaved: CorrectionRecord | null;
  correctionStatus: "active" | "suggested" | null;
  feedbackSaved: FeedbackRecord | null;
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
  private readonly tracker: OutcomeTracker;
  private readonly auditLog: AuditLog;
  private readonly llmConfig: LLMProviderConfig | null;
  private readonly approvalRequired: boolean;
  private readonly autoActivateThreshold: number;
  private readonly semanticCheckEnabled: boolean;
  private ready = false;
  /**
   * Serializes read-modify-write operations (confirmCount bumps, status
   * transitions) so concurrent requests cannot lose updates. The store's
   * own lock only serializes file writes, not the read-modify-write cycle.
   */
  private readonly opLock = new Mutex();
  private sourceHashProvider: SourceHashProvider | null = null;
  private adapter: import("@/lib/adapter/types").DomainAdapter | null = null;

  constructor(directory: string = "corrections", options: MemoSproutOptions = {}) {
    this.store = new CorrectionStore(directory);
    this.feedbackStore = new FeedbackStore(`${directory}/feedback`);
    this.tracker = new OutcomeTracker(`${directory}/outcomes.json`);
    this.auditLog = new AuditLog(`${directory}/audit.json`);
    this.llmConfig = options.llm
      ? resolveProviderConfig(options.llm)
      : null;
    this.approvalRequired = options.approvalRequired ?? false;
    this.autoActivateThreshold = options.autoActivateThreshold ?? 0.8;
    this.semanticCheckEnabled = options.semanticCheck ?? false;
  }

  setAdapter(adapter: import("@/lib/adapter/types").DomainAdapter): void {
    this.adapter = adapter;
  }

  setSourceHashProvider(provider: SourceHashProvider): void {
    this.sourceHashProvider = provider;
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      await this.store.init();
      await this.feedbackStore.init();
      await this.tracker.init();
      await this.auditLog.init();
      this.ready = true;
    }
  }

  async correct(options: CorrectOptions): Promise<CorrectionRecord> {
    await this.ensureReady();
    return this.opLock.run(() => this.correctUnlocked(options));
  }

  private async correctUnlocked(options: CorrectOptions): Promise<CorrectionRecord> {
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
    return this.opLock.run(() => this.feedbackUnlocked(options));
  }

  private async feedbackUnlocked(options: FeedbackOptions): Promise<FeedbackRecord> {
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

  async report(domain?: string): Promise<OutcomeReport> {
    await this.ensureReady();
    return this.tracker.report(domain);
  }

  async audit(correctionId: string): Promise<AuditEntry[]> {
    await this.ensureReady();
    return this.auditLog.history(correctionId);
  }

  async validate(correctionId: string): Promise<{ passed: boolean; detail: string }> {
    await this.ensureReady();
    const correction = this.store.get(correctionId);
    if (!correction) {
      return { passed: false, detail: `Correction "${correctionId}" not found.` };
    }

    let oracle: import("@/lib/adapter/types").Oracle;

    if (this.adapter) {
      oracle = this.adapter.createOracle(correction);
    } else if (this.llmConfig) {
      const { createSourceOracle } = await import("@/lib/adapter/source-oracle");
      oracle = createSourceOracle(this.llmConfig, correction);
    } else {
      return {
        passed: false,
        detail: "No domain adapter or LLM configured. Use ms.setAdapter() or configure llm in constructor.",
      };
    }

    const result = await oracle.evaluate(correction);

    if (result.passed) {
      await this.auditLog.record({
        correctionId,
        action: "revalidated",
        actor: oracle.id,
        reason: result.detail,
      });
    }
    return result;
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

    if (fresh.length > 0) {
      await this.tracker.trackContextServed(
        fresh.map((c) => c.correctionId),
        domain,
        query,
      );
    }

    return { corrections: fresh, context, staleSkipped };
  }

  async check(answer: string, domain?: string): Promise<CheckResult> {
    await this.ensureReady();

    const active = this.store.list({ status: "active", domain });

    const fresh = active.filter(
      (correction) =>
        correction.staleness === "fresh" && !isExpiredByDate(correction),
    );

    // Ranked, because callers act on corrections[0] — an arbitrary
    // ordering there means a block can answer a question nobody asked.
    const lexical = fresh
      .map((correction) => ({
        correction,
        score: wrongPatternMatchScore(answer, correction.wrongPattern),
      }))
      .filter((scored) => scored.score > 0)
      // Equal scores go to the more specific pattern: "3 business days"
      // and "3 days" both match, but the longer one is the real claim.
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.correction.wrongPattern.length - a.correction.wrongPattern.length,
      )
      .map((scored) => scored.correction);

    let semantic: CorrectionRecord[] = [];
    if (this.semanticCheckEnabled && this.llmConfig) {
      const unmatched = fresh.filter((c) => !lexical.includes(c));
      if (unmatched.length > 0) {
        const { semanticCheck } = await import("@/lib/llm/semantic-check");
        const matchedIds = new Set(
          await semanticCheck(
            this.llmConfig,
            answer,
            unmatched.map((c) => ({
              id: c.correctionId,
              wrongPattern: c.wrongPattern,
              correctAnswer: c.correctAnswer,
            })),
          ),
        );
        semantic = unmatched.filter((c) => matchedIds.has(c.correctionId));
      }
    }

    const matched = [...lexical, ...semantic].map((correction) => ({
      id: correction.correctionId,
      correct: correction.correctAnswer,
      source: correction.sourceRef,
    }));

    for (const match of matched) {
      await this.tracker.trackBlockTriggered(match.id, domain);
    }

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
    return this.opLock.run(() => this.removeUnlocked(correctionId));
  }

  private async removeUnlocked(correctionId: string): Promise<void> {
    const correction = this.store.get(correctionId);
    if (!correction) return;
    const deprecated = correctionRecordSchema.parse({
      ...correction,
      status: "deprecated",
      deprecatedAt: new Date().toISOString(),
      deprecatedReason: "Removed by user",
    });
    await this.store.save(deprecated);
    await this.auditLog.record({
      correctionId,
      action: "deprecated",
      actor: "admin",
      reason: "Removed by user",
    });
    await this.tracker.trackDeprecation(correctionId, correction.domain);
  }

  async processMessage(
    userMessage: string,
    previousAIAnswer: string,
    domain?: string,
  ): Promise<ProcessResult> {
    await this.ensureReady();

    let type: "correction" | "feedback" | "none" = "none";
    let confidence = 0;
    let correctionSaved: CorrectionRecord | null = null;
    let correctionStatus: "active" | "suggested" | null = null;
    let feedbackSaved: FeedbackRecord | null = null;

    if (this.llmConfig) {
      const extraction = await extractCorrection(
        this.llmConfig,
        userMessage,
        previousAIAnswer,
      );

      type = extraction.type;
      confidence = extraction.confidence;

      if (type === "correction" && extraction.wrong && extraction.correct) {
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

      if (type === "feedback" && extraction.topic) {
        feedbackSaved = await this.feedback({
          topic: extraction.topic,
          message: userMessage,
          domain,
          role: "customer",
          by: "llm-classification",
        });
      }
    }

    const { context, staleSkipped } = await this.context(userMessage, domain);

    return { type, confidence, correctionSaved, correctionStatus, feedbackSaved, context, staleSkipped };
  }

  async approve(correctionId: string): Promise<CorrectionRecord> {
    await this.ensureReady();
    return this.opLock.run(() => this.approveUnlocked(correctionId));
  }

  private async approveUnlocked(correctionId: string): Promise<CorrectionRecord> {
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
    await this.auditLog.record({
      correctionId,
      action: "approved",
      actor: "admin",
      reason: `Approved from ${correction.status}`,
    });
    await this.tracker.trackApproval(correctionId, correction.domain);
    return approved;
  }

  private async correctWithStatus(
    options: CorrectOptions,
    status: "active" | "suggested",
  ): Promise<CorrectionRecord> {
    await this.ensureReady();
    return this.opLock.run(() => this.correctWithStatusUnlocked(options, status));
  }

  private async correctWithStatusUnlocked(
    options: CorrectOptions,
    status: "active" | "suggested",
  ): Promise<CorrectionRecord> {
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
export { createSourceOracle } from "@/lib/adapter/source-oracle";
export {
  callLLM,
  resolveProviderConfig,
  knownProviders,
  LLMError,
  extractJsonPayload,
  type LLMProviderConfig,
} from "@/lib/llm/provider";
export {
  extractCorrection,
  messageTypeSchema,
  type ExtractionResult,
} from "@/lib/llm/extractor";
export {
  feedbackRecordSchema,
  type FeedbackRecord,
  type FeedbackRole,
  type FeedbackSummary,
} from "@/lib/feedback/schema";
export { FeedbackStore } from "@/lib/feedback/store";
export { OutcomeTracker, type OutcomeReport, type OutcomeEvent } from "@/lib/outcome/tracker";
export { AuditLog, type AuditEntry } from "@/lib/audit/log";
export { createApiServer, type ApiServerOptions } from "@/lib/api/server";
export { matchesWrongPattern, normalizeText } from "@/lib/correction/matching";
export { semanticCheck } from "@/lib/llm/semantic-check";
export { atomicWriteFile, Mutex } from "@/lib/store/atomic";
