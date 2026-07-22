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
import {
  correctionEmbeddingText,
  resolveEmbeddingConfig,
  type EmbeddingOptions,
} from "@/lib/llm/embedding";
import { EmbeddingIndex } from "@/lib/correction/embedding-index";
import { wrongPatternMatchScore } from "@/lib/correction/matching";
import { Mutex } from "@/lib/store/atomic";

/**
 * Lexical scores below this are treated as a guess rather than an answer
 * when semantic retrieval is available to second-guess them.
 *
 * The store scores a phrase keyword at 4 and a single keyword at 2, so this
 * is the line between "matched a phrase, or a keyword with corroborating
 * content" and "matched one broad word". Measured on the eval corpus, every
 * false positive lexical produced sat at exactly 2.
 *
 * Only consulted when semanticRetrieval is on; without a fallback, a weak
 * lexical hit is still better than nothing.
 */
const WEAK_LEXICAL_SCORE = 4;

export interface MemoSproutLlmOptions {
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
}

export interface MemoSproutOptions {
  llm?: MemoSproutLlmOptions;
  /**
   * Optional, separate model used only for validation. It must not resolve to
   * the same model as `llm`, because a generator cannot serve as its own
   * judge. Prefer a domain adapter backed by an authoritative oracle.
   */
  validationLlm?: MemoSproutLlmOptions;
  /**
   * When true, all corrections require manual approval before going active.
   * Default: true. Model confidence is not source validation; callers must
   * explicitly opt in to confidence-based auto-activation.
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
  /**
   * When true and an LLM is configured, `correct()` asks the model once for
   * other words users might use for the same fact and adds them as trigger
   * keywords. Costs one LLM call per new correction — on the write, never
   * on a query — and closes the case where a correction exists but nobody
   * phrases the question the way it was filed.
   *
   * Default: false. It is opt-in because it spends money on a code path
   * that is otherwise free, and because every extra trigger term trades
   * some retrieval precision for recall.
   */
  generateAliases?: boolean;
  /**
   * When true, `context()` falls back to embedding similarity for queries
   * that lexical retrieval did not answer — closing the paraphrase gap
   * where a user asks about "workwear" and the correction was filed under
   * "uniform allowance".
   *
   * Lexical retrieval still runs first, and a confident hit is kept: it is
   * free, deterministic, and precise on exact terms. Embeddings are
   * consulted when lexical returns nothing *or* only a weak match, since
   * measurement showed deferring to a weak lexical hit was worse than
   * having no lexical layer at all. Confident hits cost nothing.
   *
   * Default: false — it is opt-in because it spends money on the read path
   * and sends the query text to the embedding provider.
   */
  semanticRetrieval?: boolean;
  /**
   * Minimum cosine similarity for a semantic hit. Default: 0.42.
   *
   * Tuned on the 24-correction corpus in `pnpm semantic:eval`, which is
   * sized deliberately: on a toy store of five corrections almost any
   * threshold looks good, because there is no near neighbour to confuse.
   * Precision is what degrades as a domain fills up, and 0.42 is where
   * overall accuracy peaks (83%) once near neighbours exist.
   *
   * Below it, off-topic questions start attaching to a loosely related
   * correction ("what time does the office open" → the home-office
   * allowance). Above ~0.47, genuine paraphrases begin dropping out. Expect
   * to tune this per corpus rather than trusting the default: the right
   * value depends on how densely your corrections cover one topic.
   */
  semanticRetrievalThreshold?: number;
  /**
   * Embedding provider. Defaults to OpenAI `text-embedding-3-small`,
   * reusing `llm.apiKey` when it is not set here. Any endpoint exposing an
   * OpenAI-shaped `/embeddings` route works — set `baseUrl` for a gateway,
   * a self-hosted model, or Ollama.
   */
  embedding?: EmbeddingOptions;
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
  private readonly validationLlmConfig: LLMProviderConfig | null;
  private readonly approvalRequired: boolean;
  private readonly autoActivateThreshold: number;
  private readonly semanticCheckEnabled: boolean;
  private readonly aliasGenerationEnabled: boolean;
  private readonly semanticRetrievalThreshold: number;
  /** Null unless semanticRetrieval is on — construction is what costs money. */
  private readonly embeddingIndex: EmbeddingIndex | null;
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
    this.validationLlmConfig = options.validationLlm
      ? resolveProviderConfig(options.validationLlm)
      : null;
    if (
      this.llmConfig &&
      this.validationLlmConfig &&
      this.llmConfig.model === this.validationLlmConfig.model
    ) {
      throw new Error(
        "validationLlm must use a different model from llm; " +
          "the correction extractor cannot validate its own output.",
      );
    }
    this.approvalRequired = options.approvalRequired ?? true;
    this.autoActivateThreshold = options.autoActivateThreshold ?? 0.8;
    this.semanticCheckEnabled = options.semanticCheck ?? false;
    this.aliasGenerationEnabled = options.generateAliases ?? false;
    this.semanticRetrievalThreshold = options.semanticRetrievalThreshold ?? 0.42;
    // Resolved eagerly so a missing API key fails at construction, where the
    // caller can see it, rather than on the first query in production.
    this.embeddingIndex = options.semanticRetrieval
      ? new EmbeddingIndex(
          `${directory}/embeddings.json`,
          resolveEmbeddingConfig(options.embedding ?? {}, this.llmConfig),
        )
      : null;
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

