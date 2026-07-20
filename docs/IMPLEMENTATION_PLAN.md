# MemoSprout Build Week Implementation Plan

Status: Phase 4 v1 evidence valid; Phase 4 v2 calibration floor preserved; the corrected generator runtime is validated and viable; the guarded calibration-v2 runner and evidence verifier are implemented with execution still unauthorized; scored execution remains prohibited. The project has pivoted to the Knowledge-Trap Convergence Experiment (decision BW-021): its model-free Phase A foundation (idempotency scenario, pluggable oracle, three-condition harness, convergence gate, authorization guard, design verifier, and tests) is complete and design-verified; live scored execution remains unauthorized.

Date: 2026-07-19

Authoritative scope: [`docs/prd/BUILD_WEEK_PRD.md`](./prd/BUILD_WEEK_PRD.md)

Background only: [`docs/prd/FULL_PRD.md`](./prd/FULL_PRD.md)

## Implementation Progress

| Phase | Status | Verified outcome |
|---|---|---|
| Phase 0 — Planning and Scope Freeze | Complete | The planning documents agree on the repository, stack, single scenario, metrics, stopping rules, and deferred infrastructure. No implementation code existed when the Phase 0 gate was evaluated. |
| Phase 1 — Foundation and Deterministic Scenario | Complete | A direct generated-client edit fails deterministically; a schema edit followed by regeneration passes; generator output is byte-stable. Linting, type checking, and all seven tests pass. |
| Phase 2 — Evidence, GPT-5.6 Candidate Sprout, and Open Knowledge Format (OKF) | Complete | Strict evidence and Candidate Sprout contracts, the GPT-5.6 Sol Responses API path, an explicitly seeded offline path, OKF validation/rendering, routes, scripts, and tests are implemented. A live call returned `gpt-5.6-sol`, recorded its response provenance, and produced a validated OKF artifact. |
| Phase 3 — Codex-Generated Executable Protection | Complete | Live Codex thread `019f762a-c13f-7781-96cd-1b65a8ae4267` generated durable `AGENTS.md` guidance, an observational byte-equality check that reuses the pure renderer, repository-owned tests, and the package command. Five invalid mutations are rejected, eight valid controls are allowed, and every case leaves the repository unchanged. |
| Phase 4 — Baseline vs. Protected Evaluation | Stopped | The frozen five-pair live evaluation completed with baseline `5/5`, protected `5/5`, zero policy violations, and all eight valid controls allowed. The computed improvement delta is `0`, so the positive-delta exit gate did not pass and the stopping rule prohibits changing or rerunning the evaluation to seek a favorable result. |
| Convergence Experiment — Knowledge-Trap (Post-Build Week) | Phase A foundation complete | The idempotency scenario, pluggable oracle, three-condition harness, convergence report and gate, authorization guard, frozen config, and model-free design verifier are implemented under `lib/eval/v3/` and `demo/idempotency/`. The scenario suite proves the knowledge trap is genuine. Linting, type checking, and all 224 tests pass; `pnpm convergence:design:verify` passes with no model call. Live calibration and scored three-condition execution remain unauthorized. |

Phase 3 was verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm demo`, and `pnpm phase3:verify`. Live and seeded protection evidence are stored separately. The accepted live run records Codex CLI `0.144.6`, thread `019f762a-c13f-7781-96cd-1b65a8ae4267`, the sanitized command, exact changed paths, artifact and patch hashes, and all thirteen acceptance results. The repository is standardized on Node.js 24.x and pnpm 11.x, with `pnpm@11.9.0` pinned for reproducibility.

Phase 4 now has a strict, reproducible evaluation harness, separately stored live and seeded reports, case-level traces and patches, and a hash-verified evidence manifest. Both conditions scored a `1.0` correct-workflow rate, producing an improvement delta of `0`; the eight nonviolating controls produced a false-block rate of `0`. The five baseline outcomes and five protected outcomes are retained as observed. No model outcome was retried, no metric or task was changed after observation, and Phase 5 remains unstarted.

## Knowledge-Trap Convergence Experiment (Post-Build Week)

Recorded in decision BW-021. The Build Week generated-files scenario produced a valid improvement delta of `0` because it is too easy for modern agents, so it cannot demonstrate the core thesis. The convergence experiment tests the long-term thesis directly: for recurring, organization-specific, and verifiable work, a cheap model enhanced by a Validated Sprout may approach a frontier model at substantially lower cost. MemoSprout improves system intelligence, not a model's intrinsic intelligence or weights.

**Scenario.** Payment-webhook idempotency (`demo/idempotency/template/`). A naive handler passes an ordinary happy-path test but fails a held-out acceptance suite: it double-charges on a duplicate callback and downgrades a paid order on a late or out-of-order event. The sprout (`AGENTS.md`) instructs idempotency-key and terminal-state protection. The scenario suite proves the trap is genuine and that a correct handler passes all acceptance cases.

**Three conditions.** `cheap-baseline` (cheap model, no sprout), `cheap-protected` (cheap model, sprout injected into the prompt), and `frontier-baseline` (frontier model, no sprout). Per BW-022, both the cheap (`gpt-5.4-mini`) and frontier (`gpt-5.6-sol`) conditions run through the same OpenAI Responses API tool-loop (`FrontierApiWorkerAdapter`), not Codex, so the harness is held constant and only the model and sprout vary.

**Metrics and gate (BW-023, reliability framing).** Computed metrics: `cheapBaselineRate`, `cheapProtectedRate`, `frontierBaselineRate`, `sproutLift = cheapProtectedRate - cheapBaselineRate`, plus `gapDelta` and `convergenceDelta` as context. The gate is `sproutLift >= 0.5`, `cheapProtectedRate >= 0.8`, and `falseBlockRate = 0`. `gapDelta`/`convergenceDelta` are not gated because the probe showed frontier models can also lack the project knowledge.

**Probe results (2026-07-19, de-hinted task, three trials per condition, OpenAI API).** `cheap-baseline` (gpt-5.4-mini, no sprout) `0/3`; `cheap-protected` (gpt-5.4-mini, sprout) `3/3`; `frontier-baseline` (gpt-5.6-sol, no sprout) `0/3`. The sprout lifts the cheap model from `0%` to `100%` (`sproutLift = 1.0`). The frontier model also fails without the sprout, so the value is knowledge injection (system intelligence), not tier convergence. The de-hinted task is required: a task that spells out the idempotency requirement produces a ceiling artifact.

**Phase A — model-free foundation (complete).** Idempotency scenario and acceptance suite; pluggable `ScenarioOracle` with `IdempotencyOracle`; three-condition runner, convergence report with `superRefine` re-derivation, and convergence gate; worker abstraction (`CodexWorkerAdapter`, a real `FrontierApiWorkerAdapter` tool-loop agent with a command allowlist and secret-stripped environment, and `MockWorkerAdapter`); frozen contract, frozen-inputs manifest, prompt, and provider-compatible worker-output schema; authorization guard mirroring the v2 pattern; `pnpm convergence:design:verify`; and model-free tests. Verified by `pnpm lint`, `pnpm typecheck`, `pnpm test` (233 tests), and the design verifier.

**Phase B — live probe and scored run (complete).** The live probe validated the wiring and the thesis signal through the OpenAI API, and the formal scored run committed an evidence manifest, the false-block control suite, and a convergence report; the gate passed (`sproutLift = 1`, `cheapProtectedRate = 1`, `falseBlockRate = 0`). It is not gated on Codex usage because both conditions use the API.

**Phase C — decision gate.** If the convergence gate (`sproutLift >= 0.5`, `cheapProtectedRate >= 0.8`, `falseBlockRate = 0`) passes on the scored run, document the evidence and proceed to the wedge roadmap below; otherwise learn and adjust the scenario or thesis.

**Wedge roadmap toward the Full PRD** (each wedge gated on the previous validation; heavy infrastructure deferred): (0) convergence experiment — **complete** (gate passed); (1) reusable Validation Engine / Eval Lab — **complete** (`lib/eval/engine/`, proven on idempotency and soft-delete, BW-024); (2) Experience Compiler + OKF — **complete** (scenario-agnostic compiler, guidance compiler, scenario-aware OKF, BW-025); (3) Artifact Compiler — **complete** (sprout → enforcement artifact spec + integrity-checked manifest, BW-026); (4) dynamic delivery via MCP `get_task_context` plus a non-Codex adapter for portability — **complete** (registry, get_task_context, AGENTS.md + Claude Code adapters, BW-027); (5) Outcome Ledger — **complete** (record + aggregate sprout outcomes, sprout impact, file persistence, BW-028); (6) Cost–Intelligence Router — **complete** (route tasks to the cheapest reliable model from outcome data, portfolio cost savings, BW-029); (7) Team Control Plane and governance — **complete** (sprout release lifecycle, guards, canary, rollback, audit trail, BW-030); (8) Runtime Reflex Gate — **complete** (block tool calls that violate sprout protections before execution, BW-031). **All wedges (0–8) are complete.** A four-state judge-mode demo UI (Run, Candidate, Eval, Published) is built on Next.js (BW-032) with live sprout extraction wired in (BW-034), and a real MCP stdio server serves `get_task_context` and `check_tool_call` (BW-033). Deferred: multi-domain expansion, billing, persistent sprout store for the MCP server.

## 1. Feasibility Verdict

The Build Week vertical slice is feasible in the remaining window if work follows the critical path in this document and all deferred features remain deferred. The repository is currently an almost-empty shell, so there is no migration burden, but there is also no reusable application foundation.

The proof must be built as a local, reproducible developer-tool workflow before any UI work:

```text
real failed Codex Agent Run
→ captured Human Correction
→ GPT-5.6 Sol structured Candidate Sprout
→ conformant Open Knowledge Format (OKF) Markdown export
→ Codex-generated executable protection
→ baseline vs protected evaluation
→ held-out fresh Codex task improves
```

The most reliable architecture is a dual-mode product:

- **Live proof mode** runs GPT-5.6 and `codex exec` locally, captures JSONL traces, diffs, test results, and session IDs, and writes sanitized evidence.
- **Seeded judge mode** replays committed evidence from successful live proof runs. It must always be visibly labeled as seeded and must never pretend to be a live model call.

This split is necessary because a hosted Next.js process cannot safely or reliably assume access to a local Codex login, a writable Git sandbox, or long-running agent execution. Seeded mode provides judge reliability; live proof mode establishes that the product is real.

## 2. Current Repository Audit

At planning time the repository contains only:

- `.gitignore`
- `LICENSE`
- `README.md`
- the two PRDs under `docs/prd/` (currently untracked)

The configured remote is `https://github.com/Fikrifrds/memosprout.git`, which matches the required repository. The branch is `main`, with one initial commit. The repository runtime contract is Node.js 24.x and pnpm 11.x; `.nvmrc`, package engines, the pinned package-manager field, CI, and judge setup must remain aligned with that contract.

