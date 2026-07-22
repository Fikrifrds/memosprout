# MemoSprout — Internal Architecture

Complete technical reference. For customer-facing docs, see the docs
page in the app.

---

## System Overview

```
User message + Previous AI answer
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                  ms.processMessage()                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           LLM Classification (any provider)        │  │
│  │                                                    │  │
│  │  Input:  userMessage + previousAIAnswer            │  │
│  │  Output: { type, confidence, wrong, correct, ... } │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                    │
│         ┌───────────┼───────────┐                        │
│         ▼           ▼           ▼                        │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│   │correction│ │ feedback │ │   none   │                │
│   └────┬─────┘ └────┬─────┘ └──────────┘                │
│        │            │                                    │
│        ▼            ▼                                    │
│   ms.correct()  ms.feedback()                            │
│        │            │                                    │
│        ▼            ▼                                    │
│   ┌──────────┐ ┌──────────┐                              │
│   │Correction│ │ Feedback │                              │
│   │  Store   │ │  Store   │                              │
│   │(.md+YAML)│ │ (.json)  │                              │
│   └──────────┘ └──────────┘                              │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                  ms.context(query)                       │
│                                                          │
│  1. Match active corrections by keywords                 │
│  2. Evaluate staleness (source hash, TTL, conflicts)     │
│  3. Skip stale corrections                               │
│  4. Return context string for AI system prompt           │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                  ms.check(answer)                        │
│                                                          │
│  1. Compare answer against active corrections            │
│  2. If answer contains a known wrongPattern → block      │
│  3. Return { ok, corrections }                           │
└─────────────────────────────────────────────────────────┘
```

---

## Correction Lifecycle

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
  LLM extraction ──► SUGGESTED ──── approve() ───►│
  (low confidence)     │                           │
                       │                           │
  LLM extraction ──► ACTIVE ◄─────────────────────┘
  (high confidence)    │
  ms.correct(agent)    │
                       │
              ┌────────┼────────────────┐
              ▼        ▼                ▼
         CONFLICT   SOURCE_CHANGED   EXPIRED
              │        │                │
              └────────┼────────────────┘
                       ▼
                  QUARANTINED
                       │
              ┌────────┴────────┐
              ▼                 ▼
          approve()         remove()
              │                 │
              ▼                 ▼
           ACTIVE          DEPRECATED
```

### Status transitions

| From | To | Trigger |
|---|---|---|
| — | suggested | LLM confidence < threshold, or customer role |
| — | active | LLM confidence >= threshold + trusted role, or ms.correct(agent) |
| suggested | active | ms.approve(id) |
| active | quarantined | Conflict detected, source changed, TTL expired |
| quarantined | active | ms.approve(id) |
| quarantined | deprecated | ms.remove(id) |
| active | deprecated | ms.remove(id) |

---

## Confidence Routing

```
LLM returns confidence score (0.0 – 1.0)
              │
              ▼
    ┌─────────────────────┐
    │ approvalRequired?    │  default: true
    └────┬───────────┬────┘
     yes │           │ no
         ▼           ▼
    ┌────────┐  ┌──────────────────────┐
    │SUGGESTED│  │ confidence >= 0.8?   │
    │(always)│  └────┬────────────┬────┘
    └────────┘   yes │            │ no
                    ▼            ▼
              ┌────────┐  ┌──────────┐
              │ ACTIVE │  │SUGGESTED │
              └────────┘  └──────────┘

Threshold is configurable:
  new MemoSprout(dir, { autoActivateThreshold: 0.8 })
```

---

## Role-Based Trust

```
ms.correct({ role: "agent" })  ──► trusted ──► can auto-activate
ms.correct({ role: "admin" })  ──► trusted ──► can auto-activate
ms.correct({ role: "system" }) ──► trusted ──► can auto-activate
ms.correct({ role: "customer" }) ──► untrusted ──► always "suggested"

processMessage() with LLM:
  LLM classifies message
      │
      ├── type: "correction" ──► ms.correctWithStatus()
      │     status depends on confidence + approvalRequired
      │
      ├── type: "feedback" ──► ms.feedback()
      │     always stored as signal, never as correction
      │
      └── type: "none" ──► no action
