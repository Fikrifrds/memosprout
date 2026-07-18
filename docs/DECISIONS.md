# MemoSprout Build Week Decisions

Status: Active  
Date initialized: 2026-07-18

This log records decisions for the Build Week implementation. [`BUILD_WEEK_PRD.md`](./prd/BUILD_WEEK_PRD.md) is authoritative. [`FULL_PRD.md`](./prd/FULL_PRD.md) is context only and cannot add scope.

## Decision Index

| ID | Decision | Status |
|---|---|---|
| BW-001 | Use the existing `Fikrifrds/memosprout` repository | Accepted |
| BW-002 | Build one root Next.js application | Accepted |
| BW-003 | Use TypeScript, Tailwind, Zod, Vitest, and pnpm only | Accepted |
| BW-004 | Keep exactly one generated-files scenario | Accepted |
| BW-005 | Complete the executable core proof before UI | Accepted |
| BW-006 | Separate live proof mode from seeded judge mode | Accepted |
| BW-007 | Pin Candidate Sprout extraction to GPT-5.6 Sol | Accepted |
| BW-008 | Use non-interactive Codex CLI for Agent Runs | Accepted |
| BW-009 | Use temporary Git copies instead of Docker | Accepted |
| BW-010 | Separate the evidence oracle from generated protection | Accepted |
| BW-011 | Publish Codex guidance through `AGENTS.md` | Accepted |
| BW-012 | Evaluate five paired variants and eight valid controls | Accepted |
| BW-013 | Reserve `preferred_language` as the held-out fresh task | Accepted |
| BW-014 | Use JSON/Markdown evidence, not a database | Accepted |
| BW-015 | Use four UI states; embed fresh proof in Published | Accepted |
| BW-016 | Export one conservative Open Knowledge Format (OKF) v0.1 concept | Accepted |
| BW-017 | Require provenance for every improvement claim | Accepted |
| BW-018 | Defer all nice-to-have integrations | Accepted |
| BW-019 | Keep this primary Codex task for `/feedback` | Accepted |
| BW-020 | Standardize on Node.js 24 and pnpm 11 | Accepted |

## Detailed Decisions

### BW-001 — Use the Existing Repository

**Decision:** Build in `Fikrifrds/memosprout` and keep its existing Git history.

**Reason:** The user explicitly fixed the repository. This overrides the PRD recommendation to create `memosprout-agent`.

**Consequence:** The README and changelog must clearly identify what existed before Build Week. No repository migration is planned.

### BW-002 — Build One Root Next.js Application

**Decision:** Use a single Next.js App Router project at the repository root.

**Reason:** The repository has no existing application, and a monorepo adds configuration and judge setup cost without strengthening the proof.

**Consequence:** Shared domain and orchestration code lives under `lib/`; local proof entry points live under `scripts/`.

### BW-003 — Use the Constrained TypeScript Stack

**Decision:** Use Next.js App Router, TypeScript, Tailwind, Zod, Vitest, and pnpm. Do not use FastAPI, Python application services, Redis, authentication, billing, or a GitHub App.

**Reason:** These are explicit implementation constraints and match the smallest coherent architecture.

**Consequence:** All README commands use pnpm. Route handlers supply the limited server surface.

### BW-004 — Keep One Scenario

**Decision:** The only scenario is “generated files must not be edited directly.” All eval cases are schema-field variants within that scenario.

**Reason:** A second scenario would weaken reliability and violate the stated scope.

**Consequence:** No payment, security, or multi-repository examples enter implementation or UI.

### BW-005 — Complete Core Proof Before UI

**Decision:** UI work starts only after a verifier proves the entire held-out chain.

**Reason:** The core causal claim is the submission. UI cannot compensate for a missing real agent proof.

**Consequence:** Phase 5 is a hard dependency of Phase 6.

### BW-006 — Separate Live and Seeded Modes

**Decision:** Live mode produces evidence with GPT-5.6 and Codex; seeded mode replays a reviewed snapshot of that evidence.

**Reason:** Live agents and credentials are unsuitable as the only judge path, while fixture-only behavior is insufficient proof.

**Consequence:** Every screen displays its source mode. Seeded mode performs no hidden live calls. Live errors never silently become seeded success.

### BW-007 — Pin GPT-5.6 Sol

**Decision:** Use `gpt-5.6-sol` for Candidate Sprout extraction and record the response's returned model ID.

**Reason:** Official guidance says the `gpt-5.6` alias routes to Sol, but the explicit slug produces clearer evidence. The narrow workload does not need optional GPT-5.6 features beyond structured output.

**Consequence:** Use the Responses API with a strict structured-output schema backed by Zod. Do not add Pro mode, multi-agent, persisted reasoning, or programmatic tool calling.

### BW-008 — Use `codex exec`

**Decision:** Run baseline, artifact, eval, and fresh tasks with non-interactive `codex exec --json --sandbox workspace-write`.

**Reason:** Official Codex documentation supports JSONL events, explicit sandboxing, structured output, and thread-ID capture in automation.

**Consequence:** The adapter parses JSONL, captures the thread ID and events, imposes timeouts, and treats non-zero or incomplete runs as evidence rather than hiding them.

### BW-009 — Use Temporary Git Copies

**Decision:** Each Agent Run receives a clean copy in a newly initialized temporary Git repository.

**Reason:** This is portable, fast, and sufficient for a non-sensitive synthetic repository. Docker is unnecessary for the single demo.

