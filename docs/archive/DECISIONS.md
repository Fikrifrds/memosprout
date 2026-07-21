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
| BW-021 | Pivot to the Knowledge-Trap Convergence Experiment | Accepted |
| BW-022 | Run the convergence experiment on the OpenAI API (both conditions) | Accepted |
| BW-023 | Adopt the reliability framing and reframe the convergence gate on probe evidence | Accepted |
| BW-024 | Extract a reusable Validation Engine parameterized by scenario | Accepted |
| BW-025 | Generalize the Experience Compiler and OKF export across scenarios | Accepted |
| BW-026 | Add an Artifact Compiler that turns a sprout into an enforcement artifact spec | Accepted |
| BW-027 | Deliver validated sprouts dynamically via get_task_context and cross-agent adapters | Accepted |
| BW-028 | Add an Outcome Ledger that records and aggregates sprout outcomes | Accepted |
| BW-029 | Add a Cost–Intelligence Router that routes tasks to the cheapest reliable model | Accepted |
| BW-030 | Add a Team Control Plane governing the sprout release lifecycle | Accepted |
| BW-031 | Add a Runtime Reflex Gate that blocks tool calls violating sprout protections | Accepted |
| BW-032 | Add a four-state judge-mode demo UI on Next.js | Accepted |
| BW-033 | Serve get_task_context and the reflex gate over a real MCP stdio server | Accepted |
| BW-034 | Wire the demo UI to live sprout extraction | Accepted |
| BW-035 | Persist the MCP server's sprout registry to a file-backed store | Accepted |
| BW-036 | Add tenant-isolation and secret-handling scenarios to prove engine generalization | Accepted |
| BW-037 | Generalize the oracle beyond code test suites (structured-check and rubric-judge) | Accepted |
| BW-038 | Generalize delivery matching to arbitrary context attributes | Accepted |
| BW-039 | Add flexible domain outcome metrics to the Outcome Ledger | Accepted |
| BW-040 | Add a public product surface: landing page, dashboard, and docs | Accepted |
| BW-041 | Store sprouts local-first and user-owned; JSON now, SQLite next, Postgres+pgvector at team scale | Accepted |
| BW-042 | Deliver free-first via the MCP server, led by MCP registries and open source | Accepted |
| BW-043 | Treat sprouts as conditional rules with applicability, precedence, and project detection | Accepted |
| BW-044 | Measure tokens-to-success in the Outcome Ledger (cost-reduction positioning reassessed by BW-045) | Reassessed |
| BW-045 | Drop the token-cost-reducer positioning after live measurement; preserve the assets | Accepted |

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

### BW-021 — Pivot to the Knowledge-Trap Convergence Experiment

**Decision:** After Build Week, the project's primary objective is to empirically validate the long-term thesis from `docs/strategy/Intelligence_Amplification_and_Operational_Distillation_PRD.md`: MemoSprout improves *system* intelligence, not a model's intrinsic intelligence or weights. The decisive test is a Knowledge-Trap Convergence Experiment that measures whether a cheap model plus a Validated Sprout approaches a frontier model on recurring, verifiable, organization-specific work. The first scenario is payment-webhook idempotency. A new evaluation generation (`lib/eval/v3/`) is built alongside the frozen Phase 4 v2 stack, which remains immutable.

**Reason:** The Phase 4 v1 evaluation produced a valid improvement delta of `0` because the generated-files scenario is too easy for modern agents (a ceiling effect), so it cannot demonstrate the core value proposition. The idempotency scenario is a genuine knowledge trap (cheap implementations double-charge on duplicate callbacks and downgrade terminal order states) with deterministic acceptance tests, so the gap between cheap and frontier models is measurable. The honest claim boundary is "for recurring, organization-specific, and verifiable workflows, efficient models enhanced by MemoSprout may approach frontier-model outcomes at a substantially lower cost" — never "a cheap model becomes a frontier model."

**Consequence:** The experiment compares three conditions — `cheap-baseline`, `cheap-protected`, and `frontier-baseline` — and gates on `gapDelta >= 0.3` (a genuine trap), `convergenceDelta <= 0.2` (cheap+sprout approaches frontier), and `falseBlockRate = 0`. The cheap worker runs on Codex (the frozen model-run worker); the frontier condition runs through separate API billing. No model trial or scored evaluation runs while Codex usage is exhausted; non-model engineering (scenario, oracle, harness, tests, docs) proceeds independently. Phase 4 v2 evidence is preserved unchanged, and `lib/eval/v3/` does not unlock or reinterpret it.