```

---

## Staleness Protection

```
Active correction
       │
       ├── Source hash check (periodic or per-query)
       │     sourceHash stored at creation
       │     provider.getCurrentHash(sourceRef) → compare
       │     if different → QUARANTINED (source_changed)
       │
       ├── Conflict detection (on new correction)
       │     new correction contradicts active one
       │     old → QUARANTINED (conflict)
       │     new → saved (active or suggested)
       │
       └── TTL / expiry (per-query or periodic)
             expiresAt < now → QUARANTINED (expired)

ms.refreshStaleness()
  → checks ALL corrections
  → returns { checked: N, stale: M }
```

---

## Customer Support Flow

```
Customer message
       │
       ▼
  LLM classification
       │
       ├── "correction" (customer provides correct answer)
       │     → ms.correct(role: "customer")
       │     → status: SUGGESTED (never auto-active)
       │     → Agent reviews → ms.approve() → ACTIVE
       │
       ├── "feedback" (complaint, no correct answer)
       │     → ms.feedback()
       │     → Stored as signal
       │     → ms.feedbackSummary() shows patterns:
       │       [{ topic: "refund", count: 7, ... }]
       │     → Support team investigates
       │     → If confirmed: agent creates correction
       │
       └── "none"
             → no action

Key rule: customer input NEVER directly affects AI answers.
Only agent/admin corrections do.
```

---

## Data Storage

```
corrections/                    # corrections directory
├── corr_a1b2c3d4.md           # correction record (Markdown + YAML)
├── corr_e5f6g7h8.md
├── audit.json                  # lifecycle audit trail (capped 50k entries)
├── outcomes.json               # outcome events (capped 50k events)
├── embeddings.json             # cached correction vectors — only when
│                               #   semanticRetrieval is on; derived data,
│                               #   safe to delete (costs one re-embed)
└── feedback/                   # customer feedback signals
    ├── fb_i9j0k1l2.json       # feedback record (JSON)
    └── fb_m3n4o5p6.json
```

Files appear as they are needed rather than all at once: a store with no
audited action yet has no `audit.json`. The directory itself is created
recursively on first use, so a path that does not exist is fine.

### Write safety

All writes go through `atomicWriteFile()` (write to a temp file in the
same directory, then `rename` — atomic on POSIX), so a reader never sees a
partially written file. Two levels of serialization prevent races:

- **Store-level mutex** — serializes file writes within each store.
- **Operation-level mutex** (`MemoSprout.opLock`) — serializes the whole
  read-modify-write cycle of `correct()`, `approve()`, `remove()`, and
  `feedback()`, so concurrent requests cannot lose a `confirmCount`
  increment or overwrite each other's status transition.

This covers a single process. Multiple processes writing the same
directory would still need external locking.

### Correction file format

```markdown
---
correction_id: corr_a1b2c3d4
version: 1
status: active
domain: support
trigger_keywords: [refund, processing]
trigger_entities: []
wrong_pattern: Refund takes 3 business days
correct_answer: Refund takes 5 business days since March 2026
explanation: Policy updated in March 2026
source_ref: Refund Policy v4.1
submitted_by: agent-sarah
submitted_at: 2026-07-21T10:00:00.000Z
validated_by: null
validated_at: null
deprecated_at: null
deprecated_reason: null
confirm_count: 3
source_hash: sha256:abc123...
expires_at: 2026-12-31T00:00:00.000Z
last_validated_at: null
staleness: fresh
---

# Correction: Refund takes 5 business days since March 2026

## Wrong pattern
Refund takes 3 business days

## Correct answer
Refund takes 5 business days since March 2026

## Explanation
Policy updated in March 2026

## Source
Refund Policy v4.1

## Trigger
Keywords: refund, processing
```

---

## Domain Adapter Architecture

```
┌─────────────────────────────────────────────────────────┐
│              MEMOSPROUT CORE ENGINE                      │
│              (domain-agnostic)                           │
│                                                         │
│  CorrectionStore    Staleness     FeedbackStore          │
│  CorrectionSchema   Detection     FeedbackSchema         │
│  LLM Provider       Matching      CLI Commands           │
│  LLM Extractor      Lifecycle     REST API               │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          │            │                │
          ▼            ▼                ▼
    ┌──────────┐ ┌──────────┐   ┌──────────────┐
    │ Coding   │ │ RAG/Chat │   │ Finance      │
    │ Adapter  │ │ Adapter  │   │ Adapter      │
    │(built-in)│ │(future)  │   │(community)   │
    └──────────┘ └──────────┘   └──────────────┘