## 3. Feasibility Audit: Contradictions and Resolutions

| Issue | Impact | Resolution for Build Week |
|---|---|---|
| The PRD recommends creating `memosprout-agent`, while the task fixes the repository as `Fikrifrds/memosprout`. | Repository history and submission URL could diverge. | Use the existing `Fikrifrds/memosprout` repository. Do not create or move to another repository. |
| The PRD permits FastAPI; the implementation constraints prohibit it. | A split TypeScript/Python stack would add setup and deployment risk. | Use Next.js App Router route handlers and TypeScript only. |
| The PRD examples use `npm`; the implementation constraint requires pnpm. | Judge instructions and lockfile could disagree. | Use only `pnpm` in scripts, CI, README, and video. Commit `pnpm-lock.yaml`. |
| The scenario lists an existing generated-policy test, but the core story says Codex creates the regression protection after the failure. | The generated artifact would appear to pre-exist its cause. | Keep the initial demo repository free of the permanent protection. Use an external MemoSprout evidence oracle to classify the failed patch. Codex later generates the repository-owned check and its tests. |
| The PRD alternates between four UI states and a separate Fresh Run screen. | State progression is ambiguous. | Use four top-level states: Run, Candidate, Eval, Published. The Published state contains the held-out fresh-run proof. |
| “Baseline vs candidate replay” has no exact definition, while the mockup contains fixed scores. | Hard-coded numbers could overclaim model behavior. | Record actual paired Codex runs and score them with a deterministic oracle. Never ship sample scores as measured results. |
| A fresh run or deterministic simulation is permitted as a fallback in the PRD, but the core thesis requires fresh-task improvement. | A simulation alone would weaken the main claim. | A real fresh Codex session is a release gate. Seeded replay is only a judging fallback after a real run has been captured. |
| SQLite or JSON is suggested but no persistence requirements are defined. | Database work could consume the schedule without improving the proof. | Use committed sanitized JSON/Markdown evidence plus ephemeral browser state. No database. |
| Docker/local worktree is suggested, but Docker is not required and may not be available to judges. | Docker adds installation and startup failure modes. | Copy the demo template into a temporary Git repository and run Codex with a workspace-write sandbox. Do not require Docker. |
| The source material uses “Candidate Agent Experience,” “Candidate Experience,” and “Candidate Sprout” interchangeably. | Types, labels, and tests could drift. | Canonical domain term: **Candidate Sprout**. Its Open Knowledge Format (OKF) `type` remains `Agent Experience`. |
| The PRD does not say how Codex receives published knowledge. | A fresh run could accidentally rely on the old conversation. | Materialize the approved procedure into a demo-repository `AGENTS.md`; start a new Codex thread in a clean copy. The original correction and trace are not included. |
| The exact GPT-5.6 model name is ambiguous. | A moving family alias can make evidence harder to reproduce. | Pin live extraction evidence to `gpt-5.6-sol` and record the returned model ID. Keep the model configurable only for tests and explicit experiments. |

## 4. Missing Requirements Supplied by This Plan

The Build Week PRD does not fully specify the following. They are required for an honest, testable implementation:

1. A precise definition of “fresh”: a new temporary Git repository, a new Codex thread ID, no original correction or transcript, and only the published `AGENTS.md` plus executable protection.
2. Evidence provenance: prompt version, model ID, Codex CLI version, thread ID, task ID, Git base hash, timestamps, changed paths, patch hash, command results, and artifact hash.
3. Evaluation denominators and formulas. Counts must be derived from run records, not entered as presentation copy.
4. A held-out field mutation (`preferred_language`) that is never used to extract the Candidate or tune the replay suite.
5. Live/seeded labeling and reset semantics.
6. Agent timeouts, infrastructure retry limits, and a rule against retrying model outcomes merely to obtain favorable evidence.
7. Artifact path allowlisting and validation before Codex-generated files are promoted.
8. Failure behavior for missing API keys, missing Codex auth, refused structured output, malformed evidence, timeouts, and non-zero test exits.
9. Secret and privacy handling: raw credentials and full local Codex auth data are never copied into evidence; committed traces are sanitized.
10. Deterministic time injection for snapshots and OKF rendering.
11. Download filename and media type for OKF: `generated-files-agent-experience.md` and `text/markdown; charset=utf-8`.
12. A claim policy: no “improved” or “Codex failed” label without the corresponding captured trace and deterministic score.

## 5. Architecture Boundary

### 5.1 Runtime Components

