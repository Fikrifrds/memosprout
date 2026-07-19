# MemoSprout Build Week Implementation Plan

Status: Phase 4 v1 evidence valid; Phase 4 v2 non-scored worker preflight passed; calibration and scored execution unauthorized

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

Phase 3 was verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm demo`, and `pnpm phase3:verify`. Live and seeded protection evidence are stored separately. The accepted live run records Codex CLI `0.144.6`, thread `019f762a-c13f-7781-96cd-1b65a8ae4267`, the sanitized command, exact changed paths, artifact and patch hashes, and all thirteen acceptance results. The repository is standardized on Node.js 24.x and pnpm 11.x, with `pnpm@11.9.0` pinned for reproducibility.

Phase 4 now has a strict, reproducible evaluation harness, separately stored live and seeded reports, case-level traces and patches, and a hash-verified evidence manifest. Both conditions scored a `1.0` correct-workflow rate, producing an improvement delta of `0`; the eight nonviolating controls produced a false-block rate of `0`. The five baseline outcomes and five protected outcomes are retained as observed. No model outcome was retried, no metric or task was changed after observation, and Phase 5 remains unstarted.

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