### BW-022 — Run the Convergence Experiment on the OpenAI API (Both Conditions)

**Decision:** Run both the cheap (`gpt-5.4-mini`) and frontier (`gpt-5.6`) conditions of the convergence experiment through the OpenAI Responses API tool-loop (`FrontierApiWorkerAdapter` in `lib/eval/v3/frontier-worker.ts`), not the Codex CLI. The frontier worker's shell tool is restricted to a command allowlist and a secret-stripped environment. For the protected condition, the sprout (`AGENTS.md`) is injected into the prompt to mirror Codex's automatic `AGENTS.md` discovery. This supersedes BW-021's "cheap worker runs on Codex" for the convergence experiment only; Phase 4 v2 remains frozen on Codex.

**Reason:** Waiting for the Codex usage reset (shown around 25 July) delays the experiment, and running both conditions through the identical API tool-loop harness isolates the model-plus-sprout effect by controlling for the execution harness. The BW-021 design mixed a Codex cheap worker with an API frontier worker, which would introduce a harness confound. The command allowlist and secret-stripped environment are required because the frontier worker executes model-chosen shell commands on the host machine.

**Consequence:** The convergence experiment no longer depends on Codex availability; the cheap worker is the same `FrontierApiWorkerAdapter` with `model: gpt-5.4-mini`. The protected condition delivers the sprout by prompt injection. The frontier worker rejects chained or redirected commands and any command outside the allowlist (`pnpm test`, `pnpm exec vitest`, `pnpm exec tsx`, `npx vitest`, `node`, `tsx`), and strips `KEY`/`SECRET`/`TOKEN`/`PASSWORD`/`AUTHORIZATION`/`CREDENTIAL` variables from the command environment so the model cannot exfiltrate credentials.

### BW-023 — Adopt the Reliability Framing and Reframe the Convergence Gate on Probe Evidence

**Decision:** Adopt the reliability/variance framing of the thesis and reframe the convergence gate around `sproutLift` and `cheapProtectedRate` instead of `gapDelta`/`convergenceDelta`. The realistic, de-hinted task (which does not spell out the idempotency requirement) is the valid experimental task. This decision is grounded in live probe evidence recorded on 2026-07-19.

**Probe evidence (de-hinted task, three trials per condition, OpenAI API):**

| Condition | Model | Sprout | Success rate |
|---|---|---|---|
| cheap-baseline | gpt-5.4-mini | no | 0/3 |
| cheap-protected | gpt-5.4-mini | yes | 3/3 |
| frontier-baseline | gpt-5.6-sol | no | 0/3 |

**Reason:** The sprout lifts the cheap model from `0/3` to `3/3` (`sproutLift = 1.0`), a clean decisive result. However, the frontier model also fails the de-hinted task without the sprout (`gapDelta = 0`), so the original "cheap+sprout approaches frontier" framing and its `gapDelta >= 0.3` gate are not the right lens: the idempotency requirement is project/domain knowledge that models of either tier do not reliably apply from a bare task. The honest thesis, matching the Full PRD, is that MemoSprout improves *system* intelligence: the sprout encodes knowledge that makes a cheap model reliably correct, regardless of model tier. The earlier ceiling observed with the hinting task was an artifact of the task description revealing the requirement. The economic claim becomes "cheap + sprout delivers correct results at low cost," not "a cheap model becomes a frontier model."

**Consequence:** The convergence gate is `sproutLift >= 0.5`, `cheapProtectedRate >= 0.8`, and `falseBlockRate = 0`; `gapDelta` and `convergenceDelta` remain computed as context but are not gated. The frozen rubric is bumped to `convergence-rubric-v2` and the configuration regenerated. The frontier worker's command allowlist was broadened to ordinary test invocations (for example `pnpm test --silent`), tool failures are returned to the model as recoverable tool results rather than terminating the turn, and the smoke test injects the canonical held-out acceptance suite before scoring every condition.

### BW-024 — Extract a Reusable Validation Engine Parameterized by Scenario

**Decision:** Extract the scenario-agnostic verification logic into a reusable Validation Engine under `lib/eval/engine/`, parameterized by a `ScenarioDefinition` (template root, protected-only paths, guarded paths, sprout path, held-out acceptance test, worker-output schema, and test commands). The idempotency harness is refactored onto this engine, and a second scenario (user soft-delete) is added to prove the engine generalizes.

**Reason:** The convergence harness was hardcoded to the idempotency scenario, but the core intellectual property is the verification methodology itself — materializing baseline/protected repositories, scoring against a held-out acceptance oracle, measuring false blocks, and enforcing protection isolation. That methodology must work for any scenario or sprout, not one. Reusability is demonstrated by validating two structurally different scenarios (idempotency and soft-delete) through the same engine with no engine changes, only different `ScenarioDefinition` instances.

