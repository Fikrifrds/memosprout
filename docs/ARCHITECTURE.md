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
    │ approvalRequired?    │
    └────┬───────────┬────┘
     yes │           │ no
         ▼           ▼
    ┌────────┐  ┌──────────────────────┐
    │SUGGESTED│  │ confidence >= 0.5?   │
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
└── feedback/                   # customer feedback signals
    ├── fb_i9j0k1l2.json       # feedback record (JSON)
    └── fb_m3n4o5p6.json
```

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

Supported providers:
  openai, anthropic, deepseek, qwen, kimi,
  minimax, groq, together, openrouter, ollama,
  + any custom OpenAI-compatible endpoint
```

---

## REST API

```
POST /correct     { wrong, correct, keywords?, domain?, source?, role? }
POST /context     { query, domain? }
POST /check       { answer, domain? }
GET  /corrections ?status=&domain=&keyword=
GET  /corrections/:id
DELETE /corrections/:id
GET  /health

Start: pnpm api (default port 3456)
Config: MEMOSPROUT_PORT, MEMOSPROUT_DIR
```

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
│   ├── store.ts                # File-based store + matching
│   └── staleness.ts            # Source hash, conflict, TTL detection
├── feedback/
│   ├── schema.ts               # FeedbackRecord Zod schema
│   └── store.ts                # Feedback store + summarization
├── outcome/
│   └── tracker.ts              # Outcome tracking (from v1 Outcome Ledger)
├── audit/
│   └── log.ts                  # Audit trail (from v1 Control Plane)
├── llm/
│   ├── provider.ts             # 10 providers, OpenAI + Anthropic formats
│   └── extractor.ts            # LLM 3-way classification + extraction
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
├── eval/                       # v1 Validation Engine (used by CodingAdapter)
├── ledger/                     # v1 Outcome Ledger (reference)
├── control-plane/              # v1 lifecycle management (reference)
├── reflex/                     # v1 Protection Gate (reference)
├── router/                     # v1 Cost-Intelligence Router (reference)
├── compiler/                   # v1 Experience Compiler (reference)
├── delivery/                   # v1 delivery system (reference)
├── mcp/                        # MCP server
├── okf/                        # v1 OKF render/validate (reference)
├── openai/                     # v1 OpenAI extraction (reference)
├── codex/                      # v1 Codex adapter (reference)
└── scenario/                   # Scenario definitions (used by CodingAdapter)
```
