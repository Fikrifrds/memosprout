# Executive Summary

MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs. It is a **continuous-improvement control plane for AI agents** that transforms real-world work experience—Agent Runs, test failures, rejected pull requests, Human Corrections, incidents, and business outcomes—into agent knowledge that:

- is open and portable through the **Open Knowledge Format (OKF)**;
- has provenance, scope, authority, and a lifecycle;
- is tested before reuse;
- is compiled into artifacts suitable for Codex, Claude Code, OpenCode, CI, and runtime policies;
- is monitored for its impact on outcomes;
- can be promoted, canary-released, rolled back, or retired.

The initial wedge is **AI coding agents**. MemoSprout turns recurring feedback such as “do not edit generated files,” “add a regression test,” or “the payment callback must be idempotent” into executable protections: tests, static checks, hooks, skills, instructions, or policies.

> **Correct once. Improve every agent.**

MemoSprout does not replace coding agents, IDEs, models, vector databases, Obsidian, or OKF. MemoSprout is the operational layer that makes agent knowledge and experience **verified, usable across vendors, and capable of producing measurable improvements**.

> **Scope notice:** This document provides long-term product context and must not expand the current Build Week implementation scope. [`docs/prd/BUILD_WEEK_PRD.md`](./BUILD_WEEK_PRD.md) is authoritative for the current implementation. The accepted long-term architecture described here remains intact, but it does not add Build Week deliverables.

MemoSprout improves **system intelligence** through verified knowledge, context, controls, and replay—not the intrinsic intelligence or model weights of a smaller language model. It does not claim universal equivalence between small models and frontier models. For recurring, organization-specific, and verifiable workflows, efficient models enhanced by MemoSprout may approach frontier-model outcomes at a substantially lower cost.

# 1. Background and Context

## 1.1 Changes in How Software Is Built

Coding agents have evolved from autocomplete tools into task executors that can read repositories, modify multiple files, run commands, create tests, and prepare pull requests. Teams are beginning to use more than one runtime: Codex, Claude Code, OpenCode, internal agents, or local models.

This progress creates new problems. Agent capabilities are growing faster than organizations' ability to:

- retain project knowledge across sessions and vendors;
- consolidate code-review corrections;
- prove that new memory or skills genuinely help;
- control changes in agent behavior;
- prevent the same mistakes from recurring;
- explain why an agent took an action.

## 1.2 Current Product Landscape

Modern coding runtimes already provide some of the required primitives:

- MCP to give agents access to context and tools;
- project instructions such as `AGENTS.md` or equivalent files;
- skills;
- lifecycle hooks and plugins;
- permission controls;
- session history and some memory.

However, these primitives do not automatically form the following organizational loop:

```text
Human Correction or failed outcome
          ↓
Extract reusable lesson with evidence
          ↓
Choose the strongest enforcement artifact
          ↓
Replay against historical or synthetic tasks
          ↓
Measure improvement and false positives
          ↓
Approve and publish to every relevant agent
          ↓
Observe future outcomes and rollback if harmful
```

## 1.3 Relationship to Obsidian, Second Brains, and OKF

Obsidian and the concept of an LLM wiki focus on organizing knowledge: **what is known**. MemoSprout focuses on Operational Distillation: **what has been proven to work and how to apply it safely**.

Google OKF v0.1 is a draft specification for Markdown- and YAML-frontmatter-based knowledge bundles. `type` is required, while additional metadata is permitted and consumers must tolerate unknown fields. This suits MemoSprout because customer knowledge remains portable, human-readable, Git-friendly, and free from vendor lock-in. [S1]

MemoSprout does not create a competing format. MemoSprout creates an **Experience Profile for OKF** and an operational system on top of it.

# 2. Vision, Mission, and Product Thesis

## 2.1 Vision

> Become the learning and control system that enables every organization's AI workforce to improve from real outcomes without sacrificing transparency, data ownership, or human control.

## 2.2 Mission

- Turn Human Corrections into reusable assets.
- Make agent knowledge portable across models and runtimes.
- Test every behavioral change before production.
- Link knowledge to evidence and outcomes.
- Place enforcement outside the model whenever possible.
- Make improvement measurable, reversible, and auditable.

## 2.3 Long-Term Product Thesis

Models, context windows, basic memory, and skills will increasingly become commodities. The enduring needs are to:

1. know what changes were made to an agent;
2. prove that those changes improve outcomes;
3. manage rollouts and rollbacks;
4. keep knowledge valid and noncontradictory;
5. connect agent behavior to business outcomes;
6. retain control across multiple vendors.