**Consequence:** `lib/eval/engine/{scenario,oracle,runner}.ts` is the reusable core (`ScenarioDefinition`, `AcceptanceSuiteOracle`/`createScenarioOracle`, `prepareScenarioRepository`/`evaluateScenarioControl`/`assertScenarioIsolation`). The convergence experiment (`lib/eval/v3/`) consumes the engine. Adding a new scenario now requires only a deterministic template plus a `ScenarioDefinition`; the engine, oracle, isolation, and false-block control evaluation are reused unchanged.

### BW-025 — Generalize the Experience Compiler and OKF Export Across Scenarios

**Decision:** Generalize the Experience Compiler and OKF export so they are not tied to the generated-files scenario, and add a guidance compiler that bridges a Candidate Sprout to the Validation Engine. The Experience Compiler (`lib/compiler/experience-compiler.ts`) extracts a `CandidateSproutContent` from scenario-agnostic evidence (scenario, task, failed-run summary, human correction) through a scenario-parameterized prompt and an injectable transport. The guidance compiler (`lib/compiler/compile-guidance.ts`) renders a Candidate Sprout into the `AGENTS.md`-style guidance the Validation Engine injects for the protected condition. OKF export gains a scenario-aware `renderExperienceOkf` and `experienceOkfFilename`.

**Reason:** The Phase 2 Experience Compiler, prompt, and OKF rendering were hardcoded to generated-files (specific evidence bundle, prompt instructions, description, and filename). Supporting the Validation Engine's multiple scenarios (idempotency, soft-delete, and future ones) requires extraction from generic evidence, scenario-aware OKF, and a sprout-to-guidance path so an extracted sprout can be validated by the engine. The generic `CandidateSproutContent` schema is reused unchanged; only the generated-files-specific evidence bundle and provenance literals are bypassed by the new path.

**Consequence:** `lib/compiler/{experience-compiler,compile-guidance}.ts` and `renderExperienceOkf`/`experienceOkfFilename` in `lib/okf/render.ts` form the generalized path, demonstrated model-free for both the idempotency and soft-delete scenarios. The existing generated-files Experience Compiler and `renderCandidateOkf` remain unchanged for the Phase 2 flow.

### BW-026 — Add an Artifact Compiler That Turns a Sprout Into an Enforcement Artifact Spec

**Decision:** Add an Artifact Compiler (`lib/artifact/`) that compiles a validated Candidate Sprout into an enforcement artifact specification (`ArtifactSpec`: artifact type, target paths, the prohibited actions it enforces, the procedure it verifies) plus an integrity-checked portable manifest. This generalizes the Phase 3 protection concept (which was generated only for generated-files) into a scenario-agnostic step.

**Reason:** The MemoSprout loop is correction → sprout → guidance + enforcement artifact → validation. Wedge 2 produced the guidance; the enforcement artifact (the executable test/check/hook that catches violations) is the other half. Phase 3 generated that artifact for generated-files via Codex; the generalized loop needs a deterministic, scenario-agnostic description of the artifact (what it enforces and verifies) and a portable, hash-verified manifest, independent of how the executable artifact is produced.

