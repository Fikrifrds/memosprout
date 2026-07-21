# QualityGate — Technical Architecture

Status: Draft
Date: 2026-07-21

Guaranteed AI output quality at minimum cost. Multi-model orchestration
with validated, context-specific quality criteria that learn and improve
over time.

---

## 1. System Overview

```
                            ┌──────────────────────────────────────────────────────┐
                            │                   QualityGate Core                   │
                            │                                                      │
  Client ──► API Gateway ──►│  Task        Smart       Model        Quality       │──► Client
  (SDK/REST)                │  Classifier  Router      Adapters     Engine        │    (response)
                            │      │           │           │            │          │
                            │      │           │           │            ▼          │
                            │      │           │           │       Policy Gate     │
                            │      │           │           │            │          │
                            │      ▼           ▼           ▼            ▼          │
                            │  ┌─────────────────────────────────────────────┐    │
                            │  │            Outcome Ledger                   │    │
                            │  │  (every decision, score, cost, feedback)    │    │
                            │  └──────────────────┬──────────────────────────┘    │
                            │                     │                               │
                            │                     ▼                               │
                            │  ┌─────────────────────────────────────────────┐    │
                            │  │            Learning Loop                    │    │
                            │  │  Router updates │ Criteria refinement       │    │
                            │  └─────────────────────────────────────────────┘    │
                            │                                                      │
                            │  ┌─────────────────────────────────────────────┐    │
                            │  │         Criteria Manager                    │    │
                            │  │  draft → validated → active → deprecated    │    │
                            │  └─────────────────────────────────────────────┘    │
                            └──────────────────────────────────────────────────────┘
                                         │              │              │
                                         ▼              ▼              ▼
                                    ┌────────┐   ┌──────────┐   ┌──────────┐
                                    │ DeepSeek│   │ Qwen     │   │ OpenAI   │  ...
                                    │ (cheap) │   │ (mid)    │   │ (frontier│
                                    └────────┘   └──────────┘   └──────────┘
```

Request lifecycle:

```
1. Client sends task + context + quality rule refs + min_quality + max_cost
2. Task Classifier determines task_type and applicable rules
3. Smart Router picks the cheapest model with sufficient historical reliability
4. Model Adapter calls the selected provider, tracks tokens + cost
5. Quality Engine scores output against validated criteria
6. If score < min_quality AND cost budget allows → escalate to next model → goto 4
7. Policy Gate checks hard constraints (PII, compliance, safety)
8. Outcome Ledger records everything
9. Response returned to client
```

---

## 2. Core Components

### 2.1 API Gateway

Thin entry point. Auth, rate limiting, request validation, response
formatting. No business logic.

```typescript
// POST /v1/evaluate
interface EvaluateRequest {
  task: string;                          // the prompt / instruction
  context: Record<string, string>;       // { industry, platform, language, ... }
  qualityRules: string[];                // rule IDs to score against
  minQuality: number;                    // 0.0 – 1.0 threshold
  maxCostTier: "cheap" | "mid" | "frontier" | "any";
  maxEscalations: number;                // max model escalations (default 2)
  policySet?: string;                    // policy gate rule set ID
  metadata?: Record<string, string>;     // passthrough for client tracking
}

interface EvaluateResponse {
  output: string;
  modelUsed: string;
  qualityScore: number;
  escalated: boolean;
  escalationCount: number;
  criteriaResults: CriteriaResult[];
  policyResult: PolicyResult;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
}
```

Secondary endpoints:

```
POST   /v1/rules                    Create quality rule
GET    /v1/rules/:id                Get rule
PUT    /v1/rules/:id                Update rule (new version)
DELETE /v1/rules/:id                Deprecate rule
POST   /v1/rules/:id/validate       Validate a rule against sample outputs

GET    /v1/analytics/routing        Routing accuracy by task type
GET    /v1/analytics/criteria       Criteria predictive power
GET    /v1/analytics/cost           Cost per task type, per model
GET    /v1/analytics/quality        Quality trends over time

POST   /v1/feedback                 User feedback on an output (accept/reject/edit)
```

### 2.2 Task Classifier

Determines the task type from the incoming request. Task type drives
routing decisions and criteria selection.

```typescript
interface TaskClassification {
  taskType: string;          // "product-description", "email", "code-review", ...
  confidence: number;
  suggestedRules: string[];  // rules that historically apply to this type
}
```

Two modes:

- **Explicit:** client sends `taskType` in context. No classification
  needed. This is the default for API-first users who know their task
  types.