interface DomainAdapter {
  domain: string;
  captureCorrection(input): CorrectionRecord;
  createOracle(correction): Oracle;
  buildContext(corrections): string;
  checkOutput(output): ProtectionResult;
}
```

---

## LLM Provider Architecture

```
┌─────────────────────────────────────────┐
│           callLLM(config, messages)      │
│                                          │
│  config.apiFormat === "anthropic"?       │
│     ├── yes → callAnthropic()            │
│     │    POST /messages                  │
│     │    Header: x-api-key               │
│     │    Body: { model, system, messages }│
│     │                                    │
│     └── no  → callOpenAICompatible()     │
│          POST /chat/completions          │
│          Header: Authorization: Bearer   │
│          Body: { model, messages }       │
└─────────────────────────────────────────┘

Supported providers (fixed registry — unknown names throw LLMError):
  openai, anthropic, deepseek, qwen, kimi, xiaomi,
  minimax, groq, togetherai, openrouter, ollama
Custom endpoints (require baseUrl + model):
  openai-compatible, anthropic-compatible
```

### Response normalization

Every provider returns `{ content, model, usage }`, with token usage
normalized across wire formats (or `null` when an endpoint omits it), and fails as an `LLMError`
with an actionable message. Divergent provider behavior is absorbed here:

| Situation | Handling |
|---|---|
| Wrong API key (401/403) | `LLMError` naming the endpoint |
| Unknown model (404, or 400 mentioning the model) | `LLMError` naming the model |
| Rate limit (429) / server error (5xx) | One automatic retry, then `LLMError` |
| Network failure / timeout | One retry; `LLMError` names `timeoutMs` (default 30s) |
| Endpoint rejects `response_format` | Retried automatically without it |
| Model wraps JSON in markdown fences or prose | Stripped by `extractJsonPayload()` |
| Empty or unexpected response body | `LLMError` — never a silent empty string |

4xx errors are never retried. See `docs/PROVIDERS.md` for per-provider
detail and live verification status.

---

## Answer Matching

`check()` decides whether an AI answer asserts a known-wrong claim.

```
answer + active, fresh corrections
              │
              ▼
  ┌────────────────────────────────────────────┐
  │ 1. Lexical (always, no LLM)                │
  │    normalizeText: lowercase, strip          │
  │      punctuation, collapse whitespace       │
  │    a) word-boundary substring match         │
  │       (" 12 days " ⊄ "112 days")            │
  │    b) token overlap ≥ 80% for patterns      │
  │       with ≥ 3 significant tokens           │
  │       — every numeric token must be present │
  │         so corrected values are not blocked │
  └────────────────────┬───────────────────────┘
                       │ unmatched corrections
                       ▼
  ┌────────────────────────────────────────────┐
  │ 2. Semantic (opt-in: semanticCheck + LLM)   │
  │    LLM sees wrong_claim + correct_claim     │
  │    Flags only answers ASSERTING the wrong   │
  │    claim — paraphrase or translation.       │
  │    Not flagged: the correct claim, or a     │
  │    denial of the wrong one.                 │
  │    Capped at 30 corrections/call.           │
  │    On failure: fail open + console.warn     │
  └────────────────────┬───────────────────────┘
                       ▼
              { ok, corrections }
```

---

## Retrieval

`context()` finds the corrections relevant to a query. Lexical scoring is the
default and the only path that runs without configuration.

```
query + active corrections (domain-filtered)
              │
              ▼
  ┌────────────────────────────────────────────┐
  │ 1. Lexical scoring (always, no LLM)        │
  │    trigger keyword  +2 (phrase: +4)        │
  │    entity           +3                     │
  │    content-token fallback, needs ≥ 2 hits  │
  │    a "qualified" gate rejects a single      │
  │    broad keyword with no second signal      │
  └────────────────────┬───────────────────────┘
                       │ best score
                       ▼
              ┌────────────────┐
              │ score ≥ 4 ?    │──── yes ──▶ serve lexical result
              └────────┬───────┘             (no embedding call)
                       │ no — empty or weak
                       ▼
  ┌────────────────────────────────────────────┐
  │ 2. Semantic (opt-in: semanticRetrieval)    │
  │    embed query, cosine vs cached vectors   │
  │    keep matches ≥ semanticRetrievalThreshold│
  │    (default 0.42)                          │
  └────────────────────┬───────────────────────┘
                       ▼
              staleness gate → context string