MemoSprout must become **vendor-neutral Agent Improvement Infrastructure**, not a generic memory application.

# 3. Problem Statement

## 3.1 Core Problem

Project knowledge is scattered across source code, READMEs, ADRs, PR comments, issues, chats, and reviewers' minds. When a coding agent makes a mistake and a human corrects it, that correction usually remains only a comment or conversation. Other agents do not automatically receive the same lesson, and there is no evidence that adding memory will prevent recurrence.

## 3.2 Business Impact

- reviewers write the same comments repeatedly;
- AI-generated PRs require many iterations;
- new models repeat old bugs or antipatterns;
- security rules depend on the agent “remembering” a prompt;
- organizations lack benchmarks based on real work;
- knowledge from vendor A is not portable to vendor B;
- the source of an agent decision is difficult to explain;
- changes to prompts, models, skills, or tools can break workflows undetected.

## 3.3 Why Native Solutions Are Not Enough

Native memory and instructions are useful, but they have limitations:

- they are often text that the model can ignore;
- they are not always portable across runtimes;
- they lack consistent evidence and lifecycles;
- they are not automatically tested against a baseline;
- they rarely measure false-positive or harm rates;
- they are not always compiled into deterministic tests or policies;
- they do not connect knowledge use to future outcomes.

# 4. Positioning and Category

## 4.1 Primary Positioning

**MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs.**

**MemoSprout is the verification and deployment layer for open agent knowledge.**

Market-facing version:

> **Correct once. Improve every agent.**

Enterprise version:

> **Every change to an AI agent is tested, governed, measurable, and reversible.**

## 4.2 Category

The intended category is **Agent Improvement Infrastructure** or **Agent Knowledge CI/CD**.

## 4.3 What MemoSprout Is Not

- not a chatbot knowledge base;
- not an Obsidian clone;
- not a vector database;
- not primarily a model router;
- not a coding editor;
- not a generic agent builder;
- not a prompt-management dashboard;
- not merely a static security gateway;
- not a proprietary knowledge format.

# 5. Target Market and Personas

## 5.1 Beachhead Market

Software teams that:

- have 10–300 developers;
- actively use one or more coding agents;
- produce many AI-assisted changes;
- receive recurring review feedback;
- manage multiple repositories;
- need architecture, testing, or security standardization;
- want to test new models or runtimes without losing quality control.

## 5.2 Primary Personas

| Persona | Problem | MemoSprout Value |
|---|---|---|
| AI Platform Engineer | Fragmented agent stack | One improvement layer across vendors |
| Engineering Manager | Repeated reviews and inconsistent quality | Lower recurrence and higher first-pass success |
| Staff/Principal Engineer | Architecture decisions are not followed | Authoritative knowledge + architecture checks |
| AppSec Lead | Policies exist only in documents | Compile them into static/runtime enforcement |
| Developer | Must explain context repeatedly | Context and procedures appear exactly when needed |
| CTO/VP Engineering | Unknown coding-agent ROI | Outcome Ledger and measured improvement |

## 5.3 Future Personas

Once the coding wedge is proven, the platform can expand into support, operations, procurement, finance, and internal research—domains where agents take real actions and require improvement governance.

# 6. Jobs to Be Done

1. When the same review comment appears several times, help me turn it into permanent protection.
2. When a new agent works on a repository, provide only relevant, approved context.
3. When I change models or runtimes, test against historical work before rollout.
4. When an agent makes a mistake, show the context, rule, tool, and version that influenced it.
5. When knowledge changes, show the blast radius and regression risk.
6. When a lesson is no longer valid, deprecate and roll it back without deleting history.
7. When an organization uses many agents, distribute the same experience without creating a locked-in format.

# 7. Core Concepts and Domain Model

## 7.1 Sprout

A Sprout is a unit of knowledge or experience with a source, scope, lifecycle, and evidence. A Sprout is not automatically considered correct merely because an LLM created it.

Initial types:

- `Agent Experience`
- `Known Failure`
- `Validated Procedure`
- `Architecture Decision`
- `Project Constraint`
- `Runtime Reflex`
- `Evaluation Summary`
- `Improvement Release`

## 7.2 Candidate Sprouts and Validated Sprouts

Minimum lifecycle:

```text
Observed → Candidate Sprout → In Review → Testing → Validated Sprout → Active
                                              ↓
                                      Rejected / Needs Work
Active → Superseded / Expired / Retired
```