**Consequence:** The proof is local-first. Path allowlists and Codex workspace-write sandboxing reduce risk, but this is not advertised as a production-grade hostile-code sandbox.

### BW-010 — Separate Oracle and Protection

**Decision:** MemoSprout's external evidence oracle identifies the initial failure. The initial demo repository does not already contain the permanent protection that Codex is later asked to create.

**Reason:** Otherwise the story “Codex creates protection from the Candidate Sprout” would be circular.

**Consequence:** The accepted Codex artifact becomes a repository-owned check and test after the correction. Tests distinguish the external oracle from the promoted protection.

### BW-011 — Publish Through `AGENTS.md`

**Decision:** Materialize the approved Sprout into a narrow `AGENTS.md` in the demo repository and install the executable check.

**Reason:** Codex automatically consumes durable repository guidance, and the check provides deterministic enforcement.

**Consequence:** OKF remains the portable source artifact; `AGENTS.md` is a Codex-native compiled target. MCP and plugin work are not required.

### BW-012 — Define the Evaluation Corpus

**Decision:** Run five paired Codex field-addition tasks without and with protection, plus eight deterministic valid controls.

**Reason:** Five pairs match the PRD's intended scale while staying inside one scenario. Valid controls detect overblocking.

**Consequence:** The UI displays computed counts and denominators. A positive delta and zero false blocks are promotion gates, not predetermined results.

### BW-013 — Hold Out `preferred_language`

**Decision:** The fresh proof uses `preferred_language`, which is excluded from extraction, artifact prompts, eval cases, and tuning.

**Reason:** A held-out task is necessary to support a fresh-task improvement claim.

**Consequence:** A leakage test scans prior evidence before the fresh run.

### BW-014 — Use Files Instead of a Database

**Decision:** Persist only sanitized JSON, Markdown, patches, and JSONL trace snapshots for the demo. UI progression is ephemeral client state.

**Reason:** No multi-user or production persistence requirement exists. A database would add migrations and hosting concerns.

**Consequence:** A manifest hashes committed evidence. Reset Demo returns to the first seeded state without mutating server data.

### BW-015 — Use Four UI States

**Decision:** Run → Candidate → Eval → Published. The Published screen includes the fresh Codex result.

**Reason:** This reconciles the PRD's four-state requirement with its separate fresh-run mockup.

**Consequence:** No separate fifth navigation state is created.

### BW-016 — Export Conservative Open Knowledge Format (OKF) v0.1

**Decision:** Export one Markdown concept with required `type`, recommended descriptive frontmatter, MemoSprout extension metadata, and structured body sections.

**Reason:** Open Knowledge Format (OKF) v0.1 requires parseable YAML frontmatter and non-empty `type`, permits producer-defined fields, and requires consumers to tolerate unknown fields.

**Consequence:** Build Week does not implement a registry, bundle index, import pipeline, or knowledge graph. The renderer and validator preserve unknown extension metadata.

### BW-017 — Require Provenance for Claims

**Decision:** “Failed,” “Codex-generated,” “improved,” and “fresh” are evidence-backed states, not marketing labels.

**Reason:** Agent Runs are nondeterministic, and the sample PRD numbers are illustrative.

**Consequence:** Every result links to a trace/result record. Unfavorable valid runs stay in the report. Infrastructure may retry once; model outcomes may not be cherry-picked.

### BW-018 — Defer Integrations

**Decision:** MCP, plugins/hooks packages, Claude/OpenCode exports, share pages, cloud workers, and all enterprise infrastructure are deferred until after submission.

**Reason:** None is necessary for the main proof, and each creates a new failure surface.

**Consequence:** A nice-to-have cannot be pulled into the critical path merely because core work finishes early; submission hardening takes precedence.

### BW-019 — Preserve the Primary Codex Task

**Decision:** Continue implementation in this primary task so its `/feedback` Session ID represents the majority of core work.

**Reason:** This is an explicit submission requirement and user constraint.

**Consequence:** Do not move the primary implementation to a different Codex task. Record the Session ID during submission hardening.

### BW-020 — Standardize on Node.js 24 and pnpm 11

**Decision:** Declare Node.js 24.x and pnpm 11.x as the supported repository runtime, with pnpm pinned to `pnpm@11.9.0` through the package-manager field.

**Reason:** The implementation and verification environment runs Node.js 24, and one explicit runtime contract removes local, CI, and judge setup ambiguity. This decision was revised by direct user instruction before the Phase 2 commit.

**Consequence:** Root and demo package manifests declare Node.js `>=24 <25` and pnpm `>=11 <12`; `.nvmrc` selects Node.js 24; CI, clean-clone testing, and setup documentation must use Node.js 24.x and pnpm 11.x.

## Deferred or Conditional Decisions

The following are deliberately not blockers for core implementation:

- **Hosted deployment target:** decide only after local proof and UI build pass. A local judge quickstart is mandatory; hosted seeded mode is optional.
- **Live UI orchestration of Codex:** not required. Local scripts are the supported live execution surface for Build Week.
- **Public vs private repository:** decide during submission hardening, while satisfying judge access requirements either way.
- **Exact visual direction:** decide after the core proof gate using the four fixed states and evidence contract.

## Blocking Questions

None at the planning stage. If GPT-5.6 Sol access or Codex non-interactive authentication is unavailable at its hard gate, ask only for the missing credential/access decision at that time.