```

The `score ≥ 4` line separates a confident hit (a phrase keyword, or a
keyword plus corroborating content) from a guess (one broad keyword). This
matters because lexical matching is *confidently* wrong on queries like
"what time does the office open?", which matches the bare word `office`.
Deferring to any lexical hit measured worse than having no lexical layer at
all — 83% vs 93% overall — so a weak hit is re-checked against the
embeddings, and an empty semantic result replaces it rather than yielding to
it. An empty result is a judgement (nothing scored above threshold), not an
absence.

A provider outage is distinguished from an empty result: on failure the weak
lexical hit stands, which is what the feature being off would have returned.

Correction vectors are embedded once and cached in `embeddings.json`, keyed
by a hash of the embedded text, so editing a correction re-embeds it and
nothing else does. Only the query is embedded per call.

---

## REST API

For non-Node backends (Python, PHP, Go, etc.), run the REST API server
and call it over HTTP. Start with an API key, plus LLM config to enable
`/process`:

```
MEMOSPROUT_API_KEY=your-secret-key \
MEMOSPROUT_LLM_PROVIDER=deepseek \
MEMOSPROUT_LLM_API_KEY=sk-... \
pnpm api                          # default 127.0.0.1:3456
```

### Security model

| Control | Behavior |
|---|---|
| Auth | All endpoints except `/health` require `MEMOSPROUT_API_KEY` via `Authorization: Bearer` or `x-api-key` (timing-safe compare) |
| Bind host | `127.0.0.1` by default; binding elsewhere **without** an API key throws at startup |
| CORS | `MEMOSPROUT_CORS_ORIGIN`, default `*` |
| Rate limit | `MEMOSPROUT_RATE_LIMIT` requests/min per key (default 120, `0` disables) → 429 |
| Body limit | 1 MB → 413 |

Status codes: 400 invalid JSON · 401 bad/missing key · 404 unknown
correction or endpoint · 409 correction cannot be approved in its current
status · 413 body too large · 429 rate limited · 500 otherwise.

Endpoints:

```
POST /correct                  { wrong, correct, keywords?, domain?, source?, role?, by? }
POST /process                  { message, previousAnswer, domain? }  → LLM detect+extract
POST /context                  { query, domain? }
POST /check                    { answer, domain? }
POST /feedback                 { topic, message, domain?, by?, role? }
GET  /feedback/summary         ?domain=
GET  /report                   ?domain=
POST /refresh-staleness
GET  /corrections              ?status=&domain=&keyword=
GET  /corrections/:id
GET  /corrections/:id/audit
POST /corrections/:id/validate
POST /corrections/:id/approve
DELETE /corrections/:id
GET  /health

Config: MEMOSPROUT_API_KEY, MEMOSPROUT_HOST, MEMOSPROUT_PORT,
        MEMOSPROUT_DIR, MEMOSPROUT_CORS_ORIGIN, MEMOSPROUT_RATE_LIMIT,
        MEMOSPROUT_LLM_PROVIDER, MEMOSPROUT_LLM_API_KEY,
        MEMOSPROUT_LLM_BASE_URL, MEMOSPROUT_LLM_MODEL
```

The REST API exposes the full MemoSprout surface, so backend users get
the same capabilities as the Node library — including LLM-powered
detection (`/process`), feedback signals, outcome reports, audit trail,
and oracle validation.

---

## CLI

```
pnpm cli init                              Create corrections directory
pnpm cli add --domain <d> --wrong <w> --correct <c> [options]
pnpm cli list [--status <s>] [--domain <d>]
pnpm cli validate <id>                     Validate against oracle
pnpm cli activate <id>                     Activate a validated correction
pnpm cli check <query> <answer>            Check an answer
pnpm cli match <query>                     Find relevant corrections
```

---

## Outcome Tracking (from v1 Outcome Ledger)

Every correction interaction is tracked:

```
ms.context("refund policy")
  → tracker.trackContextServed([corr_abc], "support", "refund policy")

ms.check("Refund takes 3 days")
  → tracker.trackBlockTriggered(corr_abc, "support")

ms.approve("corr_abc")
  → tracker.trackApproval("corr_abc", "support")

ms.remove("corr_abc")
  → tracker.trackDeprecation("corr_abc", "support")