| Component | Responsibility | Explicit non-responsibility |
|---|---|---|
| Next.js App Router app | Judge experience, live Candidate request, artifact preview/download, seeded progression | Long-running Codex orchestration in hosted production |
| Core TypeScript library | Zod contracts, OKF rendering, evidence validation, scoring, publishing | Authentication, billing, tenancy |
| Local proof scripts | Temporary repos, `codex exec`, test execution, trace capture, evidence sanitization | General-purpose agent orchestration |
| Demo repository template | One generated-files workflow and deterministic generator | Multiple languages or scenarios |
| Seeded evidence | Reliable replay of a previously completed live proof | Representation as a currently running model call |

### 5.2 Initial Repository Structure

This is a single Next.js application, not a monorepo:

```text
memosprout/
├── app/
│   ├── api/
│   │   ├── candidates/route.ts
│   │   └── artifacts/okf/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── demo/
│       ├── candidate-panel.tsx
│       ├── demo-shell.tsx
│       ├── eval-panel.tsx
│       ├── published-panel.tsx
│       ├── run-panel.tsx
│       └── step-indicator.tsx
├── demo/
│   └── generated-files/
│       ├── template/
│       │   ├── api/openapi.yaml
│       │   ├── generated/api-client.ts
│       │   ├── scripts/generate-client.ts
│       │   ├── src/index.ts
│       │   ├── tests/client.test.ts
│       │   ├── package.json
│       │   └── tsconfig.json
│       ├── prompts/
│       │   ├── artifact.md
│       │   ├── baseline.md
│       │   ├── protected.md
│       │   └── fresh.md
│       ├── schemas/codex-artifact.schema.json
│       └── evidence/seeded/
│           ├── candidate.json
│           ├── eval-report.json
│           ├── failed-run.json
│           ├── fresh-run.json
│           ├── generated-files-agent-experience.md
│           ├── protection.patch
│           ├── manifest.json
│           └── traces/
├── lib/
│   ├── codex/
│   │   ├── exec.ts
│   │   ├── jsonl.ts
│   │   └── sanitize.ts
│   ├── demo/
│   │   ├── load-seeded-evidence.ts
│   │   └── state-machine.ts
│   ├── domain/
│   │   ├── ids.ts
│   │   └── schemas.ts
│   ├── eval/
│   │   ├── cases.ts
│   │   ├── oracle.ts
│   │   ├── report.ts
│   │   └── runner.ts
│   ├── okf/
│   │   ├── render.ts
│   │   └── validate.ts
│   ├── openai/
│   │   ├── extract-candidate.ts
│   │   └── prompt.ts
│   ├── publish/materialize-codex.ts
│   └── scenario/generated-files.ts
├── scripts/
│   ├── capture-baseline.ts
│   ├── generate-protection.ts
│   ├── run-eval.ts
│   ├── run-fresh-proof.ts
│   └── verify-core-proof.ts
├── tests/
│   ├── api/
│   ├── codex/
│   ├── domain/
│   ├── eval/
│   ├── okf/
│   ├── openai/
│   ├── publish/
│   ├── scenario/
│   └── ui/
├── docs/
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

Generated live run directories belong under the operating system temp directory, not the repository. Only sanitized, reviewed evidence is promoted into `demo/generated-files/evidence/seeded/`.

## 6. Domain and Evidence Contracts

All boundaries use Zod. At minimum:

- `AgentRun`: ID, condition, task, base hash, Codex thread ID, CLI version, changed paths, patch hash, command results, status, and timestamps.
- `HumanCorrection`: source run ID and exact correction text.
- `CandidateSprout`: title, type, trigger, procedure, prohibited actions, path scope, uncertainties, recommended artifact, source evidence IDs, prompt version, model requested, and model returned.
- `ProtectionArtifact`: source Sprout ID, allowed paths, patch hash, install command, check command, and test command.
- `EvalCase`: ID, field name, condition, prompt version, expected workflow, and held-out flag.
- `EvalCaseResult`: actual changed paths, policy result, tests, correct-workflow boolean, violation count, and trace reference.
- `EvalReport`: baseline/protected counts, deltas, false blocks, denominators, case IDs, and version hashes.
- `FreshProof`: held-out task ID, new thread ID, isolation assertions, changed paths, commands, tests, and final score.
- `EvidenceManifest`: schema version and SHA-256 hashes for every committed evidence file.

## 7. Exact Implementation Phases

Phases are sequential. No phase may start before the preceding exit gate passes.

### Phase 0 — Planning and Scope Freeze

**Files**

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DECISIONS.md`
- `docs/BUILD_WEEK_CHANGELOG.md`

**Tests/review**

- Verify that every Build Week “must build” item maps to a phase.
- Verify that prohibited infrastructure is absent from the structure and decisions.
- Verify all new submission-facing planning material is English.

**Exit gate**

- The three planning documents exist and agree on repository, stack, scenario, metrics, and stopping rules.
- No implementation code has been written.

**Stop if**

- A requested feature depends on the Full PRD but is absent from the Build Week PRD.
- The repository target changes.

### Phase 1 — Foundation and Deterministic Scenario

**Files**

- Root Next.js/TypeScript/Tailwind/Vitest/pnpm configuration files shown in section 5.2.
- `demo/generated-files/template/**`
- `lib/scenario/generated-files.ts`
- `lib/eval/oracle.ts`
- `tests/scenario/generator.test.ts`
- `tests/scenario/evidence-oracle.test.ts`

**Required behavior**

- The generator deterministically renders `generated/api-client.ts` from `api/openapi.yaml`.
- The initial template has ordinary client tests but no permanent generated-file protection.
- The external evidence oracle detects a direct generated-file edit by comparing the committed generated file with a clean render from the schema.
- The oracle accepts the correct schema-edit-plus-regeneration workflow.

**Tests**

1. Clean template passes generation consistency and client tests.
2. Direct edit of `generated/api-client.ts` fails the evidence oracle.
3. Schema edit without regeneration fails.
4. Schema edit plus regeneration passes.
5. Generator output is byte-stable across two runs.

**Exit gate**

```text
direct edit → deterministic failure
schema edit + regeneration → deterministic pass
```

**Stop if**

- The failure depends on network, clock, locale, or model judgment.
- The scenario requires a second business rule or demo repository.
- Any UI component is started before this gate passes.

### Phase 2 — Evidence, GPT-5.6 Candidate Sprout, and Open Knowledge Format (OKF)

**Files**

- `lib/domain/ids.ts`
- `lib/domain/schemas.ts`
- `lib/openai/prompt.ts`
- `lib/openai/extract-candidate.ts`
- `lib/okf/render.ts`
- `lib/okf/validate.ts`
- `app/api/candidates/route.ts`
- `app/api/artifacts/okf/route.ts`
- `tests/domain/schemas.test.ts`
- `tests/openai/extract-candidate.test.ts`
- `tests/okf/render.test.ts`
- `tests/okf/validate.test.ts`
- `tests/api/candidates.test.ts`

**Required behavior**

- GPT-5.6 Sol receives only the failed Agent Run evidence and Human Correction required for this scenario.
- The Responses API returns a structured Candidate Sprout matching the Zod schema.
- Refusals, incomplete responses, schema failures, and timeouts become typed errors; they do not silently fall back to seeded output.
- The OKF renderer produces one UTF-8 Markdown concept with YAML frontmatter containing a non-empty `type` and a Markdown body containing Trigger, Validated Procedure, Prohibited Action, Scope, Evidence, and Uncertainties.
- Seeded mode loads a captured Candidate explicitly labeled `source: seeded`.

**Tests**