- **Inferred:** a cheap model classifies the task when `taskType` is
  absent. Uses a small, fast model (not the expensive ones). The
  classification itself is recorded in the ledger for accuracy tracking.

Start with explicit mode. Inferred mode is a Phase 2 feature.

### 2.3 Smart Router

Evolved from `lib/router/router.ts` (Cost-Intelligence Router).

Input: task type, context, historical outcome data.
Output: ordered list of models to try, cheapest first.

```typescript
interface RoutingPlan {
  steps: RoutingStep[];       // ordered: try step[0] first, escalate to step[1], ...
  reasoning: string;          // human-readable explanation
}

interface RoutingStep {
  model: string;              // "deepseek-v3", "qwen-3-235b", "gpt-5.6", ...
  tier: "cheap" | "mid" | "frontier";
  historicalRate: number | null;  // success rate for this task type (null = no data)
  estimatedCostUsd: number;
}
```

Routing logic:

```
IF historical data exists for this task_type:
  rank models by (historicalRate >= minQuality) ASC cost
  return models that meet the quality bar, cheapest first
ELSE:
  return default ladder: cheapest → mid → frontier
  (cold start: always try cheap first)
```

The router does NOT decide quality — it decides WHERE to start. The
Quality Engine decides IF the output is good enough.

Learning: after every task, the ledger records (task_type, model,
quality_score, escalated). The router periodically recomputes
historicalRate per (task_type, model) pair.

### 2.4 Model Adapters

Evolved from `lib/eval/v3/frontier-worker.ts` (FrontierApiWorkerAdapter).

Unified interface across providers:

```typescript
interface ModelAdapter {
  readonly provider: string;     // "openai", "anthropic", "deepseek", "qwen", ...
  readonly modelId: string;      // "gpt-5.6", "claude-4.5-sonnet", "deepseek-v3", ...
  readonly tier: "cheap" | "mid" | "frontier";
  readonly costPerMInput: number;   // USD per 1M input tokens
  readonly costPerMOutput: number;  // USD per 1M output tokens

  generate(request: GenerateRequest): Promise<GenerateResult>;
}

interface GenerateRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface GenerateResult {
  output: string;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  model: string;          // actual model returned (may differ from requested)
  providerResponseId: string;
}
```

Provider implementations (Phase 1: 3 providers, expand later):

| Provider | Models | Tier | Notes |
|---|---|---|---|
| DeepSeek | deepseek-v3, deepseek-r1 | cheap | OpenAI-compatible API |
| Qwen (DashScope) | qwen-3-235b, qwen-3-32b | cheap–mid | OpenAI-compatible API |
| OpenAI | gpt-5.4-mini, gpt-5.6 | mid–frontier | Responses API |
| Anthropic | claude-4.5-sonnet, claude-4.5-opus | mid–frontier | Messages API |
| Kimi (Moonshot) | moonshot-v1-128k | mid | OpenAI-compatible API |
| MiniMax | MiniMax-Text-01 | cheap | OpenAI-compatible API |

Most providers offer OpenAI-compatible APIs, so a single
`OpenAICompatibleAdapter` covers DeepSeek, Qwen, Kimi, MiniMax, MiMo.
Only OpenAI and Anthropic need custom adapters.

```typescript
// One adapter covers most providers
class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(config: {
    provider: string;
    modelId: string;
    tier: ModelTier;
    baseUrl: string;      // provider-specific endpoint
    apiKey: string;
    costPerMInput: number;
    costPerMOutput: number;
  }) {}

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    // Standard OpenAI chat completions format
    // Works for DeepSeek, Qwen, Kimi, MiniMax, MiMo
  }
}
```

### 2.5 Quality Engine

Evolved from `lib/eval/engine/oracles.ts` (StructuredCheckOracle,
RubricJudgeOracle) and `lib/eval/engine/runner.ts`.

This is the core differentiator. Not a generic "is this good?" judge.
A multi-strategy scoring engine that evaluates output against
**validated, context-specific criteria**.

```typescript
interface QualityEngine {
  score(output: string, criteria: QualityCriterion[], context: TaskContext): Promise<QualityReport>;
}

interface QualityReport {
  overallScore: number;           // 0.0 – 1.0 weighted aggregate
  passed: boolean;                // overallScore >= minQuality
  criteriaResults: CriteriaResult[];
  judgeModel: string | null;      // which model judged (null if all deterministic)
  judgeCostUsd: number;
}

interface CriteriaResult {
  ruleId: string;
  ruleName: string;
  strategy: "deterministic" | "rubric" | "composite";
  passed: boolean;
  score: number;                  // 0.0 – 1.0
  detail: string;                 // human-readable explanation
}
```