```

Report:

```typescript
const report = await ms.report("support");
// {
//   totalQueries: 142,
//   correctionsServed: 89,
//   blocksTriggered: 12,
//   correctionsApproved: 5,
//   correctionsDeprecated: 1,
//   topCorrections: [
//     { correctionId: "corr_abc", timesServed: 45, timesBlocked: 8 },
//     ...
//   ],
// }
```

This proves corrections actually help — not just an assumption.

---

## Audit Trail (from v1 Control Plane)

Every lifecycle action is recorded:

```typescript
const history = await ms.audit("corr_abc");
// [
//   { action: "approved", actor: "admin", reason: "Approved from suggested", timestamp: "..." },
//   { action: "revalidated", actor: "coding-oracle:corr_abc", reason: "...", timestamp: "..." },
//   { action: "deprecated", actor: "admin", reason: "Removed by user", timestamp: "..." },
// ]
```

Stored in `corrections/audit.json`. Full history, queryable per correction.

---

## Oracle Validation (from v1 Validation Engine)

Corrections can be validated against a domain-specific oracle.
`ms.validate()` uses a fallback chain:

```
1. DomainAdapter oracle (if ms.setAdapter() called)
2. LLM source oracle (if LLM configured in constructor)
3. Error (neither configured)
```

### CodingAdapter oracle (deterministic)

Checks correction against the scenario definition:

```
✅ Correction references guarded paths from the scenario?
✅ Wrong pattern and correct answer are distinct?
✅ Correct answer is substantive (not too short)?
✅ Scenario has acceptance tests?
```

```typescript
const adapter = new CodingAdapter();
adapter.registerScenario(idempotencyScenario);
ms.setAdapter(adapter);

const result = await ms.validate("corr_abc");
// { passed: true, detail: "Correction validated against scenario
//   'idempotency' (2 guarded paths, acceptance test: ...)" }
```

### Source oracle (LLM-based, any domain)

When no adapter is set but LLM is configured, `ms.validate()` uses
an LLM to verify the correction's internal consistency:

```
✅ Correct answer differs from wrong pattern?
✅ Correct answer is specific and actionable?
✅ Explanation supports the correction?
✅ Source reference is plausible?
✅ No obvious contradictions or red flags?
```

```typescript
const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
});

const result = await ms.validate("corr_abc");
// { passed: true, detail: "Correction is internally consistent..." }
```

For production RAG/chat deployments, implement a DomainAdapter with
a real source-document oracle for deterministic verification.

---

## Module Map

```
lib/
├── index.ts                    # MemoSprout facade (main entry)
├── correction/
│   ├── schema.ts               # CorrectionRecord Zod schema
│   ├── render.ts               # Markdown + YAML render/parse
│   ├── store.ts                # File-based store + retrieval scoring
│   │                           #   (match / matchScored)
│   ├── matching.ts             # Lexical answer matching (normalize,
│   │                           #   word-boundary, token overlap)
│   ├── embedding-index.ts      # Cached correction vectors + cosine ranking
│   └── staleness.ts            # Source hash, conflict, TTL detection
├── feedback/
│   ├── schema.ts               # FeedbackRecord Zod schema
│   └── store.ts                # Feedback store + summarization
├── outcome/
│   └── tracker.ts              # Outcome tracking (from v1 Outcome Ledger)
├── audit/
│   └── log.ts                  # Audit trail (from v1 Control Plane)
├── llm/
│   ├── provider.ts             # 11 providers, OpenAI + Anthropic formats,
│   │                           #   LLMError, retry/timeout, JSON extraction
│   ├── extractor.ts            # LLM 3-way classification + extraction
│   ├── embedding.ts            # Embedding transport + cosine similarity
│   └── semantic-check.ts       # Opt-in semantic answer matching
├── store/
│   └── atomic.ts               # Atomic writes (tmp+rename) + Mutex
├── adapter/
│   ├── types.ts                # DomainAdapter interface + Oracle
│   └── coding.ts               # CodingAdapter (built-in, uses v1 scenarios)
├── api/
│   └── server.ts               # REST API server
├── cli/
│   └── commands.ts             # CLI command implementations
├── domain/
│   ├── ids.ts                  # Deterministic ID generation
│   └── schemas.ts              # Legacy schemas (eval framework)
├── eval/                       # Validation Engine (used by CodingAdapter)
├── mcp/                        # MCP server
├── scenario/                   # Scenario definitions (used by CodingAdapter)
├── ledger/                     # Outcome Ledger (historical)
├── reflex/                     # Protection Gate (historical)
├── delivery/                   # Delivery system (historical)
├── okf/                        # OKF render/validate (historical)
└── codex/                      # Codex adapter (historical)
```