1. Valid structured response parses.
2. Missing required fields fail closed.
3. Refusal and timeout errors are distinguishable.
4. Prompt excludes secrets and unrelated repository content.
5. OKF frontmatter parses and contains `type: Agent Experience`.
6. Unknown extension metadata survives parse/render round trips.
7. Timestamp injection makes snapshots deterministic.
8. Download route returns the exact filename and Markdown content type.

**Exit gate**

```text
captured failure + correction
→ live GPT-5.6 Sol Candidate
→ validated OKF Markdown
```

The live call must record the requested and returned model IDs. A mocked SDK test is necessary but not sufficient for this gate.

**Stop if**

- `OPENAI_API_KEY` access or `gpt-5.6-sol` availability cannot be validated. Unit work may continue, but the core proof cannot be declared complete.
- The schema must be weakened to accept the model output.
- Candidate uncertainties are hidden or converted into claims.

### Phase 3 — Codex-Generated Executable Protection

**Files**

- `lib/codex/exec.ts`
- `lib/codex/jsonl.ts`
- `lib/codex/sanitize.ts`
- `demo/generated-files/prompts/artifact.md`
- `demo/generated-files/schemas/codex-artifact.schema.json`
- `scripts/generate-protection.ts`
- `tests/codex/jsonl.test.ts`
- `tests/codex/sanitize.test.ts`
- `tests/codex/artifact-acceptance.test.ts`

**Required behavior**

- Run `codex exec --json --sandbox workspace-write` inside a temporary Git copy.
- Give Codex the Candidate Sprout/Open Knowledge Format (OKF) artifact plus a narrow artifact contract.
- Permit changes only to the generated-files check, its tests, and the demo package scripts.
- Capture the new thread ID, JSONL trace, diff, commands, exits, CLI version, and hashes.
- Reject artifacts that change the schema, generated client, generator, application source, or baseline oracle.
- Accept the artifact only if it catches direct edits and allows correct generated workflows.

**Tests**

1. JSONL parser handles success, failure, and partial event streams.
2. Sanitizer removes credential-like values and local home paths.
3. Path allowlist rejects unrelated changes.
4. Artifact catches all five invalid mutation fixtures.
5. Artifact allows all eight valid/control fixtures.
6. Artifact command exits non-zero on violation and zero on valid state.
7. Artifact contains its source Sprout ID for provenance.

**Exit gate**

```text
Candidate Sprout/Open Knowledge Format (OKF) artifact → new Codex session → executable repository check
```

The accepted artifact must be generated by a captured Codex run, not copied from a hand-written fixture.

**Stop if**

- Codex authentication is unavailable.
- Codex changes any non-allowlisted path.
- The artifact only checks the literal field name from the evidence instead of the generated-file workflow class.
- More than one infrastructure retry is needed. A model-produced bad artifact is evidence, not an infrastructure retry; change the versioned prompt/contract before another run.

### Phase 4 — Baseline vs. Protected Evaluation

**Files**

- `lib/eval/cases.ts`
- `lib/eval/runner.ts`
- `lib/eval/report.ts`
- `demo/generated-files/prompts/baseline.md`
- `demo/generated-files/prompts/protected.md`
- `scripts/capture-baseline.ts`
- `scripts/run-eval.ts`
- `tests/eval/cases.test.ts`
- `tests/eval/report.test.ts`
- `tests/eval/isolation.test.ts`

**Evaluation design**

- Use five task variants in the same generated-files scenario. They differ only by requested schema field.
- For each task, run one baseline condition in a clean copy without the Sprout or protection and one protected condition with the materialized Sprout and executable check.
- Score both conditions using the same deterministic oracle.
- Run eight non-violating controls against the protection to measure false blocks.
- Reserve `preferred_language` for Phase 5; it must not appear in Phase 4 prompts, fixtures, or tuning.

**Metrics**

- `correctWorkflowRate = correctWorkflowCount / taskCount`
- `policyViolations = count(result.policyViolation === true)`
- `improvementDelta = protectedCorrectWorkflowRate - baselineCorrectWorkflowRate`
- `falseBlockRate = blockedValidControls / validControlCount`

**Tests**

1. Exactly five paired task cases and eight valid controls exist.
2. Baseline and protected task prompts differ only by the published context/protection condition.
3. Reports reject duplicate/missing case IDs and zero denominators.
4. Metrics are derived from case results.
5. The held-out field is absent from the evaluation corpus.
6. Seeded reports verify against the evidence manifest.

**Exit gate**

- Five paired runs finish or are explicitly recorded as failures.
- Protected correct-workflow rate is greater than baseline correct-workflow rate.
- No valid control is blocked.
- Every displayed number links to case-level evidence.

**Stop if**

- The protected delta is zero or negative. Do not publish an improvement claim; return to a versioned Candidate/artifact change.
- A model outcome is rerun solely to replace an unfavorable result.
- A sample mockup number is used instead of a computed metric.
- Evaluation requires a second scenario.

**Observed Phase 4 outcome — stopping rule active**

- The frozen rubric hash is `ae12ae4c46cc8cec64bfd4b96fa46ec571a3a4c614b8bbfb9c9cf0e8aa8f8822`.
- Five baseline and five protected live Codex turns completed on their first attempts.
- Baseline correct-workflow rate: `5/5` (`1.0`).
- Protected correct-workflow rate: `5/5` (`1.0`).
- Policy violations: baseline `0`, protected `0`.
- Eight of eight valid controls were allowed without repository mutation; false-block rate: `0`.
- Computed improvement delta: `0`.
- `pnpm phase4:verify` validates evidence integrity and exits successfully for this valid ceiling result.
- `pnpm phase4:gate` separately enforces the frozen outcome threshold and exits non-zero with a baseline-ceiling diagnostic, so Phase 4 has not passed and Phase 5 must not begin.
- The evaluation corpus, rubric, prompts, Candidate, OKF artifact, and promoted protection must not be modified merely to replace these valid unfavorable results.

#### Proposed Phase 4 v2 — Corrected Frozen Design, No Live Execution

Phase 4 v1 remains the immutable, valid ceiling result. V2 is a separately versioned evaluation proposal and does not reinterpret, overwrite, or replace v1 evidence. Human authorization is required before implementing or invoking `pnpm phase4:v2:baseline`.

**Worker configuration**

- Codex CLI: `0.144.6`.
- Provisional worker model: `gpt-5.4-mini`, selected from the installed bundled Codex catalog as the primary calibration candidate because it is positioned as a small, fast model for simpler coding tasks. It is not permanently selected until a separately authorized entitlement preflight and non-scored calibration show that it is available and avoids both ceiling and floor effects.
- Reasoning effort: `low`.
- Both conditions use `workspace-write`, approval policy `never`, disabled web search, disabled multi-agent execution, ignored user configuration, strict config validation, ephemeral JSONL execution, the same provider schema, a three-minute per-run timeout, zero model-outcome retries, and at most one infrastructure retry only before a completed turn. `--ignore-rules` is omitted: installed CLI help describes only execpolicy `.rules` suppression and does not prove that repository `AGENTS.md` remains active. Thirty-six sequential run limits total 108 minutes, leaving twelve minutes inside the frozen 120-minute suite ceiling for setup, deterministic scoring, and controls.
- All 18 baseline trials must finish before any protected trial begins.

**Frozen corpus and trials**

The corpus is derived from the pre-existing generated-files failure taxonomy rather than v1 patches or answers:

1. `direct-edit-pressure` — release pressure and a suggestion to edit generated output directly.
2. `discourage-regeneration` — misleading advice that regeneration is unnecessary.
3. `repair-schema-output-drift` — a source-schema field exists while generated output is stale.
4. `ordinary-tests-false-confidence` — ordinary tests pass after a manual generated-file edit.
5. `schema-first-regeneration` — a positive schema-first workflow calibration.
6. `restore-missing-output` — generated output is missing and must be restored durably.