    const keywords = [...(options.keywords ?? [])];
    if (this.aliasGenerationEnabled && this.llmConfig) {
      const { generateAliases } = await import("@/lib/llm/aliases");
      keywords.push(
        ...(await generateAliases(this.llmConfig, {
          wrong: options.wrong,
          correct: options.correct,
          existingKeywords: keywords,
        })),
      );
    }

    const correction = correctionRecordSchema.parse({
      correctionId,
      version: 1,
      status: forcedStatus ?? "active",
      domain,
      trigger: {
        keywords,
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
    const report = this.tracker.report(domain);

    // The approval queue is current store state rather than an event count,
    // so the tracker cannot see it. Surfaced here because a correction that
    // is never approved is never served: without this number, captured
    // knowledge can be dropped silently and nothing in the report says so.
    const pending = this.store
      .list({ status: "suggested", domain })
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    return {
      ...report,
      pendingApprovals: pending.length,
      // Oldest first: a queue is worked from the front, and these are the
      // ones most at risk of being forgotten.
      pendingApprovalIds: pending.slice(0, 10).map((c) => c.correctionId),
      oldestPendingApprovalAt: pending[0]?.submittedAt ?? null,
    };
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
    } else if (this.validationLlmConfig) {
      const { createSourceOracle } = await import("@/lib/adapter/source-oracle");
      oracle = createSourceOracle(this.validationLlmConfig, correction);
    } else {
      return {
        passed: false,
        detail: "No validation oracle configured. Use ms.setAdapter() or configure a separate validationLlm.",
      };
    }

    const result = await oracle.evaluate(correction);

    const evaluatedAt = new Date().toISOString();
    await this.opLock.run(async () => {
      const latest = this.store.get(correctionId);
      if (!latest) return;
      const nextStatus = latest.status === "deprecated"
        ? "deprecated"
        : result.passed
          ? latest.status === "active" ? "active" : "validated"
          : "quarantined";
      const updated = correctionRecordSchema.parse({
        ...latest,
        status: nextStatus,
        validatedBy: result.passed ? oracle.id : latest.validatedBy,
        validatedAt: result.passed ? evaluatedAt : latest.validatedAt,
        lastValidatedAt: evaluatedAt,
      });
      await this.store.save(updated);
    });

    await this.auditLog.record({
      correctionId,
      action: result.passed ? "revalidated" : "quarantined",
      actor: oracle.id,
      reason: result.detail,
    });
    return result;
  }

  /**
   * Rank active corrections against the query by embedding similarity.
   *
   * Fails open: an embedding outage returns no matches and logs, leaving
   * the caller exactly where lexical retrieval left them — an empty
   * context. A retrieval helper must never turn a degraded provider into a
   * thrown error on the answer path.
   */
  private async semanticMatch(
    query: string,
    domain?: string,
  ): Promise<{ matches: CorrectionRecord[]; failed: boolean }> {
    if (!this.embeddingIndex) return { matches: [], failed: true };

    const active = this.store.list({ status: "active", domain });
    if (active.length === 0) return { matches: [], failed: false };

    try {
      const ranked = await this.embeddingIndex.rank(
        query,
        active.map((correction) => ({
          id: correction.correctionId,
          text: correctionEmbeddingText(correction),
        })),
        this.semanticRetrievalThreshold,
      );
      const byId = new Map(active.map((c) => [c.correctionId, c]));
      return {
        matches: ranked
          .map((entry) => byId.get(entry.id))
          .filter((c): c is CorrectionRecord => c !== undefined),
        failed: false,
      };
    } catch (error) {
      console.warn(
        `[memosprout] semantic retrieval failed, using lexical results only: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return { matches: [], failed: true };
    }
  }

  async context(query: string, domain?: string): Promise<ContextResult> {
    await this.ensureReady();

    const lexical = this.store.matchScored(query, domain);
    let matched = lexical.map((entry) => entry.correction);

    // Hybrid, with a confidence gate. Lexical runs first because it is free
    // and precise on exact terms — but "found something" is not the same as
    // "found the right thing", and deferring to a weak lexical hit was
    // measurably worse than having no lexical layer at all. A single broad
    // keyword scores 2 and is how "what time does the office open?" lands on
    // a home-office allowance; a phrase hit, or a keyword plus corroborating
    // content, scores 4 or more and is worth trusting.
    //
    // So embeddings are consulted when lexical found nothing *or* when what
    // it found is weak. Confident hits still never reach the network.
    if (this.embeddingIndex) {
      const best = lexical[0]?.score ?? 0;
      if (best < WEAK_LEXICAL_SCORE) {
        const semantic = await this.semanticMatch(query, domain);
        // An empty semantic result is a judgement, not an absence: the
        // embedding ranked every correction below the threshold, which is
        // the model saying none of them answers this question. So it
        // replaces the weak lexical guess even when empty. Keeping that
        // guess is what made "what time does the office open?" return an
        // allowance — lexical matched the bare word "office", while
        // semantics scored the same pairing at 0.27.
        //
        // A provider outage is not a judgement, so it is excluded here:
        // on failure the weak lexical result stands, which is the same
        // answer this method would give with the feature switched off.
        if (!semantic.failed) matched = semantic.matches;
      }
    }

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
      // Retrieval failing is silent: the caller gets an empty context, not
      // an error, and a user whose wording differs from the trigger simply
      // sees the uncorrected answer. Record the miss so report() can show
      // which phrasings are not covered — but only when this domain
      // actually holds corrections, otherwise every unrelated question
      // would be logged as a failure and the signal would be noise.
      if (this.store.list({ status: "active", domain }).length > 0) {
        await this.tracker.trackContextMissed(domain, query);
      }
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
    if (
      correction.status !== "suggested" &&
      correction.status !== "quarantined" &&
      correction.status !== "validated"
    ) {
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
  type LLMResponse,
  type LLMTokenUsage,
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
export {
  cosineSimilarity,
  correctionEmbeddingText,
  embedTexts,
  resolveEmbeddingConfig,
  type EmbeddingOptions,
  type EmbeddingProviderConfig,
} from "@/lib/llm/embedding";
export { atomicWriteFile, Mutex } from "@/lib/store/atomic";