## 7.3 Evidence

Evidence may come from:

- Agent Run;
- Human Correction;
- rejected or merged PR;
- test failure and passing test;
- commit;
- incident;
- ADR or approved document;
- outcome metric.

## 7.4 Improvement Artifact

A Sprout can be compiled into one or more artifacts:

| Artifact | When to Use It |
|---|---|
| Regression test | Behavior can be proven through a test |
| Static analysis rule | A code pattern can be detected syntactically or semantically |
| Pre-tool hook | An action must be prevented before it occurs |
| CI check | Enforcement must apply even if the agent ignores guidance |
| Skill | A complex, reusable procedure |
| Project instruction | A general convention that must always be visible |
| Human approval gate | High risk with nondeterministic ground truth |
| Runtime Reflex | Cross-agent/tool intervention in production |
| Knowledge-only OKF | Important information that cannot yet be enforced |

Design priority:

```text
Deterministic test > static check > hook/policy > approval > skill > instruction > memory
```

## 7.5 Improvement Release

A set of Sprouts and artifacts promoted together, with a version, changelog, target runtime, canary scope, and rollback pointer.

# 8. Open Knowledge Format Strategy

## 8.1 Decision

MemoSprout adopts OKF v0.1 as an **exchange format**, with a richer internal canonical model. Because OKF remains a draft, all imports and exports go through a versioned adapter. [S1]

## 8.2 MemoSprout Experience Profile

Example portable artifact:

```markdown
---
type: Agent Experience
title: Generated files must not be edited directly
description: Modify the source schema and rerun the generator.
tags: [coding-agent, generated-code]
timestamp: 2026-07-18T09:00:00Z

memosprout:
  profile: agent-experience
  profile_version: "0.1"
  status: validated
  scope:
    repositories: [example-api]
    paths: ["generated/**"]
  evidence:
    pull_requests: [184]
    runs: [run-184, run-185]
  validation:
    baseline_success_rate: 0.40
    improved_success_rate: 1.00
    replay_tasks: 10
    false_positives: 0
  authority:
    approved_by: [backend-team]
---

# Trigger
An agent needs to modify a generated API client.

# Validated procedure
1. Modify the source schema.
2. Run the generator.
3. Review generated changes.
4. Run tests.

# Prohibited action
Do not edit generated files directly.
```

## 8.3 Bundle Structure

```text
.memosprout/knowledge/
├── index.md
├── log.md
├── decisions/
├── experiences/
├── failures/
├── procedures/
├── reflexes/
├── evaluations/
└── releases/
```

## 8.4 Internal Model vs. OKF

Operational data such as raw traces, permissions, replay jobs, secrets, billing, and detailed metrics remain in the database. OKF serves as a transparent knowledge artifact, not an operational database.

# 9. End-to-End Product Flow

## 9.1 Coding-Agent Improvement Loop

```text
1. Agent performs task
2. MemoSprout records task, tools, diff, tests, and outcome
3. Reviewer corrects or accepts the result
4. Experience Compiler proposes a Candidate Sprout
5. Human reviews trigger, scope, and lesson
6. Artifact Compiler proposes test/check/hook/skill
7. Eval Lab runs a Baseline Run and a Protected Run through Historical Replay
8. Reviewer sees improvement and false-positive report
9. Approved release is published as OKF + native artifacts
10. Relevant agents receive it through MCP/hooks/plugins/CI
11. Future outcomes are linked back to the Sprout
12. Harmful or stale Sprouts are rolled back or retired
```

## 9.2 Manual-First Flow

To avoid unsafe automatic learning, the initial version uses explicit actions:

```bash
memosprout learn --from-pr 184
memosprout review sprout_42
memosprout validate sprout_42
memosprout publish sprout_42
```

Automatic detection only creates inbox suggestions; it never promotes them automatically.

## 9.3 Cross-Agent Flow

One universal Sprout is compiled for each target runtime:

```text
Universal Sprout
   ├── Codex plugin + hooks + AGENTS.md excerpt
   ├── Claude Code plugin + hooks + skill
   ├── OpenCode plugin + skill
   ├── Generic MCP resource/tool
   └── GitHub Action / CI rule
```

# 10. Product Modules and Functional Requirements

## 10.1 Module A — Local Runtime and CLI

### Objective

Provide a local-first, privacy-first, vendor-neutral experience.

### Functional Requirements