Three scoring strategies (evolved from the three oracle types):

**Strategy 1: Deterministic checks** (from StructuredCheckOracle)
No LLM needed. Fast, free, unambiguous.

```typescript
// Examples:
- output.length >= 100 && output.length <= 2000     // length constraint
- !output.includes(competitorName)                    // forbidden content
- output.includes(requiredDisclaimer)                 // required content
- regex.test(output)                                  // format validation
- jsonSchema.validate(JSON.parse(output))             // structured output
```

**Strategy 2: Rubric judge** (from RubricJudgeOracle)
LLM-as-judge with a specific rubric. Used for subjective criteria.

```typescript
// The rubric is NOT "is this good?" — it is specific:
const rubric = `
Evaluate whether this product description:
1. Uses the brand voice: casual, friendly, uses "kamu" not "Anda"
2. Highlights exactly 3 key features, not more, not less
3. Includes a clear call-to-action in the last sentence
4. Does not use superlatives like "terbaik", "termurah", "paling"
Score each criterion 0 or 1. Return structured JSON.
`;
```

The judge model is selected separately from the generation model.
Key principle from MemoSprout: **do not use the same model as both
generator and judge** (BW-010, oracle separation).

Judge model selection:
- For cheap tasks: use a mid-tier model as judge (cost-effective)
- For frontier tasks: use a different frontier model as judge
- Never use the same model instance as both generator and judge

**Strategy 3: Composite** (new)
Combines deterministic + rubric in a weighted score.

```typescript
interface CompositeCriterion {
  ruleId: string;
  checks: Array<{
    strategy: "deterministic" | "rubric";
    config: DeterministicConfig | RubricConfig;
    weight: number;        // relative weight in the composite score
  }>;
}
```

### 2.6 Policy Gate

Evolved from `lib/reflex/gate.ts` (ReflexGate).

Hard constraints that BLOCK output regardless of quality score.
Non-negotiable. Runs AFTER quality scoring (no point scoring output
that will be blocked).

```typescript
interface PolicyGate {
  check(output: string, policySet: PolicySet): Promise<PolicyResult>;
}

interface PolicyResult {
  allowed: boolean;
  violations: PolicyViolation[];
}

interface PolicyViolation {
  policyId: string;
  severity: "block" | "warn";
  detail: string;
}
```

Built-in policy types:

| Policy | Detection | Action |
|---|---|---|
| PII detection | Regex + NER | block |
| Forbidden terms | Keyword list | block |
| Language check | Detection | block/warn |
| Max length | Deterministic | block |
| Required sections | Deterministic | warn |
| Custom regex | User-defined | block/warn |

Custom policies are user-defined. The Policy Gate is the evolved
Reflex Gate: instead of blocking file edits, it blocks output content.

### 2.7 Outcome Ledger

Evolved from `lib/ledger/ledger.ts` (OutcomeLedger).

Records every decision and outcome. Powers the learning loop.

```typescript
interface OutcomeRecord {
  version: "qg-outcome-v1";
  outcomeId: string;
  timestamp: string;

  // Input
  taskType: string;
  context: Record<string, string>;
  qualityRuleIds: string[];
  minQuality: number;

  // Routing
  routingPlan: string[];          // models in the order they were tried
  escalated: boolean;
  escalationCount: number;

  // Generation
  modelUsed: string;
  provider: string;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;

  // Quality
  qualityScore: number;
  criteriaResults: CriteriaResult[];
  judgeModel: string | null;
  judgeCostUsd: number;

  // Policy
  policyAllowed: boolean;
  policyViolations: string[];

  // Feedback (async, filled later)
  userFeedback: "accepted" | "rejected" | "edited" | null;
  feedbackAt: string | null;
}
```

Storage evolution (same as MemoSprout BW-041):
- Phase 1: JSON files (local, simple)
- Phase 2: SQLite (single-node, queryable)
- Phase 3: PostgreSQL (multi-tenant, analytics)

### 2.8 Criteria Manager

Evolved from `lib/control-plane/control-plane.ts` (ControlPlane).

Manages the lifecycle of quality criteria (the evolved "sprouts").

```
draft → validated → active → deprecated
              ↑                    │
              └── revised ◄────────┘
```