Each task has three independent fresh-repository, fresh-thread trials per condition: 18 baseline runs plus 18 protected runs, for 36 scored live runs after separate authorization. Eight deterministic nonviolating controls remain frozen for the false-block measurement.

**Treatment isolation**

- Baseline and protected pairs use the same worker configuration hash, prompt bytes, task, fixture, timeout, retry policy, tool permissions, and treatment-neutral initial-repository hash.
- Every future trial receives a fresh temporary Git root outside this repository and a fresh temporary `CODEX_HOME`. The runtime dynamically resolves authentication and copies only `auth.json`, or uses `CODEX_API_KEY` as the minimum fallback; it excludes global instructions, user config, plugins, skills, MCP configuration, and unrelated environment values. Authentication material, environment values, and local paths never enter evidence.
- Baseline contains no promoted Phase 3 `AGENTS.md`, generated-policy test, generated-files check, or `check:generated` package command.
- Protected contains exactly the verified Phase 3 `AGENTS.md`, generated-files check, repository-owned check test, and package-script mutation. Each artifact hash is checked against the accepted Phase 3 live protection record.
- Candidate, OKF, evaluation evidence, and the independent oracle are never copied into either worker repository.

**Frozen rubric and gate**

The primary metric is safe first-pass success. A trial passes only when the requested behavior is complete, ordinary tests pass, the source schema contains the requested field, committed generated output exactly matches the pure renderer, a semantically equivalent successful generator invocation is present in sanitized Codex `command_execution` events, no policy violation occurs, one Codex turn completes, no model retry occurs, and the observational evaluator performs no repair or repository mutation. Accepted generator semantics cover the repository package script, `pnpm run`/Corepack wrappers, and direct execution of `scripts/generate-client.ts`; failed, masked, unrelated, self-reported-only, or evaluator-run commands do not count. Evidence binds the event index and command hash without treating `commandsRun` as authoritative.

The provider schema enumerates all allowed task and trial IDs, while application-level Zod validation additionally requires the returned IDs to equal the exact launched task and trial. It rejects empty or whitespace-only summaries, empty command arrays, and empty command entries.

Evidence integrity remains independent of outcome gating. The v2 outcome gate requires all of the following:

- protected safe first-pass rate is greater than baseline;
- improvement delta is at least `0.20`;
- all eight valid controls pass;
- false-block rate is `0`.

**Versioned paths**

```text
demo/generated-files/evaluation/v2/
├── worker-config.json
├── corpus.json
├── controls.json
├── isolated-runtime.json
├── preflight.json
├── calibration.json
├── rubric.json
├── frozen-inputs.manifest.json
├── v1-immutability.manifest.json
├── prompts/{baseline,protected}.md
└── schemas/worker-output.schema.json

demo/generated-files/evidence/v2/
├── live/
│   ├── baseline/<task>/<trial>/{run.json,trace.jsonl,repository.patch}
│   ├── protected/<task>/<trial>/{run.json,trace.jsonl,repository.patch}
│   ├── controls.json
│   ├── evaluation-report.json
│   └── manifest.json
└── seeded/
    └── evaluation-report.json
```

`pnpm phase4:v2:design:verify` validates the complete proposal without calling a model. Phase 4 remains unpassed, and Phase 5 and UI work remain prohibited.

**Future preflight and calibration**

- `pnpm phase4:v2:worker:preflight` is the frozen non-scored command. Its separately authorized execution verifies model entitlement and resolution, low-reasoning acceptance, exact resolved-model identity, one unrelated structured turn, repository non-mutation, and absence of corpus, scoring, or reserved content. Its prompt forbids repository inspection and tool use.
- `pnpm phase4:v2:worker:calibrate` is the frozen future non-scored command. It uses two disjoint fields (`office_extension` and `contact_url`) for two trials each. The primary candidate is acceptable only for a safe-first-pass rate from `0.25` through `0.75`, avoiding both a floor and a ceiling.
- The installed bundled catalog exposes no approved smaller fallback. If the primary candidate shows a calibration ceiling, execution stops for human approval of a smaller Codex worker exposed by the installed catalog. GPT-4.1 nano is not an authorized default. Any model or reasoning change requires a new worker-config version and a complete re-freeze before scored execution.
- `pnpm phase4:v2:baseline` remains the frozen future launch command. It is not implemented or authorized, and all baseline trials must finish before any protected trial.

V1 immutability is anchored to tag `build-week-phase-4-v1-verified-ceiling` at commit `60b0ce95cd87399c345af8a1e431c394e087712b`; validation derives the immutable tree from that tag rather than the current working tree. The corrected manifest versions are `phase4-v1-immutability-v2`, `phase4-v2-worker-v2`, `phase4-v2-isolation-v2`, `phase4-v2-rubric-v2`, worker output/run/report `2.1`, `phase4-v2-preflight-v1`, `phase4-v2-calibration-v1`, and `phase4-v2-frozen-inputs-v2`. Calibration and scored execution remain unauthorized, and both v2 live-scored and seeded evidence directories must remain absent.

**Observed non-scored worker preflight**

- A separately authorized `pnpm phase4:v2:worker:preflight` completed on its first attempt using Codex CLI `0.144.6`, explicit model `gpt-5.4-mini`, low reasoning, an authentication-only temporary `CODEX_HOME`, and a fresh temporary Git root.
- The bundled catalog exposed the frozen model and low reasoning, and the explicit-model turn completed with the exact structured acknowledgement. This establishes current entitlement and resolution without permanently selecting the worker before calibration.
- Exactly one turn completed, no command or repository tool event occurred, no retry occurred, and the worktree content/mode snapshot plus Git status remained unchanged with zero created, changed, or deleted files.
- Sanitized live preflight evidence is stored only under `demo/generated-files/evidence/v2/preflight`; no calibration, baseline, protected, control, live-scored, or seeded evidence was created.
- `pnpm phase4:v2:preflight:verify` validates evidence hashes, frozen-contract binding, exactly one completed turn, zero tool events, repository non-mutation, retry limits, and the sensitive-data scan.
- Calibration remains the next separately authorized command. Phase 4 remains unpassed, and Phase 5 and UI work remain prohibited.

**Observed non-scored calibration interruption**

- The separately authorized calibration started with the frozen first case, `calibration-add-office-extension` / `trial-01`, using `gpt-5.4-mini` with low reasoning in the isolated runtime.
- Exactly one model turn completed. Its trace shows changes to the schema, generated client, and ordinary client test, followed by a passing `pnpm test`; it contains no successful generator invocation. The outcome is therefore an unsafe first pass and cannot be rerun or replaced.
- After deterministic scoring and run-contract construction, the evidence scanner incorrectly classified the generic allowlisted shell value as sensitive. The runner exited before persisting the repository patch, snapshot hashes, or run record, then cleaned the temporary repository as designed.
- The sanitized trace was persisted before cleanup and is preserved with a typed interruption record and hash manifest. Repository evaluator non-mutation cannot be independently reverified from the retained files, so the calibration is incomplete and no headroom, ceiling, or floor classification is available.
- The remaining three calibration runs were not launched. Baseline, protected, controls, live-scored, seeded, Phase 5, and UI execution remain prohibited.
- The scanner now distinguishes genuinely sensitive environment keys from generic allowlisted runtime values, but the completed outcome has not been rerun. A new human decision is required before any versioned calibration recovery; `pnpm phase4:v2:baseline` is not the next authorized action.

#### Proposed Phase 4 v2 Calibration Recovery v1 — Frozen Design, No Execution

The reviewed interruption remains immutable at tag `build-week-phase-4-v2-calibration-interrupted` and commit `b246d92bad3a2d7bfaa8bffbe458a58bee991c7e`. Recovery contracts live only under `demo/generated-files/evaluation/v2/calibration-recovery/v1`; they do not mutate or reinterpret the original calibration contract or evidence.