- `memosprout init` detects the repository, languages, test commands, agent runtimes, and existing instructions.
- Store configuration in `.memosprout/config.yaml`.
- Run a local daemon through stdio or localhost.
- Provide a local SQLite store.
- Provide secret scanning and ignore rules.
- Provide a health check through `memosprout doctor`.
- Operate without the cloud for the core workflow.

### Minimum CLI

```text
init        initialize project
capture     import run, PR, comment, diff, or incident
propose     generate Candidate Sprout
review      inspect/edit evidence and scope
validate    run Baseline Run/Protected Run evaluation
publish     write OKF and runtime artifacts
serve       start MCP/local API
status      show active release and pending candidates
diff        compare knowledge releases
rollback    restore prior release
doctor      verify integrations
```

## 10.2 Module B — Flight Recorder

Record enough metadata for reproduction without requiring storage of the entire conversation.

Required fields:

- task and acceptance criteria;
- runtime/model/version;
- repository and commit base;
- context/skill/release versions;
- tool calls and results;
- changed files and patch hash;
- tests/build/lint results;
- Human Corrections;
- final outcome;
- privacy classification.

Raw prompt logging defaults to **off** for enterprise customers. Metadata and hashes can be stored without raw source content.

## 10.3 Module C — Experience Compiler

Input:

- failed/successful run pair;
- review comment;
- test result;
- existing OKF knowledge;
- repository context.

Structured output:

- proposed title/type;
- trigger;
- lesson/procedure;
- prohibited actions;
- scope;
- evidence links;
- confidence;
- ambiguity warnings;
- suggested artifact class;
- required validation plan.

Guardrails:

- must not claim causal certainty from a single trace;
- distinguish observations, inferences, and approved facts;
- avoid generalization beyond the scope;
- detect contradictions with active Sprouts;
- a Candidate Sprout always requires review for production use.

## 10.4 Module D — OKF Registry

- Import/export OKF bundle.
- Validate conformance.
- Preserve unknown metadata fields.
- Generate `index.md` and `log.md`.
- Version releases in Git.
- Search by type, tag, scope, source, status, and validity.
- Show provenance graph.
- Support supersedes/superseded-by relationship.

## 10.5 Module E — Artifact Compiler

The compiler selects outputs based on enforceability:

- test generator;
- Semgrep/custom linter template;
- CI script;
- Codex hook/plugin package;
- Claude Code hook/plugin/skill package;
- OpenCode plugin/skill package;
- `AGENTS.md`/project instruction patch;
- MCP resource/tool;
- runtime policy.

Every artifact must retain the source Sprout ID and a generated-file header so provenance is not lost.

## 10.6 Module F — Eval Lab

### Evaluation Modes

- deterministic repository tests;
- Historical Replay against commits;
- synthetic task variants;
- model/runtime comparison;
- semantic grader;
- policy false-positive suite;
- canary production outcome.

### Required Metrics

- Baseline Run success;
- Protected Run success;
- delta;
- regressions;
- false positives;
- false negatives when measurable;
- latency/cost;
- affected task classes;
- confidence interval or warning when the sample is small.

### Promotion Rule

There is no universal threshold. Default launch policy:

- at least five replay tasks;
- no severe regressions;
- false-positive rate below the configured threshold;
- human approval;
- canary release for high-risk artifacts.

## 10.7 Module G — Agent Adapters

### Codex

- MCP server for query, recall, and reporting.
- `SessionStart` for context injection.
- `PreToolUse`/`PermissionRequest` for enforcement.
- `PostToolUse`/`Stop` for recording.
- Plugin package for distribution. Codex currently supports MCP, plugins, and lifecycle hooks, with trust review for unmanaged hooks. [S2][S3]

### Claude Code

- MCP server.
- plugin containing skills, hooks, and configuration.
- lifecycle hooks for context, blocking, and outcome capture.
- enterprise deployment through managed settings where available. Claude Code supports shell, HTTP, and prompt hooks, as well as MCP. [S4][S5]

### OpenCode

- local/remote MCP.
- plugin with `tool.execute.before` and `tool.execute.after`.
- skills and project configuration.
- adapter considered beta until event schemas stabilize. [S6][S7]

## 10.8 Module H — Runtime Reflex Gate

Later phase. The gate sits between agents and high-risk tools.

Decisions:

- allow;
- transform input;
- require approval;
- pause;
- block;
- log only.

A Runtime Reflex must be deterministic where possible and must not depend on hidden chain-of-thought. The stored evidence chain consists of the policy, source, state, and observed data.