```typescript
interface QualityRule {
  ruleId: string;
  name: string;
  description: string;
  version: number;
  status: "draft" | "validated" | "active" | "deprecated";

  // What this rule checks
  strategy: "deterministic" | "rubric" | "composite";
  config: DeterministicConfig | RubricConfig | CompositeConfig;

  // When this rule applies
  taskTypes: string[];             // empty = all task types
  contextMatch: Record<string, string>;  // empty = all contexts

  // Metadata
  weight: number;                  // relative weight in quality score
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  // Validation evidence
  validationSampleSize: number;    // how many samples validated this rule
  predictivePower: number | null;  // correlation with user acceptance
}
```

Validation: before a rule goes active, it must be validated against
sample outputs. The Criteria Manager uses the Quality Engine to score
known-good and known-bad examples, and checks that the rule
discriminates between them.

This is the Control Plane's lifecycle (candidate → validated →
released → deprecated) applied to quality criteria.

### 2.9 Learning Loop

Not a separate service. A set of periodic computations over the
Outcome Ledger.

**Loop 1: Router learning** (after every N outcomes or on schedule)

```
FOR each task_type:
  FOR each model:
    historicalRate = successRate(task_type, model)
    // success = qualityScore >= minQuality AND userFeedback != "rejected"
  UPDATE routing table
```

Effect: over time, the router stops trying models that consistently
fail for a task type, and starts with the cheapest model that works.

**Loop 2: Criteria refinement** (weekly or on threshold)

```
FOR each active rule:
  predictivePower = correlation(rule.passed, userFeedback == "accepted")
  IF predictivePower < 0.1 over 100+ samples:
    FLAG rule as "low predictive power" → suggest deprecation
  IF rule always passes (pass rate > 99%):
    FLAG rule as "non-discriminating" → suggest removal
  IF rule always fails (fail rate > 50%):
    FLAG rule as "too strict" → suggest revision
```

Effect: criteria that don't actually predict quality are pruned.
Criteria that are too strict or too lenient are flagged.

**Loop 3: Cost optimization** (continuous)

```
FOR each task_type:
  avgEscalationRate = escalationCount / totalTasks
  IF avgEscalationRate < 5%:
    // cheap model almost always works → skip mid tier
    UPDATE routing: remove mid-tier step
  IF avgEscalationRate > 60%:
    // cheap model rarely works → start at mid tier (saves escalation cost)
    UPDATE routing: start at mid tier
```

Effect: the system learns when trying cheap-first is wasteful (because
escalation cost > direct expensive cost) and adjusts.

---

## 3. Data Model (Entity Relationships)

```
QualityRule ──────┐
  (criteria)      │
                  ▼
Task ──────► Evaluation ──────► OutcomeRecord
  │              │                    │
  │              ├──► ModelCall       │
  │              │    (per attempt)   │
  │              │                    │
  │              └──► PolicyCheck     │
  │                                   │
  └──► RoutingDecision ◄──────────────┘
       (which models,         (feedback loop)
        which order)

ModelCatalog
  (provider, model, tier, cost, capabilities)
```

Core tables (PostgreSQL schema, Phase 3):

```sql
-- Quality criteria (evolved "sprouts")
CREATE TABLE quality_rules (
  rule_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft',
  strategy      TEXT NOT NULL,           -- deterministic | rubric | composite
  config        JSONB NOT NULL,
  task_types    TEXT[] DEFAULT '{}',
  context_match JSONB DEFAULT '{}',
  weight        REAL NOT NULL DEFAULT 1.0,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL
);

-- Every evaluation request and its outcome
CREATE TABLE outcomes (
  outcome_id      TEXT PRIMARY KEY,
  task_type       TEXT NOT NULL,
  context         JSONB DEFAULT '{}',
  min_quality     REAL NOT NULL,
  model_used      TEXT NOT NULL,
  provider        TEXT NOT NULL,
  quality_score   REAL NOT NULL,
  escalated       BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_count INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  cost_usd        REAL NOT NULL,
  latency_ms      INTEGER NOT NULL,
  judge_model     TEXT,
  judge_cost_usd  REAL,
  policy_allowed  BOOLEAN NOT NULL DEFAULT TRUE,
  user_feedback   TEXT,                  -- accepted | rejected | edited
  feedback_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL
);

-- Per-criterion results for each evaluation
CREATE TABLE criteria_results (
  outcome_id    TEXT REFERENCES outcomes(outcome_id),
  rule_id       TEXT REFERENCES quality_rules(rule_id),
  passed        BOOLEAN NOT NULL,
  score         REAL NOT NULL,
  detail        TEXT,
  PRIMARY KEY (outcome_id, rule_id)
);

-- Model catalog
CREATE TABLE models (
  model_id        TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,
  tier            TEXT NOT NULL,
  cost_per_m_in   REAL NOT NULL,
  cost_per_m_out  REAL NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Routing statistics (materialized, refreshed periodically)
CREATE TABLE routing_stats (
  task_type       TEXT NOT NULL,
  model_id        TEXT REFERENCES models(model_id),
  total_tasks     INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  success_rate    REAL,
  avg_cost_usd    REAL,
  updated_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (task_type, model_id)
);
```

