# MemoSprout v2 — Open Source MVP Breakdown

Status: Draft
Date: 2026-07-21

Domain-agnostic correction intelligence engine. Capture corrections from
any AI system, validate them against domain-specific oracles, store as
portable Markdown, deliver to future interactions. Works with RAG/chat,
coding agents, finance, legal, education — any domain where AI produces
outputs that humans verify.

---

## Domain-Agnostic Adapter Architecture

The core engine is domain-agnostic. Domain-specific behavior is isolated
in pluggable adapters.

```
┌─────────────────────────────────────────────────────────┐
│              MEMOSPROUT CORE ENGINE                      │
│              (domain-agnostic, open source)              │
│                                                         │
│  Correction    Validation    Lifecycle    Matching       │
│  Schema        Engine        Manager      Engine        │
│                                                         │
│  Protection    Outcome       Correction   CLI + API     │
│  Gate          Ledger        Store                      │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          │            │                │
          ▼            ▼                ▼
    ┌──────────┐ ┌──────────┐   ┌──────────────┐
    │ RAG/Chat │ │ Coding   │   │ Finance      │  ...
    │ Adapter  │ │ Adapter  │   │ Adapter      │
    └──────────┘ └──────────┘   └──────────────┘
```

Each adapter implements three domain-specific concerns:

```typescript
interface DomainAdapter {
  /** How corrections are captured in this domain. */
  captureCorrection(input: unknown): Promise<CorrectionRecord>;

  /** What oracle validates corrections in this domain. */
  createOracle(correction: CorrectionRecord): Oracle;

  /** How corrections are delivered to the AI system. */
  buildContext(corrections: CorrectionRecord[]): string;

  /** How protection (blocking known-wrong output) works. */
  checkOutput(output: unknown): ProtectionResult;
}
```

| Concern | RAG/Chat | Coding | Finance |
|---|---|---|---|
| Capture | User feedback on chatbot answer | Code review / failed test | Analyst correction |
| Oracle | Source document verification | Test suite execution | Regulation check |
| Delivery | Inject into RAG prompt context | AGENTS.md / system prompt | Report generation context |
| Protection | Block known-wrong answer | Block guarded file edit | Block non-compliant report |

The core engine does not know or care about the domain. It handles:
correction schema, validation lifecycle, matching, protection gate,
outcome tracking. The adapter handles everything domain-specific.

Packaging:

```
memosprout                    # core engine (open source)
@memosprout/rag-chat          # RAG/chat adapter
@memosprout/coding            # coding agent adapter (original scenarios)
@memosprout/finance           # finance adapter (community)
```

---

## Existing Assets Inventory

What we already have and how it maps.

| Existing Module | File | Reuse | Change |
|---|---|---|---|
| Domain schemas | `lib/domain/schemas.ts` | 70% | CandidateSproutContent → CorrectionRecord |
| OKF render | `lib/okf/render.ts` | 60% | Sprout Markdown → Correction Markdown v2 |
| OKF validate | `lib/okf/validate.ts` | 60% | Validate correction format |
| Delivery registry | `lib/delivery/registry.ts` | 80% | SproutRegistry → CorrectionRegistry |
| Delivery matching | `lib/delivery/get-task-context.ts` | 50% | pathInScope → keyword/entity matching |
| Reflex gate | `lib/reflex/gate.ts` | 40% | File-edit blocking → answer blocking |
| Outcome ledger | `lib/ledger/ledger.ts` | 70% | New metrics: accuracy, correction impact |
| Control plane | `lib/control-plane/control-plane.ts` | 80% | Sprout lifecycle → correction lifecycle |
| Experience compiler | `lib/compiler/experience-compiler.ts` | 50% | Sprout extraction → correction extraction |
| Oracle framework | `lib/eval/engine/oracles.ts` | 60% | Code oracle → answer oracle |
| Domain IDs | `lib/domain/ids.ts` | 100% | Reuse as-is |
| Tests (54 files) | `tests/` | ~40% | Adapt to new domain |

Estimated overall reuse: ~55-60% of core logic.

---

## Phase 0 — Correction Data Layer

**Goal:** Define what a correction IS and how it's stored.

**Build:**

1. CorrectionRecord Zod schema
   - correctionId, version, status
   - trigger: keywords[], entities[]
   - wrongPattern, correctAnswer, explanation
   - sourceRef (document reference, not content)
   - submittedBy, submittedAt
   - validatedBy, validatedAt (nullable)
   - deprecatedAt, deprecatedReason (nullable)

2. Correction Markdown renderer (OKF v2)
   - YAML frontmatter from CorrectionRecord
   - Human-readable body sections
   - Filename convention: `corr-{id}.md`

3. Correction Markdown parser
   - Parse YAML frontmatter → CorrectionRecord
   - Validate against Zod schema
   - Handle unknown fields gracefully (forward compat)

4. CorrectionStore
   - `save(correction)` → write Markdown file
   - `load(id)` → read + parse one correction
   - `list(filter?)` → list all, filter by status/keyword
   - `buildIndex()` → in-memory index for fast lookup
   - File-based, no database dependency