## 10.9 Module I — Outcome Ledger

Connects Agent Runs to real outcomes:

| Domain | Outcome Examples |
|---|---|
| Coding | tests, PR merge, review comments, regression, incident |
| Support | resolution, escalation, incorrect refund, CSAT |
| Sales | reply, meeting, conversion, spam complaint |
| Operations | completion, override, rollback, SLA violation |

The Outcome Ledger is a moat because model providers do not automatically possess this organization-specific history.

## 10.10 Module J — Team Control Plane

- workspace and repository management;
- roles and permissions;
- candidate inbox;
- approval workflow;
- knowledge releases;
- canary deployment;
- audit log;
- analytics;
- model/runtime matrix;
- retention policy;
- self-hosted/private edge configuration.

# 11. UX and Information Architecture

## 11.1 Navigation

```text
Overview
Runs
Candidates
Knowledge
Eval Lab
Releases
Agents
Integrations
Outcomes
Policies
Settings
```

## 11.2 Overview

Key cards:

- repeated corrections detected;
- Validated Sprouts;
- active agents protected;
- recurrence reduction;
- first-pass success delta;
- false-positive rate;
- pending reviews.

## 11.3 Candidate Review

Reviewers must see the following on one screen:

- source run/PR/comment;
- before/after diff;
- test evidence;
- proposed trigger and scope;
- existing conflicting knowledge;
- recommended artifact;
- risk classification;
- buttons: edit, reject, test, approve.

## 11.4 Evaluation Comparison

```text
                  Baseline Run    Protected Run
Task success       40%              90%
Tests passed       31/50            47/50
Regressions        —                1
False blocks       —                0/12
Tokens             120k             89k
```

Small datasets must be labeled “insufficient evidence”; do not present numbers as certainty.

## 11.5 Knowledge Page

Human-readable Markdown preview, frontmatter, provenance, relationships, active deployments, last tested date, and outcome contribution.

# 12. Technical Architecture

## 12.1 Principles

- local-first for source content and secrets;
- optional cloud for collaboration;
- event-driven without overengineering the MVP;
- provider abstraction;
- append-only audit events;
- artifact portability;
- deterministic checks before LLM grading;
- clear trust boundaries.

## 12.2 Architecture

```text
Agent Runtimes
Codex · Claude Code · OpenCode · CI
        │ hooks/plugins/MCP
        ▼
MemoSprout Local Runtime
capture · secret scan · policy · local cache
        │ encrypted metadata/artifacts (optional)
        ▼
MemoSprout Control Plane
API · registry · approvals · releases · analytics
        │
        ├── Experience Compiler (LLM)
        ├── Artifact Compiler (Codex/LLM + templates)
        ├── Eval Orchestrator (sandbox workers)
        └── Outcome Ledger
        │
        ▼
Storage
PostgreSQL · pgvector · object storage · audit log
```

## 12.3 Recommended Stack

| Layer | Initial choice | Reason |
|---|---|---|
| Web | Next.js + TypeScript | Fast product UI and server rendering |
| API | FastAPI + Python | LLM/eval orchestration and user familiarity |
| Local CLI/runtime | TypeScript/Node.js | Cross-platform and agent plugin ecosystem |
| Database | PostgreSQL | Relational governance data |
| Semantic search | pgvector | Simple early architecture |
| Local store | SQLite | Offline/local-first |
| Queue | Redis + Celery initially | Familiar, sufficient for MVP |
| Long-running workflows | Temporal later | Replay/canary reliability at scale |
| Object storage | S3-compatible | traces, patches, reports |
| Sandbox | Docker initially | Reproducible coding evals |
| Observability | OpenTelemetry | Vendor-neutral traces |
| Auth | OAuth + passkeys/email | Developer onboarding |
| Billing | Stripe or regional equivalent | Team subscriptions |

Avoid introducing Kubernetes, a graph database, or ClickHouse until data volume justifies it.

## 12.4 Model Strategy

### Production

Provider-agnostic interface:

```typescript
interface IntelligenceProvider {
  extractCandidate(input: EvidencePack): Promise<CandidateSprout>;
  classifyArtifact(candidate: CandidateSprout): Promise<ArtifactPlan>;
  generateVariants(plan: EvalPlan): Promise<EvalCase[]>;
  semanticGrade(run: RunResult, rubric: Rubric): Promise<Grade>;
}
```

Model-routing criteria:

- task complexity;
- privacy classification;
- customer-approved providers;
- cost and latency;
- structured output reliability;
- independent reviewer provider when needed.

### Build Week

Use GPT-5.6 as the core extraction and reasoning model and Codex for the build and executable artifact generation, so the submission has a clear OpenAI-native story. GPT-5.6 supports structured outputs and tools through the Responses API. [S8]

This Build Week description is contextual only. The implementation scope is defined exclusively by [`docs/prd/BUILD_WEEK_PRD.md`](./BUILD_WEEK_PRD.md).

## 12.5 API Outline

```text
POST   /v1/runs
GET    /v1/runs/{id}
POST   /v1/candidates
POST   /v1/candidates/{id}/review
POST   /v1/candidates/{id}/validate
POST   /v1/sprouts/{id}/approve
GET    /v1/sprouts
POST   /v1/releases
POST   /v1/releases/{id}/deploy
POST   /v1/releases/{id}/rollback
POST   /v1/outcomes
GET    /v1/agents
POST   /v1/runtime/decision
```

MCP tools/resources:

```text
memosprout.search_knowledge
memosprout.get_sprout
memosprout.get_task_context
memosprout.report_outcome
memosprout.propose_experience
memosprout.explain_policy
```

# 13. Data Model

## 13.1 Core Entities

| Entity | Important fields |
|---|---|
| Workspace | id, owner, region, retention, encryption mode |
| Project | repo, default branch, languages, test commands |
| AgentRuntime | vendor, client, version, capabilities |
| AgentRun | task, model, context release, tools, result |
| Evidence | type, source, hash, authority, privacy class |
| HumanCorrection | author, text, linked run/PR, resolution |
| Sprout | type, title, body, scope, status, version |
| ValidationRun | baseline, candidate, cases, metrics |
| Artifact | target runtime, type, content hash, source Sprout |
| Release | version, Sprouts, artifacts, rollout state |
| Deployment | target agents/projects, canary %, result |
| Outcome | domain metric, value, time, linked run/release |
| Reflex | detector, intervention, scope, expiry |
| AuditEvent | actor, action, object, timestamp, immutable metadata |

## 13.2 Trust and Authority

Authority ordering is workspace-configurable. Default example:

```text
Approved policy
> Approved ADR
> Merged reviewed code/test
> Maintainer-approved procedure
> Issue/PR discussion
> Chat message
> AI inference
```

AI inference may create a Candidate Sprout but cannot supersede approved policy automatically.

# 14. Privacy, Security, and Compliance

## 14.1 Product Promises

- Customer data remains customer-owned.
- No customer content used to train shared models without explicit opt-in.
- Minimal data egress.
- Raw source and prompts are not required for all features.
- Export and deletion are first-class.
- Provider and processing route are visible.

## 14.2 Modes

| Mode | Storage | Inference | Target |
|---|---|---|---|
| Local | device | local or explicit cloud | individual developer |
| Managed cloud | encrypted tenant | approved providers | teams |
| Private edge | customer VPC + cloud metadata | customer-selected | enterprise |
| Self-hosted | customer infrastructure | local/private | regulated enterprise |

## 14.3 Secret and PII Firewall

Before any external inference:

- ignore `.env`, private keys, credentials, and generated secrets;
- scan with Gitleaks/TruffleHog-compatible rules;
- redact tokens and personal identifiers;
- show data preview for sensitive operations;
- enforce the per-Sprout `external_llm_allowed` policy.

## 14.4 Access Control

Roles:

- owner;
- admin;
- approver;
- member;
- viewer;
- agent identity;
- external collaborator.

Agent identities receive least privilege and cannot approve knowledge they generated themselves.

## 14.5 Supply-Chain Security

- signed releases and artifact hashes;
- reproducible plugin packages;
- SBOM for distributed binaries;
- dependency scanning;
- protected release keys;
- audit logs;
- explicit hook trust installation flow.

# 15. Non-Functional Requirements

| Requirement | Initial target |
|---|---|
| Local hook decision latency | p95 < 150 ms for deterministic rules |
| MCP knowledge query | p95 < 500 ms local; < 1 s cloud |
| Availability | 99.5% beta; 99.9% business target |
| Tenant isolation | mandatory from first cloud release |
| Data encryption | TLS transit, encrypted storage |
| Export | complete OKF + JSON export |
| Rollback | prior release in under 5 minutes |
| Auditability | all approvals/deployments append-only |
| Accessibility | keyboard-friendly, semantic UI |
| Cross-platform | macOS/Linux first; Windows follow-up |

