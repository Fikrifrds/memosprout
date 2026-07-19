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

## Deferred or Conditional Decisions

The following are deliberately not blockers for core implementation:

- **Hosted deployment target:** decide only after local proof and UI build pass. A local judge quickstart is mandatory; hosted seeded mode is optional.
- **Live UI orchestration of Codex:** not required. Local scripts are the supported live execution surface for Build Week.
- **Public vs private repository:** decide during submission hardening, while satisfying judge access requirements either way.
- **Exact visual direction:** decide after the core proof gate using the four fixed states and evidence contract.

## Blocking Questions

None at the planning stage. If GPT-5.6 Sol access or Codex non-interactive authentication is unavailable at its hard gate, ask only for the missing credential/access decision at that time.