**Refactor from:** `lib/domain/schemas.ts`, `lib/okf/render.ts`,
`lib/okf/validate.ts`, `lib/delivery/registry.ts`

**Tests:** Schema validation, render/parse roundtrip, store CRUD,
index build.

**Exit gate:** Create a correction programmatically, save as Markdown,
read it back, validate it. CLI: `memosprout init && memosprout add`.

**Effort:** Small. Mostly refactoring existing schemas and renderers.

---

## Phase 1 — Capture & Match

**Goal:** Capture a correction from chat feedback, match relevant
corrections to a new query.

**Build:**

1. Correction capture
   - `captureCorrection({ question, wrongAnswer, userFeedback })`
   - Parse user feedback → structured CorrectionRecord
   - Two modes:
     a. Structured input (user provides wrongAnswer + correctAnswer
        explicitly) — no LLM needed
     b. Natural language feedback ("bukan, yang benar X") — LLM
        extracts structure (refactor Experience Compiler)
   - MVP: structured input first, LLM extraction as optional

2. Query matcher
   - `matchCorrections(query)` → relevant corrections
   - Keyword matching (trigger.keywords overlap with query tokens)
   - Entity matching (trigger.entities found in query)
   - Returns corrections sorted by relevance
   - MVP: keyword + entity match (no embeddings)

3. Context builder
   - `buildContext(corrections)` → string to inject into RAG prompt
   - Renders matched corrections as natural language guidance
   - Format: "Perhatian: untuk topik ini, jawaban yang benar adalah X
     (sumber: Y). Jangan jawab Z."

**Refactor from:** `lib/compiler/experience-compiler.ts` (LLM mode),
`lib/delivery/get-task-context.ts` (matching logic)

**Tests:** Capture structured correction, match by keyword, match by
entity, no match returns empty, context rendering.

**Exit gate:** Full loop without validation:
```
capture("cuti?", "12 hari", "bukan, 15 hari")
→ correction saved
matchCorrections("berapa cuti tahunan?")
→ returns correction
buildContext(corrections)
→ "Jawaban yang benar: 15 hari (SK-045/2026)"
```

**Effort:** Medium. Matching logic needs rethinking (path-based →
keyword-based). LLM extraction is optional for MVP.

---

## Phase 2 — Validation

**Goal:** Corrections must be verified before they go live. This is
what separates MemoSprout from "just save user feedback."

**Build:**

1. Correction lifecycle states
   - `suggested` → just captured, not validated
   - `validated` → passed oracle check
   - `active` → live, injected into queries
   - `deprecated` → no longer valid (policy changed again)
   - Only `active` corrections are returned by matchCorrections

2. Validation oracle (answer oracle)
   - Given a correction, verify it's correct
   - Strategy 1: Source verification
     - correction.sourceRef points to a document
     - check: does the document support the correction?
     - MVP: user provides source text, oracle compares
   - Strategy 2: Consistency check
     - does this correction contradict any existing active correction?
     - if yes → flag conflict, don't auto-validate
   - Strategy 3: LLM judge (optional)
     - "Given this source document, is this correction accurate?"
     - Uses a different model than the one being corrected

3. Validation workflow
   - `validateCorrection(id)` → run oracle → update status
   - Auto-validate if oracle passes + no conflicts
   - Quarantine if oracle fails or conflicts detected
   - Manual override: `activateCorrection(id)` (admin)

4. Consensus mechanism (basic)
   - Track how many users submitted the same correction
   - `confirmCount` field
   - If 3+ independent users confirm → auto-promote to validated
   - MVP: simple count, no sophisticated dedup

**Refactor from:** `lib/eval/engine/oracles.ts` (oracle pattern),
`lib/control-plane/control-plane.ts` (lifecycle),
`lib/eval/engine/runner.ts` (evaluation pattern)

**Tests:** Lifecycle transitions, oracle pass/fail, consistency
conflict detection, consensus threshold, manual override.

**Exit gate:** Capture correction → validate against source →
activate → correction now returned by matchCorrections. Capture
contradicting correction → flagged as conflict, not activated.

**Effort:** Medium-large. Oracle refactoring is significant (code
test oracle → answer verification oracle). Lifecycle is mostly
reuse from Control Plane.

---

## Phase 3 — Protection & Tracking

**Goal:** Block known-wrong answers. Measure whether corrections
actually help.

**Build:**

1. Answer checker (evolved Reflex Gate)
   - `checkAnswer(question, answer)` → { blocked, warnings }
   - Compare answer against active corrections
   - If answer matches a known wrongPattern → BLOCK
   - If answer partially matches → WARN
   - Returns the correct answer + source for reference

2. Outcome ledger (refactored)
   - Record every interaction:
     - query, answer, correctionsInjected, blocked, userFeedback
   - Metrics:
     - accuracyBefore: success rate without corrections
     - accuracyAfter: success rate with corrections
     - correctionImpact: per-correction effectiveness
     - blockRate: how often wrong answers are blocked
   - `report()` → summary of correction effectiveness