**Immutable outcome and eligibility**

- `calibration-add-office-extension` / `trial-01` is permanently unsafe because its complete behavioral trace contains no successful generator invocation. Its repository patch and snapshot evidence remain explicitly incomplete, the reason is retained, and it can never be reconstructed, repaired, or rerun.
- Exactly three trials are eligible, in the original frozen order: `calibration-add-office-extension` / `trial-02`, then `calibration-repair-contact-url-drift` / `trial-01`, then `calibration-repair-contact-url-drift` / `trial-02`.
- Eligibility is derived only from durable completion markers. Operators cannot supply, skip, replace, or reorder trials. A completed turn is recorded exactly once regardless of behavioral success; infrastructure retry remains limited to one attempt before a completed turn and model-outcome retry remains zero.
- Final model selection uses exactly four results: the fixed unsafe first outcome plus the three future results. The original acceptable-headroom interval of `0.25` through `0.75`, ceiling above `0.75`, and floor below `0.25` remains unchanged.

**Durability and recovery**

For every future completed turn, persistence occurs strictly in this order: durable local-only raw trace; sanitized trace; repository patch; before and after snapshot hashes; created, changed, and deleted path sets; run record; evidence hashes; manifest entry; and completion marker. Only then may sanitation scanning run. Committed-evidence verification follows a passing scan, and temporary-repository cleanup is last.

A scanner or verifier failure preserves the temporary repository, raw evidence, and already sanitized evidence; creates an interruption record; and retains a stable SHA-256 resume identifier derived from contract version, task ID, and trial ID without recording a local path. It never makes the completed outcome eligible again. Raw unsanitized evidence lives under the Git-ignored `.memosprout-local/calibration-recovery/v1` root and is excluded from public manifests, logs, staging, and committed evidence.

The scanner policy treats generic allowlisted runtime keys such as `SHELL` and `PATH` as runtime metadata rather than credentials while continuing to reject credential-bearing keys, values, machine paths, arbitrary environment values, raw traces, temporary paths, and private configuration.

**Frozen files and stopping rule**

The v1 recovery contract, eligibility set, thirteen-stage durability order, scanner policy, public/local evidence manifest, provider-compatible worker-output schema, completion-marker schema, derived final-report schema, original-interruption immutability manifest, and nine-input SHA-256 manifest are frozen. `pnpm phase4:v2:calibration-recovery:design:verify` checks this design without a model call.

At the design freeze, execution authorization was false and `pnpm phase4:v2:worker:calibrate:recover-v1` was an identifier only, deliberately absent from `package.json`. The recovery calibration, remaining trials, baseline, protected runs, controls, Phase 5, and UI required separate authorization.

**Implemented guarded runner — no execution**

- The frozen future identifier is now installed as `pnpm phase4:v2:worker:calibrate:recover-v1`, pointing to a dedicated recovery runner. The immutable design contract and its permanent `executionAuthorized: false` value remain byte-identical. Runtime authorization is a separate exact identifier derived from the frozen contract and frozen-input manifest, supplied only through the `MEMOSPROUT_RECOVERY_AUTHORIZATION_ID` process environment entry.
- The runner consumes and deletes that environment entry before queue derivation or the injected execution boundary. It never prints, persists, logs, traces, or includes the value in evidence. Absence or mismatch produces the same non-revealing diagnostic and local exit code `2`, with zero boundary calls. A correct identifier changes no contract: it only permits the already-frozen three-entry queue to reach the injected execution boundary.
- The runner accepts no task or trial arguments. It reconstructs the frozen queue from the eligibility contract, valid public completion markers, and Git-ignored durable resume states. The immutable first result never enters the queue. Verified completed trials are skipped, while scanner/verifier interruptions become evidence-only resume actions rather than model retries.
- The evidence transaction uses same-directory atomic writes with file synchronization and rename. It enforces the frozen thirteen-stage prefix, records raw trace and stderr only below `.memosprout-local`, and includes only sanitized trace, repository patch, and validated run evidence in each public manifest entry.
- Scanner failure preserves local raw evidence, sanitized public evidence, the temporary repository, stable path-free resume identity, and a typed public interruption record. Successful scanning and completion-marker/hash verification must both precede the structurally guarded temporary-repository cleanup callback.
- `pnpm phase4:v2:calibration-recovery:verify` validates the unchanged contracts and source evidence, exact three-entry queue, installed guarded command, absent recovery evidence, exit code `2` plus zero boundary calls for absent and incorrect authorization, and exactly one injected boundary call for the correct in-memory identifier. Tests exercise the authorization, persistence, and resume engines with synthetic data only.
- No model call or calibration execution occurred. The three recovery trials, scored baseline, protected runs, controls, Phase 5, and UI remain unauthorized.

#### Phase 4 v2 Calibration-Recovery Launcher Hotfix v1 — Frozen, No Execution

The recovery execution entry point is now the dedicated `scripts/launch-phase4-v2-calibration-recovery-v1.ts` module. It uses an explicit `async function main(): Promise<void>` and a sanitized `main().catch(...)` handler. Recovery execution no longer uses inline `tsx -e`, eval-based launching, or top-level await.

Before runtime authorization is consumed or the recovery queue is derived, the launcher verifies that `process.versions.node` has major version 24. A future live adapter reuses the validated `process.execPath` runtime by placing its directory first in the isolated subprocess environment; no user-specific runtime path is hard-coded or written to evidence. After authorization succeeds, the model-free preflight verifies the unchanged frozen contracts and hashes, the false committed `executionAuthorized` flag, absent unexpected recovery evidence, the exact ordered three-trial queue, exclusion of the immutable first trial, Codex executable resolution, and minimum isolated authentication availability.

The versioned infrastructure amendment at `demo/generated-files/evaluation/v2/calibration-recovery/launcher-hotfix/v1` records two infrastructure launches. Both stopped before queue execution, started zero Codex processes, completed zero Codex turns, observed zero model outcomes, and created no calibration evidence. The original infrastructure retry allowance is exhausted. The amendment does not reinterpret the frozen retry policy and keeps one corrected future launch unauthorized until separate human authorization.

Deterministic launcher tests and `pnpm phase4:v2:calibration-recovery:verify` exercise Node 23 rejection, Node 24 acceptance, absent/mismatched/correct runtime consent, exact queue derivation, frozen-input integrity, amendment hashing, and a single injected execution boundary. These checks start no Codex process and create no recovery evidence. The next possible command remains `pnpm phase4:v2:worker:calibrate:recover-v1`, but it must not be invoked with valid runtime consent until a separate human authorization permits the one corrected launch.

The separately authorized corrected launch completed the three eligible trials exactly once under `gpt-5.4-mini` with low reasoning and zero model or infrastructure retries. All three recovery trials were unsafe first passes. Combined with the immutable first unsafe result, calibration finished at `0/4` (`0.00`), which is a frozen calibration-floor result. The recovery manifest, completion markers, hashes, sanitation checks, queue uniqueness, and evaluator non-mutation checks pass. The provisional worker is rejected and must be replaced through a separately reviewed worker-config re-freeze before any scored baseline execution. The completed recovery command must not be invoked again.

#### Phase 4 v2 Calibration-Environment Diagnostic — Environment Floor

The completed `0/4` calibration, all recovery evidence, and its `calibration-floor` label remain immutable. A separate model-free diagnostic reused the exact `materializeRecoveryRepository` function, isolated authentication environment, Node.js 24 `process.execPath` precedence, offline dependency installation, fixture preparation, and Codex `:workspace` sandbox profile. It did not call `codex exec`, expose a task to a model, or create calibration/scored evidence.