**Consequence:** `compileArtifactSpec` maps a `CandidateSproutContent` to an `ArtifactSpec` (reusing the sprout's `recommendedArtifact` enum: `ci_and_hook`/`ci_check`/`pre_tool_hook`), and `renderArtifactManifest`/`parseArtifactManifest` provide a `specSha256`-verified manifest. The executable artifact generation (LLM-based, Phase 3 style) remains the live path; the spec and manifest are the deterministic, model-free core, demonstrated for both scenarios.

### BW-027 — Deliver Validated Sprouts Dynamically via get_task_context and Cross-Agent Adapters

**Decision:** Add dynamic delivery under `lib/delivery/`: a `SproutRegistry` of validated sprouts, a `getTaskContext` handler (and `get_task_context` MCP tool definition) that returns the guidance whose scope paths overlap the files a task touches, and delivery adapters (`AgentsMdAdapter`, `ClaudeCodeAdapter`) that render the same validated sprouts into agent-specific files.

**Reason:** A validated sprout only helps if it reaches the agent at the right moment. Static `AGENTS.md` materialization is a push; dynamic delivery is a pull — the agent calls `get_task_context` with the files it is about to edit and receives the applicable validated experience. "Improve every agent" also requires portability beyond Codex, so the same sprouts render to more than one agent format (AGENTS.md and Claude Code's CLAUDE.md), proving the knowledge is agent-independent.

**Consequence:** `lib/delivery/{registry,get-task-context,adapters}.ts` provide the registry, scope-path matching, the `get_task_context` tool definition, and two adapters, all demonstrated model-free. The actual MCP stdio server transport (for example `@modelcontextprotocol/sdk`) is a thin integration step that wraps `getTaskContext` and is deferred; the tool definition and handler are the testable core.

### BW-028 — Add an Outcome Ledger That Records and Aggregates Sprout Outcomes

**Decision:** Add an Outcome Ledger (`lib/ledger/`) that records `OutcomeRecord`s (scenario, task, model, applied sprout ids, baseline/protected condition, success, timestamp) and aggregates them: `successRate` (with filters), `sproutImpact` (baseline vs protected lift per scenario), and `summarizeByScenario`, with local-first file persistence (`loadOutcomeLedger`/`saveOutcomeLedger`).

**Reason:** The Outcome Ledger is the compounding data asset (the data moat): it links which sprouts were applied to which tasks, with which models, and what the outcome was — the Agent Outcome Graph in summary form. The `sproutImpact` aggregation mirrors the convergence thesis (sprout lift) and is the feedback signal that tells the system which sprouts actually help, enabling continuous improvement.

**Consequence:** `lib/ledger/{schema,ledger}.ts` provide the record schema and the ledger with query/aggregation/persistence, demonstrated model-free (including a `0 → 1` lift that matches the convergence result). It is the foundation for the Cost–Intelligence Router (wedge 6), which uses these outcomes to route tasks to the cheapest model that stays reliable.

### BW-029 — Add a Cost–Intelligence Router That Routes Tasks to the Cheapest Reliable Model

**Decision:** Add a Cost–Intelligence Router (`lib/router/`) that uses the Outcome Ledger to route a task to the cheapest model that stays reliable. `routeTask` returns the cheap model with the sprout when the scenario's protected success rate meets a reliability threshold with enough samples; otherwise it escalates to the frontier model (unreliable, insufficient data, or no sprout available). `routePortfolio` routes many scenarios and reports the relative cost and savings versus always using the frontier model.

**Reason:** This realizes the economic thesis as a product feature: "cheap price, frontier result" becomes an evidence-based routing decision rather than a blanket claim. The router spends the cheap model only where outcome data shows the sprout makes it reliable, and escalates elsewhere — turning the convergence result into per-task cost optimization.

**Consequence:** `lib/router/{models,router}.ts` provide a model catalog (cheap `gpt-5.4-mini` at relative cost 1, frontier `gpt-5.6-sol` at 10), a routing policy (`minimumReliability`, `minimumSamples`), and `routeTask`/`routePortfolio`, demonstrated model-free (a reliable scenario routes cheap, an unreliable one escalates, and a mixed portfolio shows cost savings). The router is opt-in: `routeTask` also accepts a `pinnedModel`, which respects an explicit model choice and skips cost auto-routing (the predictable default for users who want to know exactly which model handles their task); cost-optimized auto-routing is a deliberate opt-in on top of that.

### BW-030 — Add a Team Control Plane Governing the Sprout Release Lifecycle

**Decision:** Add a Team Control Plane (`lib/control-plane/`) that governs the sprout release lifecycle: `candidate → validated → released → deprecated`, with transition guards (a sprout must be validated before release, and only a released sprout can be rolled back), a canary rollout percentage on release, rollback to deprecated, and an append-only audit trail recording every transition (actor, action, timestamp, note), with local-first file persistence.

**Reason:** Enterprise governance requires managing validated sprouts safely and auditablely: a sprout should not reach agents until it is validated and released, releases should support partial (canary) rollout and rollback, and every lifecycle change must leave an audit trail (who did what, when). This is the governance layer that makes the rest of the loop safe to operate in a team.

**Consequence:** `lib/control-plane/{schema,control-plane}.ts` provide `SproutRelease`/`AuditEntry` schemas and a `ControlPlane` with `register`/`markValidated`/`release`/`rollback`/`deprecate`, transition guards, an ordered audit trail, and `loadControlPlane`/`saveControlPlane`, demonstrated model-free (full lifecycle, canary, guards, rollback, audit ordering, and persistence round-trip). This completes the wedge roadmap (0–7).

### BW-031 — Add a Runtime Reflex Gate That Blocks Tool Calls Violating Sprout Protections

**Decision:** Add a Runtime Reflex Gate (`lib/reflex/`) that intercepts an agent's file-edit tool calls and blocks (or warns on) edits to a sprout's guarded paths — the provided primitives and the held-out enforcement artifacts — before the tool call executes. `compileReflexRule` derives a `ReflexRule` from a scenario's guarded paths, and `ReflexGate.evaluate` returns an allow/block/warn decision for a `ToolCall`.

**Reason:** The Validation Engine scores an implementation after the fact; the Reflex Gate adds before-the-fact prevention. An agent should not be able to tamper with the guarded provided files or the held-out acceptance suite to force a pass; the gate stops such edits at the tool-call boundary, making the protection enforceable at runtime rather than merely detectable later.

**Consequence:** `lib/reflex/{schema,gate}.ts` provide `ReflexRule`/`ToolCall`/`ReflexDecision` schemas, `compileReflexRule`, and `ReflexGate`, demonstrated model-free (blocking edits to guarded and enforcement files, allowing non-guarded edits and non-file-edit tools, and a warn mode). A `reflex` id prefix was added.

### BW-032 — Add a Four-State Judge-Mode Demo UI on Next.js

**Decision:** Add a Next.js App Router demo UI with the four product states from the Build Week PRD — Run, Candidate Sprout, Eval, Published — as a judge-mode wizard with one-click progression over seeded evidence. The home page (`/`) is a static walkthrough that loads the seeded Candidate Sprout and steps through the four screens; the existing `/api/candidates` and `/api/artifacts/okf` route handlers remain.

**Reason:** The library layer (Validation Engine, Experience Compiler, delivery, ledger, router, control plane, reflex gate) needed a tangible surface. The four-screen flow demonstrates the MemoSprout loop end-to-end, and judge mode (seeded evidence, one-click progression) lets anyone walk the loop without live model calls or API keys.

**Consequence:** `app/{layout.tsx,page.tsx,globals.css}`, `components/demo/{DemoWizard,screens}.tsx`, and `lib/demo/seeded-flow.ts` provide the UI; `next build` prerenders `/` as a static page. The UI is presentational over seeded data; wiring it to live extraction/evaluation is a later step.

### BW-033 — Serve get_task_context and the Reflex Gate Over a Real MCP Stdio Server

**Decision:** Add a real Model Context Protocol stdio server (using `@modelcontextprotocol/sdk`) that exposes two tools — `get_task_context` (returns the validated sprout guidance relevant to the files a task touches) and `check_tool_call` (the reflex gate allow/block/warn decision) — backed by a seeded `SproutRegistry` and `ReflexGate`. The tool-handling logic is separated from the transport so it is testable without the SDK.

**Reason:** The delivery handler and reflex gate existed as definitions and pure handlers; to be usable by real agents they must be served over MCP. The stdio server makes MemoSprout a connectable MCP tool provider, so an agent can pull relevant validated experience before editing and check a planned edit against the protections.

**Consequence:** `lib/mcp/{tools,seed,server}.ts` and `scripts/mcp-server.ts` (run via `pnpm mcp:serve`) provide the server; `@modelcontextprotocol/sdk` is added as a dependency. Verified model-free (8 tests) and via a live stdio handshake (`initialize` + `tools/list` return both tools). The registry is seeded with the idempotency and soft-delete sprouts; loading sprouts from a persistent store is a later step.

### BW-034 — Wire the Demo UI to Live Sprout Extraction

**Decision:** Wire the demo UI to live sprout extraction: a new `POST /api/sprouts/extract` route uses the generalized Experience Compiler (`compileExperience`, GPT-5.6) to turn evidence (scenario, task, failed-run summary, human correction) into a `CandidateSproutContent`, then compiles its `AGENTS.md` guidance; a `LiveExtractor` component in the Candidate screen lets the user pick a scenario and extract a live sprout.

**Reason:** The UI was seeded-only (judge mode). Live wiring demonstrates the real Experience Compiler — correction → Candidate Sprout via the model — in the product surface, while the seeded judge mode remains the offline default that needs no API key.

**Consequence:** `app/api/sprouts/extract/route.ts`, `components/demo/LiveExtractor.tsx`, and its integration into the Candidate step provide the live path; the route validates input with `experienceEvidenceSchema` and maps `ExperienceCompilationError` to HTTP errors. Live extraction requires `OPENAI_API_KEY`; the seeded walkthrough is unchanged.

### BW-035 — Persist the MCP Server's Sprout Registry to a File-Backed Store

**Decision:** Add a persistent sprout store (`lib/delivery/store.ts`) that loads and saves a `SproutRegistry` as a versioned JSON file, and wire the MCP server to load its registry from that store — configurable via `MEMOSPROUT_SPROUT_STORE`, defaulting to `.memosprout-local/sprout-store.json` — seeding it with the demo sprouts and saving on first run.

**Reason:** The MCP server previously seeded its registry in memory from hardcoded demo data, so the validated sprouts were not durable or editable. A file-backed store makes them a persistent asset that survives restarts and can be extended without code changes.

**Consequence:** `loadSproutStore`/`saveSproutStore` and `sproutStoreSchema` provide the persistence; `scripts/mcp-server.ts` loads from the store (or seeds and saves it when empty). Demonstrated via store round-trip tests and a live smoke test (first run seeds, the next loads two sprouts from the file).

### BW-036 — Add Tenant-Isolation and Secret-Handling Scenarios to Prove Engine Generalization

**Decision:** Add two more coding scenarios — tenant-isolation (a naive `listRecords` returns every record, leaking one tenant's data to another; the sprout instructs scoping every query by `tenantId`) and secret-handling (a naive `describeConfig` emits the raw API key; the sprout instructs masking it with the provided `maskSecret`) — each a deterministic template plus a held-out acceptance suite, a `ScenarioDefinition`, and a knowledge-trap test.

**Reason:** Multi-domain expansion (Phase A) begins by proving the Validation Engine generalizes across diverse coding knowledge traps, not just idempotency and soft-delete. Both new scenarios run through the unchanged engine, confirming the `ScenarioDefinition` abstraction holds.

**Consequence:** `demo/tenant-isolation/` and `demo/secret-handling/` (templates, acceptance suites, schemas), `lib/scenario/{tenant-isolation,secret-handling}.ts`, and trap tests bring the total to four scenarios, all validated by the same engine. The naive implementations are intentionally wrong (and lint-clean) so the acceptance suites discriminate naive from correct.

### BW-037 — Generalize the Oracle Beyond Code Test Suites

**Decision:** Add two oracle types alongside the acceptance-suite oracle, both implementing `ScenarioOracle`: `StructuredCheckOracle` (reads a JSON output artifact from the repository and runs deterministic field checks) and `RubricJudgeOracle` (reads a text output artifact and asks an injectable judge — live `createOpenAIJudgeTransport` or a mock — whether it satisfies a rubric).

**Reason:** Non-coding domains (support, sales) are validated by structured outputs or rubric judgments, not code test suites. These oracles decouple "validation" from "code tests" while reusing the same `ScenarioOracle` interface, so the engine can validate non-code agent output without changes.

**Consequence:** `lib/eval/engine/oracles.ts` provides both oracles and the `JudgeTransport` abstraction; demonstrated model-free (structured checks pass/fail with field reporting; rubric judge via a mock transport).

### BW-038 — Generalize Delivery Matching to Arbitrary Context Attributes

**Decision:** Generalize `get_task_context` matching so a sprout matches either by file-path scope (existing) or by arbitrary context attributes (new): a sprout may carry an optional `contextMatch` (key-value pairs), and the tool input accepts an optional `context` object in addition to `filePaths`.

**Reason:** Coding sprouts match by file paths, but non-coding sprouts match by context (ticket type, domain, customer tier). Generalizing the match key lets the same delivery mechanism serve any domain.

**Consequence:** `ValidatedSprout` gains an optional `contextMatch` (and `scopePaths` may now be empty); `getTaskContext`/`contextMatches` and the MCP tool definition support `context`; backward compatible with file-path matching, demonstrated for a support-refund sprout matched by `{ domain, ticketType }`.

### BW-039 — Add Flexible Domain Outcome Metrics to the Outcome Ledger

**Decision:** Extend `OutcomeRecord` with an optional `domain` and a flexible `metrics` map (`Record<string, number>`), add `domainOutcomeDefinitions` (coding/support/sales/operations metric vocabularies from the Full PRD) with `outcomeMetricsForDomain`, and add `OutcomeLedger.averageMetric` to aggregate a named metric over a filter.

**Reason:** Different domains measure outcomes differently (CSAT, conversion, SLA violations). A flexible metrics map plus a domain vocabulary lets the ledger capture and aggregate domain-specific outcomes without schema changes per domain.

**Consequence:** `lib/ledger/schema.ts` and `lib/ledger/ledger.ts` provide the extended record, domain vocabularies, and metric aggregation; demonstrated model-free (per-domain vocabularies, averaging a metric, null when absent).

### BW-040 — Add a Public Product Surface: Landing Page, Dashboard, and Docs

**Decision:** Add a public, English-language product surface: a landing page (`/`) explaining the value proposition and how it works, a dashboard (`/dashboard`) showing the scenario catalog, validated sprouts, measured sprout impact, and cost-intelligence routing, an in-app docs/usage guide (`/docs`), and a rewritten README. The judge-mode demo moves to `/demo`.

**Reason:** The library layer and MCP server needed a tangible, understandable surface for a global audience. Clear English pages make the product demonstrable and usable without reading the code, and the dashboard makes the measured value (sprout lift, routing savings) visible.

**Consequence:** `app/page.tsx` (landing), `app/demo/page.tsx` (wizard, moved), `app/dashboard/page.tsx`, `app/docs/page.tsx`, `components/SiteNav.tsx`, `lib/demo/dashboard-data.ts`, and a rewritten `README.md`. All four pages prerender as static content; the dashboard assembles its data from the library layer (seeded registry, a demo ledger, and the router).

### BW-041 — Store Sprouts Local-First and User-Owned

**Decision:** Sprouts are stored local-first and user-owned by default: on the user's file system at project level (`.memosprout/`, shareable as code via git) and/or user level (`~/.memosprout/`). The storage progresses JSON file (current MVP) → SQLite (local-first product) → PostgreSQL + pgvector (team/cloud tier). Embeddings and vector indexing are deferred until the library is large enough to need semantic retrieval; matching is deterministic (file-path scope + context attributes) until then. Full rationale in `docs/STORAGE_ARCHITECTURE.md`.

**Reason:** Sprouts encode an organization's corrections and know-how, which is often sensitive, so the privacy-first default is that users store their own knowledge locally and nothing leaves their machine unless they opt into sharing. Deterministic matching is sufficient for the shipped scenarios, so embeddings would be premature complexity; SQLite is the right local step up from JSON; Postgres + pgvector is reserved for the team tier that needs a shared, governed library and semantic retrieval at scale.

**Consequence:** The free/individual tier needs no database server or cloud (the current `SproutStore` JSON file plus in-memory `SproutRegistry` and deterministic matching). SQLite backing, embeddings/vector indexing, PostgreSQL + pgvector, and a shared community/team sprout library are documented future work, phased as local-first product then team/scale.

### BW-042 — Deliver Free-First via the MCP Server

**Decision:** Deliver MemoSprout free-first, with the MCP server as the primary delivery mechanism (users install it into the agent they already use). Distribution is led by MCP registries/directories and open source (GitHub), supported by npm/npx, a hosted demo, an empirical content hook (the convergence result), and per-ecosystem agent integrations. The model is open-core: the engine and delivery are free for individuals; the Team Control Plane is the future paid tier. Full strategy in `docs/DELIVERY.md`.

**Reason:** MemoSprout is an MCP server, so MCP registries are the highest-intent free channel — they reach users actively looking for an MCP server to install. Open source builds the trust and community that developer tools need, and fits the local-first design. Free-first with an open-core path lets the product grow on accumulated knowledge (the retention moat) before monetizing team governance.

**Consequence:** The MVP ships the open-source MCP server (`get_task_context`, `check_tool_call`), local-first storage, deterministic matching, four scenarios, and the demo UI, distributed via npm/npx, GitHub, MCP registries, and a hosted demo. Deferred and documented: team/cloud storage, embeddings, a community sprout library (network effect), billing, and native per-ecosystem agent plugins.

### BW-043 — Treat Sprouts as Conditional Rules with Applicability, Precedence, and Project Detection

**Decision:** A sprout is a conditional rule (`IF applicable THEN guidance`), not a universal truth. Each sprout carries applicability conditions (project characteristics, scope paths, context attributes); conflicts are resolved by a precedence hierarchy (user > project > community > pre-built) rather than by detecting contradictions; delivery is selective (filter by applicability, resolve by precedence, rank by relevance, deliver top-k); and a project fingerprint detected on first open activates the applicable pre-built sprouts so the product is useful on day zero. Full design in `docs/SPROUT_APPLICABILITY.md`.

**Reason:** A rich pre-built and community library only stays correct across diverse projects if sprouts are contextual and overridable. The same guidance ("edit the schema, regenerate") is right for a schema-first codegen project and wrong for one that hand-writes its client. Applicability conditions keep irrelevant sprouts inactive, precedence lets a user's own corrections override generic defaults, selective retrieval avoids dumping a large library into context, and project detection delivers value before the user has made any correction.

**Consequence:** Building on the existing `scopePaths`, `contextMatch`, and retrieval, the architecture adds a `source`/precedence field on sprouts, richer applicability conditions, project detection (patterns, heuristics, explicit `.memosprout/config`, optional LLM analysis), and precedence-based resolution in delivery. Phased: precedence + basic applicability in the MVP; richer applicability, project detection, and a curated pre-built library next; semantic retrieval, LLM-assisted detection, and a community library later. Documented honest challenges: project detection is hard, the pre-built library is a curation burden, and subtle semantic conflicts can slip past precedence.

### BW-044 — Position MemoSprout as a Token-Cost Reducer and Measure Tokens-to-Success

**Decision:** Position token-cost reduction as a first-class value proposition alongside quality lift, and measure it with a standard `tokens_to_success` metric — the total tokens consumed from task start until the task passes its oracle, including all retries — recorded in the Outcome Ledger's `metrics` map and compared baseline vs protected via `OutcomeLedger.tokenImpact`. Full thesis in `docs/TOKEN_ECONOMICS.md`.

**Reason:** Model intelligence is no longer the practical bottleneck — developers adopt the newest models — but token consumption is: sessions burn millions of tokens and plan limits drive developers to $100–$200 tiers. Most of those tokens are wasted on retries and re-exploration whose root cause is the local-knowledge gap, which no model can close by being smarter and which is exactly the gap sprouts fill. A few-hundred-token sprout that prevents a retry cycle saves tokens at a 100–1000× ratio, and the Cost–Intelligence Router converts the convergence result (0% → 100%) into direct model-cost savings. Honest scope: MemoSprout cuts wasted tokens, not baseline tokens, and the savings claim remains a hypothesis until tokens-to-success is measured on live runs.

**Consequence:** `lib/ledger/schema.ts` defines the `tokens_to_success` metric name (added to the coding domain vocabulary), `lib/ledger/ledger.ts` adds `tokenImpact(scenario)` (baseline vs protected average tokens, savings, savings rate), the dashboard shows token impact per scenario on illustrative demo data, and the landing page leads with the cost story. The live cost experiment (real measured tokens-to-success, translated into plan-tier terms) is the documented next step.

### BW-045 — Drop the Token-Cost-Reducer Positioning After Live Measurement; Preserve the Assets

**Decision:** Based on live measurement, drop the token-cost-reducer positioning (BW-044). The honest, measured claim is "more predictable cost" (variance reduction), not "a smaller bill," and even that is established only on synthetic fixtures. The `tokens_to_success` metric and `tokenImpact` remain in the Outcome Ledger as a measurement tool. The broader product premise is placed under reassessment, and the durable technical assets are preserved independent of the product's direction. Full record in `docs/TOKEN_ECONOMICS.md`.

**Reason:** Two live experiments on gpt-5.4-mini measured 9.2% (idempotency, 3 trials) and 11.2% (api-conventions, 8 trials) mean tokens-to-success savings. The first run had reported 64%; that was a harness bug — the oracle wrote the held-out acceptance test into the repository on every baseline attempt and the worker was blamed for the file the oracle created — and it was found, fixed (violation detection now hashes guarded files before and after each turn), and disclosed. The corrected mean saving is modest, and the 11.2% is driven partly by one outlier baseline run that exhausted its turn budget. Modern models find knowledge that is discoverable from the code (baseline succeeded 8/8), so sprouts add little there. A ~10% saving does not move anyone from a $200 plan to a $100 plan and must not be presented as if it does. Strategically, MemoSprout was built from a name and a technical capability rather than from an experienced problem, which is why its positioning narrowed each time it was tested honestly; the originating quota problem turned out to be solved by documentation plus an agent that finds the docs itself, not by a memory layer.

**Consequence:** Stop positioning MemoSprout as a token-cost reducer; the landing-page cost story must not imply a plan-tier reduction. The `tokens_to_success` metric and `tokenImpact` remain as honest measurement. The product direction is open. The technical assets — the Validation Engine, the oracle framework, and the experiment harness that detected and disclosed its own bug — are preserved and remain valuable as standalone tools, open-source contributions, or components for a real problem once one is identified.

## Deferred or Conditional Decisions

The following are deliberately not blockers for core implementation:

- **Hosted deployment target:** decide only after local proof and UI build pass. A local judge quickstart is mandatory; hosted seeded mode is optional.
- **Live UI orchestration of Codex:** not required. Local scripts are the supported live execution surface for Build Week.
- **Public vs private repository:** decide during submission hardening, while satisfying judge access requirements either way.
- **Exact visual direction:** decide after the core proof gate using the four fixed states and evidence contract.

## Blocking Questions

None at the planning stage. If GPT-5.6 Sol access or Codex non-interactive authentication is unavailable at its hard gate, ask only for the missing credential/access decision at that time.