3. Correction health check
   - Periodic: are active corrections still valid?
   - If a correction is frequently overridden by new corrections
     → flag as potentially stale
   - If a correction is never triggered → flag as potentially
     irrelevant

**Refactor from:** `lib/reflex/gate.ts` (gate pattern),
`lib/ledger/ledger.ts` (ledger pattern)

**Tests:** Block known-wrong answer, warn on partial match, allow
correct answer, outcome recording, accuracy calculation, health
check flagging.

**Exit gate:**
```
checkAnswer("cuti?", "12 hari")
→ { blocked: true, correct: "15 hari", source: "SK-045/2026" }

checkAnswer("cuti?", "15 hari")
→ { blocked: false }

ledger.report()
→ { accuracyBefore: 0.62, accuracyAfter: 0.89, corrections: 14 }
```

**Effort:** Medium. Reflex Gate refactoring is moderate (file paths →
answer patterns). Ledger is mostly reuse.

---

## Phase 4 — Integration Layer

**Goal:** Make MemoSprout usable in real chatbot/RAG systems.

**Build:**

1. Chat adapter interface
   ```typescript
   interface ChatAdapter {
     // Called before the chatbot generates an answer
     beforeQuery(query: string): Promise<CorrectionContext>;

     // Called after the chatbot generates an answer
     afterAnswer(query: string, answer: string): Promise<AnswerCheck>;

     // Called when a user gives feedback
     onFeedback(feedback: UserFeedback): Promise<void>;
   }
   ```
   - This is the integration point for any chatbot platform
   - Platform-specific adapters implement this interface

2. REST API server (lightweight)
   - `POST /corrections` — capture correction
   - `GET /corrections` — list corrections
   - `GET /corrections/:id` — get one
   - `PUT /corrections/:id/validate` — validate
   - `PUT /corrections/:id/activate` — activate
   - `PUT /corrections/:id/deprecate` — deprecate
   - `POST /match` — match corrections to query
   - `POST /check` — check an answer
   - `GET /report` — outcome report
   - Standalone HTTP server (Hono), not Next.js

3. Integration examples (documentation, not shipped code)
   - LangChain: middleware that calls beforeQuery/afterAnswer
   - Chatbase: webhook that captures feedback
   - Custom RAG: inject CorrectionContext into prompt
   - Each example: < 50 lines of code

4. CLI completeness
   - `memosprout init` — create corrections directory + config
   - `memosprout add` — interactive correction capture
   - `memosprout list` — list corrections by status
   - `memosprout validate <id>` — run validation
   - `memosprout serve` — start REST API server
   - `memosprout report` — print outcome report
   - `memosprout check "query" "answer"` — check an answer

**Refactor from:** `lib/mcp/tools.ts` (API pattern),
`lib/mcp/server.ts` (server pattern)

**Tests:** API endpoints, adapter interface contract, CLI commands.

**Exit gate:** Start API server, capture correction via HTTP, match
via HTTP, check answer via HTTP. CLI workflow end-to-end.

**Effort:** Medium. API is straightforward. CLI needs work. Examples
are documentation effort.

---

## Phase 5 — Package & Polish

**Goal:** Ship as a usable npm package.

**Build:**

1. Package structure
   - `memosprout` npm package
   - TypeScript, ESM
   - Zero required dependencies (Zod only)
   - Optional dependencies: openai (for LLM extraction/validation)
   - Node.js >= 20 (broaden from 24 for adoption)

2. Documentation
   - README: what, why, quickstart, API reference
   - docs/: architecture, correction format spec, integration guide
   - Examples: 3 complete integration examples

3. Test suite
   - All phases tested
   - Target: > 90% coverage on core modules
   - Integration tests for full loop

4. CI
   - GitHub Actions: lint, typecheck, test
   - npm publish on tag

**Effort:** Medium. Mostly documentation and packaging.

---

## Summary

| Phase | What | Effort | Value |
|---|---|---|---|
| 0 | Correction data layer | Small | Foundation |
| 1 | Capture & match | Medium | Core loop works |
| 2 | Validation | Medium-large | **The differentiator** |
| 3 | Protection & tracking | Medium | Proves corrections help |
| 4 | Integration layer | Medium | Usable in real systems |
| 5 | Package & polish | Medium | Shippable |

**Critical path:** 0 → 1 → 2 → 3 → 4 → 5 (sequential, each
depends on the previous)

**Phase 2 is the most important.** Without validation, MemoSprout is
just "save user feedback in Markdown." With validation, it's "corrections
that are proven correct before they go live." This is the product.

**What we're NOT building:**
- Dashboard / web UI (open source = CLI + API + library)
- Database (file-based, SQLite optional later)
- Cloud / SaaS (not now, maybe never for open source)
- Embedding / semantic search (keyword match first)
- Multi-tenant (single instance per deployment)
- Model hosting (user brings their own model for LLM features)

**LLM dependency:**
- Core loop (capture structured, match, check, store): NO LLM needed
- Optional features (natural language extraction, LLM validation):
  needs an API key, works with any OpenAI-compatible provider
- The product is useful WITHOUT any LLM — this is important for
  adoption and trust