---

## 4. Mapping from Existing MemoSprout Code

What is reused, what is refactored, what is new.

| New Component | Source | Change |
|---|---|---|
| Quality Engine (deterministic) | `lib/eval/engine/oracles.ts` StructuredCheckOracle | Refactor: decouple from file-based evaluation, make it evaluate string output |
| Quality Engine (rubric) | `lib/eval/engine/oracles.ts` RubricJudgeOracle | Refactor: same, plus multi-model judge selection |
| Quality Engine (composite) | new | New: weighted combination of strategies |
| Smart Router | `lib/router/router.ts` + `lib/router/models.ts` | Refactor: add historical-rate learning, multi-step routing plans |
| Outcome Ledger | `lib/ledger/ledger.ts` + `lib/ledger/schema.ts` | Refactor: new schema with routing + quality + feedback fields |
| Policy Gate | `lib/reflex/gate.ts` + `lib/reflex/schema.ts` | Refactor: from file-edit blocking to content blocking |
| Criteria Manager | `lib/control-plane/control-plane.ts` | Refactor: from sprout lifecycle to quality rule lifecycle |
| Model Adapters | `lib/eval/v3/frontier-worker.ts` | Major refactor: extract OpenAI-compatible adapter, add providers |
| Task Classifier | new | New (Phase 2) |
| API Gateway | `lib/mcp/tools.ts` (pattern) | New: REST API instead of MCP |
| Learning Loop | new | New: periodic computations over ledger |
| Analytics API | new | New: reporting endpoints |

Estimated reuse: ~60% of the core logic is refactored from existing
code. ~40% is new (API layer, learning loop, multi-provider adapters,
analytics).

---

## 5. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Existing expertise, existing codebase |
| API framework | Hono | Lightweight, fast, TypeScript-native, deployable anywhere |
| Runtime | Node.js 24 | Existing standard |
| Validation | Zod 4 | Existing standard |
| Testing | Vitest | Existing standard |
| Storage (Phase 1) | JSON files | Simplest, existing pattern |
| Storage (Phase 2) | SQLite (better-sqlite3) | Single-node, queryable, no infra |
| Storage (Phase 3) | PostgreSQL | Multi-tenant, analytics |
| Cache (Phase 2+) | In-memory LRU → Redis | Routing table cache |
| Deployment | Single container → Fly.io / Railway | Small team, simple ops |
| Package manager | pnpm | Existing standard |

Why Hono over Next.js API routes:
- QualityGate is an API product, not a web app
- Hono is faster, lighter, and deployable to more targets
- Next.js adds unnecessary complexity for a pure API service
- The existing Next.js app (landing page, dashboard) can remain as a
  separate frontend that calls the Hono API

---

## 6. Phased Implementation

### Phase 1 — Core Loop (MVP)

Goal: one API endpoint that takes a task, tries models cheap-first,
scores quality, escalates if needed, returns the result.

Build:
- [ ] Hono API server with POST /v1/evaluate
- [ ] OpenAICompatibleAdapter (covers DeepSeek, Qwen, Kimi, MiniMax)
- [ ] OpenAI adapter (existing, refactor from frontier-worker.ts)
- [ ] Quality Engine with deterministic + rubric strategies
- [ ] Quality rules as JSON config files (no DB yet)
- [ ] Simple router: always cheapest → mid → frontier ladder
- [ ] Outcome Ledger as JSON file
- [ ] Policy Gate with built-in PII + forbidden terms
- [ ] CLI tool for testing: `qg evaluate --task "..." --rules "..."`

Not in Phase 1:
- Learning loop (router is static ladder)
- Criteria Manager UI (rules are config files)
- Analytics endpoints
- Multi-tenant
- Dashboard

Exit gate: send a task via API, get quality-scored output from the
cheapest model that passes, with full outcome recording.

### Phase 2 — Learning

Goal: the system gets smarter over time.