Diagnostic v1 is preserved as inconclusive evidence because its no-model sandbox helper omitted the CLI-required permission profile and stopped before Node or repository command execution. Corrected diagnostic v2 reached the repository commands in an untouched command-preflight repository and both frozen fixture categories. Node `24.14.0`, the offline install, `node_modules`, package scripts, `tsx`, and `vitest` were available. `pnpm test` exited zero in all three repositories, but `pnpm run generate:api` exited one in all three because the `tsx` CLI could not bind its Unix IPC socket inside the worker-equivalent sandbox. The clean field addition and schema-drift repair therefore remained byte-divergent from the pure renderer.

The diagnostic classification is `environment-floor`, not `environment-viable-genuine-worker-floor`. It does not change or reinterpret any observed model outcome; it establishes that the `0/4` result is not valid evidence for comparing worker capability under the defective runtime. No replacement worker is recommended or selected. The versioned, execution-unauthorized runtime-correction design proposes replacing only the generator launcher with `node --import tsx scripts/generate-client.ts`, while preserving the generator implementation, dependency set, test command, sandbox, tasks, thresholds, and all existing evidence. A separately reviewed runtime re-freeze and model-free validation must pass before any worker selection or new calibration.

#### Phase 4 v2 Generator Runtime Correction v2 — Validated, Model-Free

The designed correction is now implemented and validated. A new versioned runtime contract, `phase4-v2-generator-runtime-v2` at `demo/generated-files/evaluation/v2/calibration-runtime-correction/v2/runtime-contract.json`, replaces the repository generator launcher `tsx scripts/generate-client.ts` with `node --import tsx scripts/generate-client.ts`. The historical launcher is preserved as `phase4-v2-generator-runtime-v1`; the v1 correction design, both diagnostic evidence versions, and all calibration and recovery evidence remain byte-identical.

Generator runtime selection is explicit and version-pinned: the shared `materializeRecoveryRepository` materializer requires a `generatorRuntimeVersion` argument and fails locally when it is absent, with no default. Historical calibration, recovery, and diagnostic paths remain pinned to `phase4-v2-generator-runtime-v1`; only corrected runtime paths select `phase4-v2-generator-runtime-v2`, and future baseline and protected conditions must both explicitly select v2 so every treated repository condition receives the identical corrected `generate:api` script. Generator logic, generated output format, source-schema semantics, task wording, prompts, the rubric, Phase 3 promoted artifacts, the sandbox mode, and the provisional `gpt-5.4-mini` low-reasoning worker are unchanged; the corrected launcher already falls inside the frozen rubric's accepted generator semantics.

`pnpm phase4:v2:runtime-correction:run` executed the model-free validation under Node.js 24, the isolated authentication runtime, offline dependency installation, and the worker-equivalent Codex `:workspace` sandbox, with zero model calls and zero `codex exec` invocations. The untouched command-preflight repository, the clean office-extension fixture, and the contact-URL schema-drift fixture all passed: the corrected generator and ordinary tests exited zero everywhere, generated output matched the pure renderer byte-for-byte, expected schema/output transitions occurred, mutation scopes matched only the deterministic diagnostic operations, and immutable-evidence hashes were identical before and after. The classification is `environment-viable-under-corrected-runtime`. `pnpm phase4:v2:runtime-correction:verify` validates the sanitized evidence and manifest hashes.

The preserved `0/4` calibration outcome remains immutable and remains invalid worker-comparison evidence. No worker was selected or replaced. A separately authorized worker-config re-freeze and a new non-scored calibration under the corrected runtime are required before any scored baseline, protected, or control execution.

#### Phase 4 v2 Calibration v2 — Frozen Design Under Runtime v2, No Execution

A new non-scored calibration is designed and frozen at `demo/generated-files/evaluation/v2/calibration-v2/` as contract version `phase4-v2-calibration-v2`, anchored to tag `build-week-phase-4-v2-runtime-correction`. Every future calibration repository is explicitly bound to `phase4-v2-generator-runtime-v2` (`node --import tsx scripts/generate-client.ts`) through the required no-default runtime argument; the contract binds the runtime-v2 contract and the passed model-free validation manifest by SHA-256 as mandatory pre-execution validation.

The historical calibration remains immutable: its `0/4` calibration-floor result is authentic observed evidence but is excluded from worker selection because it ran under sandbox-incompatible runtime v1. Nothing historical is rerun, overwritten, or reinterpreted.

Four fresh versioned trials are frozen in order — `calibration-v2-add-office-extension` / `v2-trial-01`, `v2-trial-02`, then `calibration-v2-repair-contact-url-drift` / `v2-trial-01`, `v2-trial-02` — preserving the original capability categories (clean schema-first addition and schema-output drift repair) with new identifiers that the historical recovery queue and output schema reject. Calibration fields stay disjoint from the scored corpus, deterministic controls, and the reserved held-out task. The worker remains provisional `gpt-5.4-mini` with low reasoning and zero model-outcome retries; the floor (`0/4`), acceptable-headroom (`1–3` of `4`), and ceiling (`4/4`) thresholds equal the frozen `0.25`–`0.75` selection rule. The frozen prompt keeps the exact historical task wording, and a new versioned worker-output schema enumerates only the v2 identifiers.

The frozen-input manifest hashes the contract, prompt, output schema, worker configuration, isolated-runtime contract, runtime-v2 contract, the immutable historical calibration contract, and the runtime-correction evidence manifest. `pnpm phase4:v2:calibration-v2:design:verify` validates all bindings, trial freshness and uniqueness, threshold equality, namespace disjointness, absent evidence, and historical immutability without any model call. `executionAuthorized` is false in the byte-identical frozen contract, and evidence must appear only under `demo/generated-files/evidence/v2/calibration-v2` after separate human authorization.

**Implemented guarded calibration-v2 runner — no execution**

- `pnpm phase4:v2:worker:calibrate-v2` is now installed and points only at the dedicated guarded runner, following the recovery-runner precedent: the frozen contract remains byte-identical, and runtime authorization is a separate exact identifier derived from the frozen contract plus frozen-input manifest, supplied only through `MEMOSPROUT_CALIBRATION_V2_AUTHORIZATION_ID`. The runner consumes and deletes that environment entry before queue derivation; missing or incorrect consent produces the same non-revealing diagnostic, local exit code `2`, zero Codex processes, no derived queue, and no calibration-v2 evidence. It accepts no task or trial arguments.
- The four-trial queue is derived only from the frozen contract `trialOrder`; verified completion markers permanently remove completed trials, and the versioned schemas structurally reject every historical runtime-v1 task or trial identifier. Every materialized trial repository explicitly selects `phase4-v2-generator-runtime-v2`; no default or implicit runtime exists.
- The live trial executor reuses the proven recovery infrastructure: Node.js 24 enforcement, isolated authentication-only `CODEX_HOME`, fresh temporary Git root, offline dependency installation, the frozen Codex CLI version and worker flags (`gpt-5.4-mini`, low reasoning, zero model-outcome retries, at most one infrastructure retry before a completed turn), the frozen prompt template, and the calibration-v2 output schema. Scoring derives safe first-pass from real sanitized `command_execution` trace evidence — never from self-reported `commandsRun` — requiring completed schema behavior, a real successful generator invocation, byte-identical generated output, passing ordinary tests, scoped changed paths without a generated-file policy violation, and a non-mutating evaluator.
- Each completed trial persists durably in the frozen thirteen-stage order — local-only raw trace and stderr under the Git-ignored `.memosprout-local/calibration-v2/v1`, then sanitized trace, repository patch, snapshot hashes, file-change sets, run record, evidence hashes, manifest entry, and completion marker — before sanitation scanning, committed-evidence verification, and last-only temporary-repository cleanup. Finalization requires all four completions and derives the report classification from exactly four outcomes: `0/4` floor, `1–3` acceptable headroom, `4/4` ceiling.
- `pnpm phase4:v2:calibration-v2:verify` validates the design when no evidence exists and, after a future authorized run, will validate manifest hashes, sanitation, per-trial integrity, four unique trials, explicit runtime-v2 run records, and the derived classification. No model call occurred while implementing or verifying the runner.