# 16. Metrics and Success Criteria

## 16.1 North Star

**Verified repeated mistakes prevented per active team per month.**

Because “prevented” can be overclaimed, the UI should distinguish:

- directly blocked recurrence;
- test-caught recurrence;
- likely influence based on context usage;
- unverified correlation.

## 16.2 Product Metrics

- repeat correction rate;
- Candidate Sprout-to-Validated Sprout conversion;
- Sprout reuse rate;
- first-pass test success delta;
- repeated review comment reduction;
- false-positive rate;
- harmful guidance rate;
- median time from correction to protection;
- active agent runtimes per workspace;
- knowledge freshness;
- release rollback rate.

## 16.3 Business Metrics

- time to first Validated Sprout;
- weekly active teams;
- repository expansion;
- conversion open-source to cloud;
- annual contract value;
- gross margin after eval costs;
- retention and expansion revenue.

# 17. Monetization

## 17.1 Open Source

- OKF Experience Profile;
- validator and CLI;
- local MCP server;
- local single-project registry;
- basic adapters;
- example bundles;
- deterministic local checks.

## 17.2 Team Cloud

Pricing hypothesis:

| Plan | Indicative pricing | Included |
|---|---:|---|
| Developer | free | local, 1–3 repos, manual validation |
| Team | US$199–499/month | collaboration, GitHub App, hosted evals |
| Business | US$1,000–3,000/month | SSO, policies, many repos, analytics |
| Enterprise | annual contract | VPC/self-hosted, audit, support, CMK |

Pricing must be validated against review time saved and incident prevention—not token volume alone.

# 18. Go-to-Market

## 18.1 Open-Source Wedge

- Publish `memosprout-core` and OKF profile.
- One-command install.
- GitHub App produces visible “MemoSprout Context & Regression Check”.
- Free repository scan finds recurring corrections and stale agent instructions.
- Publish a benchmark comparing a raw repository, instructions only, and Validated Sprouts.

## 18.2 Initial Messaging

Primary:

> **Turn recurring AI code-review feedback into tested regression checks.**

Secondary:

> **One open knowledge layer for Codex, Claude Code, and OpenCode.**

Avoid launching with abstract language such as “collective machine intelligence.” Demonstrate one concrete repeated mistake.

## 18.3 Sales Motion

- developer-led adoption through the CLI;
- team upgrade when multiple repositories or users need a shared registry;
- enterprise sales to Developer Productivity, AI Platform, or AppSec teams;
- security and private deployment as enterprise accelerators.

# 19. Roadmap

## Phase 0 — Build Week Proof (July 2026)

- failed run/correction input;
- GPT-5.6 candidate extraction;
- OKF export;
- Codex-generated regression check;
- before/after replay;
- fresh session proof.

## Phase 1 — Public Alpha (0–8 Weeks)

- local CLI/runtime;
- Codex and Claude adapters;
- OpenCode beta;
- manual PR/correction capture;
- OKF registry;
- basic eval lab;
- GitHub Action;
- documentation and examples.

## Phase 2 — Team Beta (2–6 Months)

- GitHub App;
- cloud workspace;
- candidate inbox;
- hosted replay;
- releases/rollback;
- team analytics;
- RBAC;
- outcome links.

## Phase 3 — Agent Improvement CI (6–18 Months)

- model/prompt/skill comparison;
- historical corpus;
- canary rollout;
- blast-radius analysis;
- enterprise edge;
- signed artifacts.

## Phase 4 — Reflex Mesh (18–36 Months)

- runtime cross-domain actions;
- generalized failure patterns;
- high-risk approval gates;
- privacy-preserving failure intelligence;
- organizational learning graph.

# 20. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Native vendors copy memory/learning | Product is commoditized | Focus on cross-vendor, outcome-linked CI/CD |
| Wrong lesson extracted | Harmful guidance | Candidate-only status, evidence, replay, approval, and canary release |
| Overgeneralization | Blocks valid work | Narrow scope, expiration, and false-positive suite |
| Low recurrence | Weak ROI | Validate with real PR history; focus on teams with high AI volume |
| Evaluation cost too high | Poor margin | Deterministic checks first, sampled replays, and local execution |
| Privacy concerns | Adoption is blocked | Local-first operation, edge deployment, redaction, and no raw-prompt requirement |
| Integration churn | Maintenance cost | Thin adapters, a universal canonical model, and open standards |
| Product too broad | Slow launch | Coding wedge and one repeated-feedback flow |
| OKF changes | Compatibility risk | Adapter layer and versioned profile |
| Dashboard without action | Low engagement | Every insight must create, test, or deploy an artifact |