Build:
- [ ] SQLite storage for outcomes
- [ ] Router learning: compute historicalRate per (task_type, model)
- [ ] Criteria refinement: flag low-predictive-power rules
- [ ] Cost optimization: adjust routing based on escalation patterns
- [ ] POST /v1/feedback endpoint (user accept/reject)
- [ ] GET /v1/analytics/* endpoints
- [ ] Criteria Manager: CRUD + lifecycle (draft → validated → active)

Exit gate: after 100 evaluations, the router demonstrably picks better
starting models than the static ladder.

### Phase 3 — Scale

Goal: multi-tenant, production-grade.

Build:
- [ ] PostgreSQL storage
- [ ] Multi-tenant isolation (API keys, per-tenant rules + outcomes)
- [ ] Rate limiting + billing integration
- [ ] Anthropic adapter (Claude)
- [ ] Dashboard (Next.js frontend, calls Hono API)
- [ ] Criteria validation workflow (A/B test rules against samples)
- [ ] Webhook for async feedback

Exit gate: two independent tenants with isolated rules, outcomes, and
routing tables.

---

## 7. Key Design Decisions

### QG-001: Quality criteria are NOT generic prompts

A quality criterion is a structured, versioned, validated object — not
a system prompt that says "be a good judge." Each criterion has a
strategy (deterministic / rubric / composite), a config, a weight, and
validation evidence. This is the core differentiator from "LLM-as-judge
with a vibe prompt."

### QG-002: Generator and judge are always different models

From MemoSprout BW-010: do not use the same model as both generator and
oracle. The judge model is selected independently. For cheap generation,
use a mid-tier judge. For frontier generation, use a different frontier
model. This prevents self-grading bias.

### QG-003: Escalation is bounded

Max escalations per request is configurable (default 2). The system
never enters an unbounded escalation loop. If all models fail quality,
return the best output with a quality warning, not an error.

### QG-004: User feedback is the strongest signal

Quality scores from the engine are proxies. User feedback
(accept/reject/edit) is ground truth. The learning loop weights user
feedback above engine scores when they conflict.

### QG-005: Honest measurement

From MemoSprout's methodology: the system must be able to detect and
report its own measurement errors. Every quality score includes the
judge model, the criteria used, and the raw per-criterion results.
Analytics include confidence intervals, not just point estimates.
If the system's quality predictions diverge from user feedback, this
is flagged, not hidden.

### QG-006: Model-agnostic by design

No model is privileged. The ModelAdapter interface is provider-agnostic.
Adding a new provider requires implementing one interface. The router
treats all models as interchangeable candidates ranked by (quality,
cost). The product's value is in the quality criteria and learning
data, not in any model relationship.

### QG-007: Criteria are the moat, not routing

Routing (try cheap → escalate) is trivially copyable. The moat is:
(a) validated, context-specific quality criteria that discriminate
good from bad output for a specific use case, and
(b) accumulated outcome data that makes routing and criteria more
accurate over time. Both are proprietary per customer and compound
with usage.

---

## 8. Example: Product Description for Tokopedia

Concrete walkthrough of the full system.

**Setup (one-time):**

```json
// Quality rules for "product-description" task type
[
  {
    "ruleId": "rule-tokopedia-format",
    "name": "Tokopedia format compliance",
    "strategy": "deterministic",
    "config": {
      "checks": [
        { "type": "length", "min": 200, "max": 2000 },
        { "type": "contains", "value": "Berat:" },
        { "type": "not_contains", "value": "termurah" },
        { "type": "not_contains", "value": "terbaik" }
      ]
    },
    "weight": 2.0
  },
  {
    "ruleId": "rule-brand-voice",
    "name": "Brand voice: casual Indonesian",
    "strategy": "rubric",
    "config": {
      "rubric": "Evaluate whether this product description: 1) Uses 'kamu' not 'Anda', 2) Has a friendly, conversational tone, 3) Uses at most 2 emoji, 4) Does not use formal/bureaucratic language. Score each 0 or 1."
    },
    "weight": 1.5
  },
  {
    "ruleId": "rule-seo-keywords",
    "name": "SEO keyword inclusion",
    "strategy": "deterministic",
    "config": {
      "checks": [
        { "type": "contains_any", "values": ["{primary_keyword}", "{secondary_keyword}"] }
      ]
    },
    "weight": 1.0
  }
]
```

**Request:**

```json
POST /v1/evaluate
{
  "task": "Tulis product description untuk: Kaos Polos Cotton Combed 30s, tersedia ukuran S-XXL, bahan adem dan nyaman",
  "context": {
    "taskType": "product-description",
    "platform": "tokopedia",
    "language": "id",
    "primary_keyword": "kaos polos cotton combed",
    "secondary_keyword": "kaos polos adem"
  },
  "qualityRules": ["rule-tokopedia-format", "rule-brand-voice", "rule-seo-keywords"],
  "minQuality": 0.8,
  "maxCostTier": "mid"
}
```

**Processing:**

```
1. Router: task_type="product-description", historical data shows
   deepseek-v3 passes 89% → start with deepseek-v3 (cheapest)

2. DeepSeek generates output (cost: $0.0002)

3. Quality Engine scores:
   - rule-tokopedia-format: PASS (length 450, contains "Berat:", no superlatives)
   - rule-brand-voice: 0.75 (uses "Anda" in one sentence → rubric judge flags it)
   - rule-seo-keywords: PASS (contains "kaos polos cotton combed")
   - Overall: 0.82 (weighted)

4. 0.82 >= 0.80 (minQuality) → no escalation needed

5. Policy Gate: no PII, no forbidden terms → ALLOW

6. Ledger records: model=deepseek-v3, score=0.82, escalated=false,
   cost=$0.0002, judge=qwen-3-32b, judge_cost=$0.0001

7. Response returned. Total cost: $0.0003. Latency: 1.2s.
```

**If DeepSeek had scored 0.65:**

```
4. 0.65 < 0.80 → escalate to qwen-3-235b (mid tier)
5. Qwen generates new output (cost: $0.001)
6. Quality Engine re-scores: 0.91 → PASS
7. Ledger records: escalated=true, escalation_count=1,
   total_cost=$0.0013 (deepseek + qwen + judges)
```

**After 500 requests, learning loop observes:**

```
- deepseek-v3 passes "product-description" 91% of the time
- qwen-3-235b passes 96%
- Escalation only needed 9% of the time
- Average cost: $0.0004 per task (vs $0.003 if always using frontier)
- Rule "rule-seo-keywords" passes 99.8% → flagged as non-discriminating
- User rejection correlates most with "rule-brand-voice" failures
  → weight increased from 1.5 to 2.0
```

---

## 9. Directory Structure (New)

```
qualitygate/
├── src/
│   ├── api/                    # Hono routes
│   │   ├── evaluate.ts         # POST /v1/evaluate
│   │   ├── rules.ts            # CRUD /v1/rules
│   │   ├── analytics.ts        # GET /v1/analytics/*
│   │   └── feedback.ts         # POST /v1/feedback
│   ├── router/                 # Smart Router
│   │   ├── router.ts           # Routing logic (evolved from lib/router)
│   │   ├── models.ts           # Model catalog
│   │   └── learning.ts         # Router learning from ledger
│   ├── adapters/               # Model Adapters
│   │   ├── types.ts            # ModelAdapter interface
│   │   ├── openai-compatible.ts # DeepSeek, Qwen, Kimi, MiniMax, MiMo
│   │   ├── openai.ts           # OpenAI (evolved from frontier-worker)
│   │   └── anthropic.ts        # Claude
│   ├── quality/                # Quality Engine
│   │   ├── engine.ts           # Score orchestration
│   │   ├── deterministic.ts    # Deterministic checks (evolved from StructuredCheckOracle)
│   │   ├── rubric.ts           # Rubric judge (evolved from RubricJudgeOracle)
│   │   └── composite.ts        # Weighted combination
│   ├── policy/                 # Policy Gate
│   │   ├── gate.ts             # Policy enforcement (evolved from ReflexGate)
│   │   └── built-in.ts         # PII, forbidden terms, language
│   ├── ledger/                 # Outcome Ledger
│   │   ├── ledger.ts           # Record + query (evolved from lib/ledger)
│   │   └── schema.ts           # Zod schemas
│   ├── criteria/               # Criteria Manager
│   │   ├── manager.ts          # Lifecycle (evolved from ControlPlane)
│   │   └── schema.ts           # QualityRule schema
│   ├── learning/               # Learning Loop
│   │   ├── router-learning.ts  # Update routing stats
│   │   ├── criteria-learning.ts # Flag low-power rules
│   │   └── cost-learning.ts    # Optimize escalation patterns
│   └── index.ts                # Server entry point
├── tests/
├── rules/                      # Default quality rules (JSON)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

This can live inside the existing MemoSprout repository as a new
top-level directory, or as a separate repository. Recommendation:
separate repository once Phase 1 is validated, monorepo during
development to reuse existing code directly.

---

## 10. Model Evolution

New models appear constantly. The architecture must absorb them
without code changes, manual re-tiering, or service interruption.

### 10.1 Strategic position

QualityGate's value is NOT "models differ, so we route between them."
That is a temporary arbitrage. QualityGate's value is "you need to
know whether AI output meets YOUR quality bar, regardless of which
model produced it." Quality criteria are model-agnostic. A new model
does not invalidate them — it needs to be measured against them.

A new, better model is an OPPORTUNITY for QualityGate: "Is this model
actually better for YOUR use case?" is a question only a system with
validated criteria and historical outcome data can answer honestly.

### 10.2 Dynamic Model Registry

Models are not a hardcoded catalog. They are registered entities
managed via API.

```typescript
interface ModelRegistration {
  modelId: string;
  provider: string;
  apiFormat: "openai-compatible" | "anthropic" | "custom";
  baseUrl: string;
  costPerMInput: number;
  costPerMOutput: number;
  maxContextTokens: number;
  registeredAt: string;
  status: "shadow" | "active" | "deprecated";
}
```

Adding a new model is one API call, not a code deployment:

```
POST /v1/admin/models
{
  "modelId": "gpt-7",
  "provider": "openai",
  "apiFormat": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "costPerMInput": 2.0,
  "costPerMOutput": 8.0,
  "status": "shadow"
}
```

Because most providers offer OpenAI-compatible APIs, a new provider
typically needs zero adapter code — register with the correct
`baseUrl` and `apiFormat: "openai-compatible"`.

### 10.3 Tier is computed, not assigned

Tier ("cheap", "mid", "frontier") is derived from outcome data, not
set at registration.

```
FOR each (model, task_type) with sufficient samples:
  efficiency = successRate / avgCostUsd
  tier = rank by efficiency within the model set:
    top quartile cost, meets quality bar     → "cheap"
    middle quartile cost, meets quality bar  → "mid"
    highest successRate regardless of cost   → "frontier"
```

Consequence: if a new cheap model matches frontier quality, it is
automatically classified "cheap" and the previous frontier model
shifts to "mid" — no manual intervention.

### 10.4 Shadow mode for new models

A newly registered model starts in `shadow` status. It does not
receive production traffic. Instead:

```
1. Production request arrives → routed to existing active models
   (client unaffected).
2. Asynchronously (non-blocking): the shadow model also generates
   an output for the same task.
3. Quality Engine scores both outputs against the same criteria.
4. Ledger records: existing_score, shadow_score, existing_cost,
   shadow_cost — per task_type.
5. After N samples (default 200 per task_type):
   - shadow >= existing in 80%+ of task types → promote to "active"
   - shadow < existing → remain shadow or deprecate
```

This is the Control Plane lifecycle (BW-030: candidate → validated →
released) applied to models instead of sprouts.

```
Model lifecycle:  shadow → active → deprecated
                     │                  ▲
                     └── (not good) ────┘
```

### 10.5 Auto-benchmark on registration

When a model is registered, the system can run a benchmark against
historical tasks that already have ground-truth quality scores.

```typescript
interface BenchmarkResult {
  modelId: string;
  perTaskType: Array<{
    taskType: string;
    newModelScore: number;
    existingBestScore: number;
    delta: number;
    newModelCostUsd: number;
    existingBestCostUsd: number;
  }>;
  recommendation: "promote" | "shadow-longer" | "reject";
}
```

The benchmark uses the customer's OWN validated quality criteria, not
generic benchmarks. "Model X scores 87% against your Tokopedia quality
rules at 40% of the current cost" is actionable. "Model X scores 94%
on MMLU" is not.

### 10.6 Model deprecation handling

When a provider removes a model (404 / "model not found"):

```
1. Adapter error detected → router excludes model from routing plan
2. Traffic falls through to next model in the routing plan
3. Admin alert: "Model X unavailable, traffic routed to Y"
4. After 7 days without recovery → status = "deprecated"
5. Historical outcome data remains in the ledger
```

No downtime. No client-facing errors. The multi-step routing plan
already handles individual model failure.

### 10.7 Design decision QG-008

**QG-008: New models are opportunities, not threats.**

The system treats every new model as a candidate to be measured
against existing criteria and historical data. The quality criteria
layer is the stable foundation; models are interchangeable
participants measured against it. The product survives any model
evolution because its value is in the criteria and accumulated
outcome data, not in any model relationship or routing arbitrage.