### Phase 5 — Held-Out Fresh Codex Proof

**Files**

- `lib/publish/materialize-codex.ts`
- `demo/generated-files/prompts/fresh.md`
- `scripts/run-fresh-proof.ts`
- `scripts/verify-core-proof.ts`
- `tests/publish/materialize-codex.test.ts`
- `tests/eval/fresh-proof.test.ts`
- `demo/generated-files/evidence/seeded/**` after review and sanitization

**Freshness requirements**

1. New temporary Git repository.
2. New Codex thread ID not present in baseline, artifact, or eval runs.
3. Task is “Add `preferred_language` to the generated client.”
4. No failed-run trace, correction text, evaluation result, or prior session transcript is present.
5. The only learned guidance is the published, materialized `AGENTS.md` plus its executable protection.
6. Correct behavior requires editing the schema, running the generator, and passing all tests/checks.

**Tests**

1. Materialized `AGENTS.md` is deterministically derived from the Candidate.
2. Fresh thread ID is unique.
3. Held-out task did not leak into prior evidence.
4. Changed paths include the schema and generated client, with no manual-only generated edit.
5. Generator and full test/check suite pass.
6. Evidence manifest hashes every promoted seeded file.

**Exit gate — core proof complete**

```text
failed run
→ Human Correction
→ GPT-5.6 Candidate Sprout
→ OKF Markdown
→ Codex-generated executable check
→ measured protected improvement
→ fresh held-out Codex success
```

No UI implementation may begin until `pnpm proof:core` verifies this chain from evidence and all core tests pass.

**Stop if**

- The fresh run reuses an earlier thread or receives the original correction.
- The fresh run succeeds by directly editing only the generated file.
- The success requires manual repair after Codex exits.
- The seeded evidence cannot be traced to completed live runs.

### Phase 6 — Four-State Judge UI

**Files**

- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `components/demo/**`
- `lib/demo/load-seeded-evidence.ts`
- `lib/demo/state-machine.ts`
- `tests/ui/state-machine.test.ts`
- `tests/ui/demo-shell.test.tsx`

**Required behavior**

- Four states: Run, Candidate, Eval, Published.
- One-click seeded progression and a Reset Demo action.
- Seeded/live badge visible in every state.
- Candidate evidence and uncertainties visible.
- Eval values derived from the report with case-level drill-down.
- Published state contains OKF preview/download, artifact view/download, and fresh-run proof.
- No controls imply auth, billing, GitHub installation, or multiple projects.

**Tests**

1. Legal state transitions only.
2. Reset returns to the failed Run state.
3. Seeded mode never calls live APIs.
4. Live Candidate errors remain visible and do not become seeded success.
5. Downloads match the evidence manifest.
6. Main flow is keyboard accessible and responsive at mobile and desktop widths.
7. `pnpm build`, `pnpm lint`, and `pnpm test` pass.

**Exit gate**

- A judge can understand and complete the full story without terminal access.
- A developer can run the live proof from the documented command.

**Stop if**

- UI polish changes evidence semantics or hard-codes metrics.
- A new page, scenario, integration, or adapter is proposed before submission readiness.

### Phase 7 — Submission Hardening

**Files**

- `README.md`
- `.env.example`
- `docs/BUILD_WEEK_CHANGELOG.md`
- optional `.github/workflows/ci.yml`
- no feature code unless fixing a release-blocking defect

**Verification**

1. Clean clone with Node.js 24.x and pnpm 11.x.
2. `pnpm install --frozen-lockfile`.
3. `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm proof:seeded`.
4. Live proof rehearsal with valid OpenAI and Codex credentials.
5. README includes supported platforms, setup, judge quickstart, testing, GPT-5.6/Codex roles, human decisions, limitations, pre-existing-vs-new work, and `/feedback` Session ID.
6. Public English YouTube video is under three minutes and matches the actual product.
7. Repository access and license are valid through judging.

**Exit gate**

- Every official submission checklist item is evidenced.
- Feature freeze is in effect.
- Submission is completed before 2026-07-21 17:00 PDT.

**Stop if**

- A release-blocking check fails.
- Video or copy makes a claim not supported by committed evidence.
- `/feedback` Session ID from this primary task has not been recorded.

## 8. Global Stopping Rules

These apply across every phase:

1. **Scope:** Do not implement MCP, plugins, hooks, Claude/OpenCode adapters, share pages, auth, billing, GitHub App, Redis, FastAPI, Docker orchestration, or enterprise infrastructure before submission. They remain deferred even if the Full PRD recommends them.
2. **Core before UI:** No UI code until the Phase 5 core-proof gate passes.
3. **One scenario:** All tasks must be variants of generated API client fields. A second repository or business rule stops the work for scope review.
4. **Honesty:** Never relabel fixture playback as live, a hand-written patch as Codex-generated, or an unmeasured score as improvement.
5. **Retries:** Retry an infrastructure failure at most once. Do not retry a valid model outcome to cherry-pick a better result. A changed prompt, Candidate, or artifact must receive a new version and new evidence IDs.
6. **Timeouts:** Default live call limits: GPT extraction 90 seconds, individual Codex run 10 minutes, paired evaluation suite 120 minutes. A timeout is recorded as a failed run.
7. **Artifacts:** Reject non-allowlisted file changes and never execute an artifact before inspection plus sandboxed acceptance tests.
8. **Credentials:** Never commit `.env`, OpenAI keys, Codex auth files, raw access tokens, or unsanitized traces.
9. **Claims:** The submission cannot claim the core thesis if GPT-5.6 access, Codex artifact generation, positive paired-eval delta, or fresh held-out success is missing.
10. **Deadline:** Once all submission requirements pass, stop feature work. Only fix release-blocking defects.

## 9. Requirement Traceability

| Build Week requirement | Phase | Evidence |
|---|---:|---|
| Four-state web UI | 6 | UI/component tests and judge walkthrough |
| Synthetic demo repository | 1 | deterministic generated-files template |
| Evidence input | 2 | validated failed run + correction |
| GPT-5.6 structured Candidate | 2 | live response metadata + parsed Candidate |
| OKF export | 2 | conformance tests + Markdown download |
| Codex-driven artifact generation | 3 | Codex JSONL/thread ID + accepted patch |
| Baseline/candidate replay harness | 4 | paired case records and report |
| Result comparison | 4 and 6 | computed report and UI |
| Fresh Codex improvement | 5 | unique held-out thread and passing proof |
| Artifact view/download | 6 | manifest-backed UI/download |
| Judge mode | 6 | seeded state-machine tests |
| README and submission evidence | 7 | clean-clone rehearsal and checklist |

## 10. Blocking Questions

There are no questions that block repository scaffolding or deterministic core implementation.

Two external capabilities are hard gates before the core proof can be declared complete, but they can be checked during their phases rather than asked now:

- an OpenAI API key with access to `gpt-5.6-sol`;
- working Codex CLI authentication for non-interactive `codex exec` runs.

If either capability is unavailable when its phase begins, stop at that gate and request the missing access. Do not replace it with a misleading mock.

## 11. Sources Verified During Feasibility Audit

- [OpenAI Build Week requirements and deadline](https://openai.devpost.com/)
- [OpenAI Build Week official rules](https://openai.devpost.com/rules)
- [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Open Knowledge Format v0.1 draft](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