# 21. Validation Plan

## 21.1 Internal Dogfooding

Use Denahku, Tilaqa, Conversease, RepoSweep, and other owned repositories.

Collect 50–100 corrections and classify them by:

- unique vs repeated;
- deterministic vs semantic;
- artifact type;
- useful across agents;
- false positives;
- time saved.

## 21.2 90-Day Success Gates

Continue toward a standalone business if:

- at least 15% of meaningful corrections recur;
- at least 30% of Validated Sprouts are reused;
- first-pass test/review outcomes improve;
- false blocks stay below agreed threshold;
- developers trust evidence and approval flow;
- at least 3 external teams continue using it after initial trial;
- at least one buyer expresses concrete willingness to pay.

## 21.3 Kill or Pivot Criteria

- output is mostly Markdown with no measurable effect;
- native memory removes recurrence without extra tooling;
- replay cost exceeds saved review time;
- teams refuse trace/repository access even in local mode;
- generated checks require more work than manual tests;
- repeated errors are too rare.

# 22. Launch Acceptance Criteria for Full Product Direction

MemoSprout has validated its core thesis when all conditions below are met:

1. A correction from Agent A is captured with source evidence.
2. A Candidate Sprout is generated and reviewed.
3. At least one executable artifact is generated.
4. Baseline Run versus Protected Run evaluation is reproducible.
5. A fresh Agent B session receives or is enforced by the published result.
6. The fresh run measurably improves without relying on old conversation history.
7. The artifact is portable as OKF and exportable without MemoSprout cloud.
8. The entire release can be rolled back.
9. No secret or unauthorized source is sent externally.
10. The outcome is visible in a human-understandable report.

# 23. Recommended Repository Structure

```text
memosprout/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── cli/
│   ├── core/
│   ├── okf-profile/
│   ├── mcp-server/
│   ├── adapter-codex/
│   ├── adapter-claude/
│   ├── adapter-opencode/
│   ├── artifact-compiler/
│   └── eval-runner/
├── examples/
│   ├── generated-files/
│   └── payment-callback/
├── schemas/
├── docs/
├── .github/
└── LICENSE
```

# 24. Product Copy

## Homepage Hero

**Correct once. Improve every agent.**

MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs. It then compiles that knowledge into tests, hooks, skills, and policies for Codex, Claude Code, OpenCode, and CI.

> **Build organizational intelligence once, then run it on any model.**

> **Open knowledge. Verified experience. Better agents.**

## Three Promises

- **Open:** Your knowledge remains Markdown/OKF and Git-friendly.
- **Verified:** Every lesson keeps evidence and can be replay-tested.
- **Operational:** Knowledge becomes enforcement, not another forgotten note.

# 25. Open Questions

- Should the launch be entirely repository-local, or does it require a hosted dashboard?
- Is the first paying buyer more likely to be in Developer Productivity or AppSec?
- Which artifact resolves the most recurring feedback: tests, hooks, or instructions?
- How often does cross-agent transfer provide value beyond a single repository?
- What is the minimum evidence required for “validated” status in a semantic workflow?
- Should the OKF Experience Profile be submitted as a community proposal after usage is proven?
- Should the runtime gate be a separate product to reduce blast radius?

# 26. References and Source Snapshot

[S1] GoogleCloudPlatform Knowledge Catalog, **Open Knowledge Format Specification v0.1 — Draft**: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

[S2] OpenAI Developers, **Codex MCP**: https://developers.openai.com/codex/mcp

[S3] OpenAI Developers, **Codex Hooks and Plugins**: https://developers.openai.com/codex/hooks and https://developers.openai.com/codex/build-plugins

[S4] Anthropic, **Claude Code Hooks**: https://docs.anthropic.com/en/docs/claude-code/hooks

[S5] Anthropic, **Claude Code MCP**: https://docs.anthropic.com/en/docs/claude-code/mcp

[S6] OpenCode, **Plugins**: https://opencode.ai/docs/plugins/

[S7] OpenCode, **MCP Servers**: https://opencode.ai/docs/mcp-servers/

[S8] OpenAI Developers, **GPT-5.6 model documentation**: https://developers.openai.com/api/docs/models/gpt-5.6-sol

Note: Vendor capabilities and draft standards may change. Adapters and requirements must be retested before every major release.
