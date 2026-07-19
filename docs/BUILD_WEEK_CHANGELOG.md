# MemoSprout Build Week Changelog

This file distinguishes work created for OpenAI Build Week from anything that existed before the submission period. Entries describe completed repository changes only; planned work belongs in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

## Before Build Week Implementation

At the planning baseline, commit `4ca681d` contained:

- a one-line MemoSprout README;
- the repository license;
- a general Node/Next.js `.gitignore`.

There was no Next.js application, OpenAI integration, Codex execution adapter, generated-files demo, Open Knowledge Format (OKF) export, evaluation harness, judge UI, or test suite.

The two files under `docs/prd/` were supplied as product requirements for the Build Week effort and were untracked when the implementation audit began.

## 2026-07-18

### Planning and Feasibility Audit

Added:

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DECISIONS.md`
- `docs/BUILD_WEEK_CHANGELOG.md`

Decided:

- keep the existing `Fikrifrds/memosprout` repository;
- use one root Next.js App Router application with TypeScript, Tailwind, Zod, Vitest, and pnpm;
- complete the real executable proof before starting UI work;
- keep one generated-files scenario;
- use GPT-5.6 Sol for structured Candidate Sprout extraction;
- use non-interactive Codex CLI Agent Runs in temporary Git copies;
- separate real live proof generation from explicitly labeled seeded judge replay;
- export one conservative Open Knowledge Format (OKF) v0.1 Markdown concept;
- defer all infrastructure and integrations outside the Build Week vertical slice.

Audited:

- contradictions between the Build Week PRD and explicit implementation constraints;
- missing definitions for freshness, evaluation, provenance, retries, evidence integrity, and seeded mode;
- feasibility of GPT-5.6 structured output and non-interactive Codex execution against current official documentation.

No implementation code was added in this entry.

### Documentation Standardization

Changed:

- translated all Indonesian prose in the Build Week PRD, Full PRD, and Intelligence Amplification and Operational Distillation strategy document into professional English;
- standardized the implementation plan, decision log, and changelog in English;
- normalized canonical product terminology, positioning, taglines, heading capitalization, punctuation, and Markdown formatting across all six documents;
- clarified that the Build Week PRD is the authoritative current implementation scope and that the Full PRD and strategy document are long-term context only;
- clarified that MemoSprout improves system intelligence rather than a model's intrinsic intelligence or weights, and qualified all efficient-model comparisons accordingly;
- reconciled documentation wording with accepted Build Week architecture decisions without changing their substance.

Verified:

- repository-wide language search found no remaining Indonesian prose;
- Markdown code fences remain balanced in every standardized document;
- no implementation code was added.

### Phase 0 — Planning and Scope Freeze

Verified:

- every Build Week must-build requirement maps to a phase in `docs/IMPLEMENTATION_PLAN.md`;
- the repository, constrained TypeScript stack, generated-files scenario, evaluation metrics, and stopping rules agree across the authoritative implementation documents;
- prohibited infrastructure and long-term product features are absent from the implementation structure and accepted decisions;
- all submission-facing planning material is in English;
- the gate was evaluated before Phase 1 implementation code was added.

### Phase 1 — Foundation and Deterministic Scenario

Added:

- root Next.js, TypeScript, Tailwind CSS, Zod, Vitest, ESLint, and pnpm configuration;
- a pnpm lockfile and explicit dependency-build allowlist;
- one synthetic generated-files repository with an OpenAPI source schema, deterministic TypeScript client generator, committed generated client, and ordinary client tests;
- a reusable generated-files scenario module;
- an external SHA-256 evidence oracle that compares the committed generated client with a clean render from the schema;
- scenario tests covering clean generation, direct edits, missing regeneration, correct regeneration, and byte stability.

Changed:

- closed the command block in the root `AGENTS.md` so the required commands render correctly;
- pinned ESLint 9.39.5 after ESLint 10.7.0 proved incompatible with the current Next.js React lint plugin;
- marked Phases 0 and 1 complete in the implementation plan.

Evidence:

- `pnpm install --frozen-lockfile` completed successfully;
- `pnpm lint` completed with zero errors and zero warnings;
- `pnpm typecheck` completed with zero TypeScript errors;
- `pnpm test` passed 3 test files and 7 tests;
- `pnpm demo` passed the same 3 test files and 7 tests with individual scenario names;
- the standalone generator command completed and reproduced `generated/api-client.ts` byte-for-byte.

Deferred:

- no application page, route handler, UI component, GPT-5.6 integration, Candidate Sprout schema, or Open Knowledge Format (OKF) implementation was started;
- runtime declarations were standardized on Node.js 24.x and pnpm 11.x later the same day, as recorded below.

### Phase 2 — Evidence, Candidate Sprout, and Open Knowledge Format (OKF)

Added:

- strict Zod contracts for the failed Agent Run, Human Correction, corrected outcome, deterministic evidence, Candidate Sprout content, and provenance-bearing Candidate Sprout;
- a GPT-5.6 Sol Responses API integration using structured output, explicit response provenance, local `.env` loading for the live command, a 90-second timeout, and typed safe failures for unavailable credentials, rejected credentials, timeouts, refusals, incomplete responses, malformed output, and other API errors;
- an explicitly labeled deterministic seeded path that works without live API access and never claims live model provenance;
- OKF-compatible Markdown rendering and validation with deterministic timestamps, preserved extension metadata, human-readable evidence references, and Git-friendly output;
- Candidate and OKF route handlers, an offline Phase 2 verifier, and a live-generation command that writes only sanitized Candidate and OKF output to a separate live-evidence directory;
- seeded generated-files evidence for the failed Agent Run, Human Correction, corrected outcome, deterministic oracle results, Candidate Sprout, and OKF Markdown artifact;
- a separate live GPT-5.6 Sol Candidate Sprout and OKF Markdown artifact with requested model, returned model, response ID, and all four evidence references;
- tests for schema rejection, evidence and provenance integrity, malformed model output, typed live errors, prompt boundaries, deterministic seeded generation, OKF rendering and validation, and route behavior.

Changed:

- added the official OpenAI JavaScript SDK and Phase 2 verification scripts;
- recorded the completed Phase 2 live-call exit gate in the implementation plan;
- kept `preferred_language` absent from Candidate generation, fixtures, prompts, and validation so it remains held out for the fresh-task proof.

Evidence:

- `pnpm lint` completed with zero errors and zero warnings;
- `pnpm typecheck` completed with zero TypeScript errors;
- `pnpm test` passed 8 test files and 31 tests;
- `pnpm phase2:live` successfully generated and validated a Candidate using requested and returned model `gpt-5.6-sol`, recording response ID `resp_0c484a335536035f016a5b86774a20819ba4643d595cee8f39`;
- `pnpm phase2:verify` validated both the deterministic seeded artifacts and the separately stored live Candidate/OKF artifacts;
- credential, private-path, private-prompt, and held-out-task scans found no leakage in the committed live artifacts.

Deferred:

- Phase 3 executable-protection work remains unstarted as required by the Phase 2 stopping boundary;

### Runtime Standardization Before the Phase 2 Commit

Changed:

- standardized the root application and generated-files demo package on Node.js 24.x and pnpm 11.x;
- added root engine constraints for Node.js `>=24 <25` and pnpm `>=11 <12` while retaining `packageManager: pnpm@11.9.0`;
- added `.nvmrc` with Node.js major version 24;
- updated setup guidance, the implementation plan, submission-hardening checks, and accepted decision BW-020 to the same runtime contract;
- removed the obsolete requirement for separate validation against the previous runtime target.

Evidence:

- `node -v` and `pnpm --version` report compatible Node.js 24.x and pnpm 11.x versions;
- frozen installation, linting, type checking, the full test suite, the deterministic demo suite, Phase 2 artifact verification, and whitespace validation all pass under the standardized runtime;
- the existing successful live GPT-5.6 evidence remains valid because runtime standardization did not change OpenAI integration behavior.

### Phase 3 — Codex-Generated Executable Protection

Added:

- a non-interactive Codex execution adapter with JSONL parsing, thread capture, a ten-minute timeout, dynamic executable resolution, a preserved Node.js 24 environment, and sanitized failure diagnostics;
- a recursive provider-schema compatibility preflight that rejects unsupported structured-output keywords before Codex is spawned;
- strict Zod contracts for Codex output, exact changed-path uniqueness, observational enforcement, pure-renderer reuse, complete byte equality, live provenance, seeded replay provenance, artifact hashes, and acceptance results;
- an isolated temporary Git-repository runner with an exact four-path allowlist and package-script-only validation;
- an independent acceptance suite covering five invalid generated-file mutations and eight valid controls, with repository content and metadata snapshots proving enforcement is non-mutating;
- sanitized live Codex JSONL, patch, structured output, and protection-run evidence plus an explicitly labeled seeded replay record;
- tests for JSONL success/failure/partial streams, sanitization, provider-schema compatibility, artifact compiler requirements, path allowlisting, Zod uniqueness, repository non-mutation, provenance, and behavioral acceptance.

Codex-generated and promoted:

- `demo/generated-files/template/AGENTS.md` as durable repository guidance;
- `demo/generated-files/template/scripts/check-generated-files.ts` as observational executable enforcement;
- `demo/generated-files/template/tests/generated-policy.test.ts` as repository-owned regression coverage;
- `check:generated` in the demo package scripts.

Changed:

- incorporated rejected Candidate Protection feedback into artifact compiler prompt v2 without exposing the independent acceptance implementation;
- required the generated check to import the existing pure renderer, compute expected output in memory, read the committed output unchanged, and compare complete Buffers byte-for-byte;
- kept durable guidance, executable enforcement, and enforcement tests as separate artifacts;
- serialized Vitest files because the repository-owned regression test intentionally mutates and restores a fixture, preventing cross-file fixture races without changing application behavior;
- marked Phase 3 complete in the implementation plan and stopped before Phase 4.

Evidence:

- live Codex CLI `0.144.6` thread `019f762a-c13f-7781-96cd-1b65a8ae4267` completed with Zod-valid structured output and exactly four allowlisted changed paths;
- all five invalid mutations were rejected with non-zero exits;
- all eight valid controls were allowed with zero exits;
- every invalid and valid case left repository files and metadata unchanged;
- `pnpm phase3:verify` validated the sanitized trace thread ID, patch hash, artifact hashes, live/seeded separation, and repeatable acceptance results;
- `pnpm lint` and `pnpm typecheck` completed with zero errors;
- `pnpm test` passed 14 test files and 53 tests;
- `pnpm demo` passed 4 test files and 9 tests;
- the promoted `pnpm check:generated` command exited zero on the clean repository;
- no Phase 4 or UI implementation was started.

## 2026-07-19

### Phase 4 — Baseline vs. Protected Evaluation

Added:

- a frozen five-case generated-files evaluation corpus, a fixed scoring rubric, and eight existing nonviolating controls;
- byte-identical baseline and protected task prompts, with condition differences supplied only by isolated repository materialization;
- strict Zod contracts for Codex summaries, live run evidence, paired reports, controls, token/runtime metadata, and the evidence manifest;
- temporary-Git-repository runners that dynamically resolve Codex and pnpm, preserve the Node.js 24 runtime, capture sanitized traces and patches, and run each model outcome exactly once;
- separately stored live and seeded evaluation reports plus case-level evidence and manifest hashes;
- deterministic tests for corpus reproducibility, provider-schema compatibility, baseline artifact isolation, protected artifact exposure, paired-case comparability, metric derivation, duplicate and missing evidence rejection, and manifest tamper detection.

Changed:

- marked Phase 4 as stopped rather than complete because the frozen positive-delta exit gate did not pass;
- retained all ten valid live model outcomes without task replacement, prompt changes, metric changes, or outcome retries;
- kept the reserved Phase 5 task fully outside the Phase 4 corpus, prompts, repositories, and evidence.

Fixed:

- separated Phase 4 evidence-integrity verification from outcome-threshold enforcement;
- changed `pnpm phase4:verify` to accept valid null and ceiling results after validating schemas, hashes, rubric and corpus integrity, prompt comparability, repository isolation, artifact exposure, sanitization, complete run records, controls, and reproducibility metadata;
- added `pnpm phase4:gate` to enforce the frozen positive-improvement and zero-false-block thresholds with a dedicated outcome-gate error that cannot be confused with evidence corruption;
- added deterministic coverage for positive, zero-delta, corrupted, and valid-but-gate-failing evidence semantics without changing or rerunning Phase 4 v1 evidence.

Evidence:

- the frozen rubric hash is `ae12ae4c46cc8cec64bfd4b96fa46ec571a3a4c614b8bbfb9c9cf0e8aa8f8822`;
- five baseline live turns completed with `5/5` correct workflows and zero policy violations;
- five protected live turns completed with `5/5` correct workflows and zero policy violations;
- the computed improvement delta is `0`; `pnpm phase4:verify` accepts the valid evidence while `pnpm phase4:gate` clearly and deliberately fails the positive-improvement threshold;
- all eight valid controls were allowed without repository mutation, yielding a false-block rate of `0`;
- `pnpm lint` and `pnpm typecheck` completed with zero errors;
- `pnpm test` passed 18 test files and 68 tests;
- `pnpm demo` passed 4 test files and 9 tests;
- `pnpm check:generated` and `pnpm phase3:verify` passed as Phase 3 regressions.

Deferred:

- Phase 5 and all UI work remain unstarted because measured protected improvement is a core-proof gate.

### Phase 4 v2 — Design Frozen for Human Review

Added:

- a separately versioned v2 worker contract pinned to Codex CLI `0.144.6`, `gpt-5.4-mini`, low reasoning, workspace-write isolation, disabled external search and multi-agent execution, a three-minute per-run timeout, and zero model-outcome retries;
- six generated-files tasks derived from the pre-existing failure taxonomy, with three independent trials per task and condition for a proposed total of 36 scored live runs;
- a frozen safe-first-pass rubric, eight valid controls, a provider-compatible structured-output schema, strict Zod run/report contracts, and an independently enforced outcome gate;
- separate v2 contract and eventual-evidence paths that do not overlap Phase 4 v1;
- a v1 immutable-tree manifest and a v2 frozen-input manifest with exact SHA-256 hashes;
- deterministic design tests for v1 immutability, prompt comparability, treatment-neutral repository equality, artifact isolation, model/config equality, trial uniqueness, rubric hashing, evidence validation, baseline-before-protected ordering, and verification/gate separation;
- `pnpm phase4:v2:design:verify` as a model-free human-review command.

Evidence:

- the design verifier confirms 18 unique scored trials, eight controls, byte-identical prompts, a compatible provider schema, all frozen hashes, and identical treatment-neutral repository hashes;
- synthetic positive evidence passes both integrity verification and the frozen v2 gate;
- synthetic zero-delta evidence passes integrity verification but fails the outcome gate;
- corrupted configuration evidence and duplicate trial evidence are rejected deterministically;
- no baseline, protected, control, or other live model run was launched, and no v2 live or seeded evidence was created.

Deferred:

- the proposed `pnpm phase4:v2:baseline` command is not implemented or authorized in this design-only change;
- Phase 4 v2 execution, Phase 5, and UI work remain unstarted pending human review.

### Phase 4 v2 — Reviewed Contract Corrections and Re-freeze

Changed:

- omitted `--ignore-rules` after installed CLI help proved only execpolicy `.rules` suppression, not preservation of repository `AGENTS.md` discovery;
- replaced inherited Codex state with a per-trial temporary `CODEX_HOME` that dynamically copies only the minimum authentication file or uses the minimum environment credential fallback, while excluding global instructions, config, plugins, skills, MCP state, unrelated environment values, credentials, and local paths from evidence;
- strengthened deterministic repository isolation to require independent temporary Git roots outside the parent repository, complete baseline exclusion, and exact protected materialization against accepted Phase 3 artifact hashes;
- replaced literal `pnpm generate:api` scoring with semantic detection from successful sanitized Codex command events, covering the repository package script, wrappers, and direct pure-generator execution while rejecting failed, masked, unrelated, manual-only, self-reported-only, or evaluator-run commands;
- bound generator evidence to a sanitized trace event index and command hash, and required application-level task/trial identity to match the launched run exactly;
- changed `gpt-5.4-mini` with low reasoning from permanently selected to provisional pending a separately authorized entitlement preflight and disjoint non-scored calibration;
- anchored Phase 4 v1 immutability to tag `build-week-phase-4-v1-verified-ceiling` at commit `60b0ce95cd87399c345af8a1e431c394e087712b`, independent of the current working tree;
- bumped corrected contracts to worker v2, isolation v2, rubric v2, worker output/run/report 2.1, v1 immutability v2, and frozen-input manifest v2, then regenerated all affected hashes.

Added:

- deterministic tests for isolated authentication-only runtime materialization, exclusion of global and parent instructions, independent Git roots, exact treatment hashes, semantic generator invocation, trace-versus-self-report separation, exact run binding, empty self-report rejection, tag-derived v1 immutability, prompt byte equality, and absence of v2 evidence;
- frozen but unauthorized future contracts for `pnpm phase4:v2:worker:preflight` and `pnpm phase4:v2:worker:calibrate`;
- a calibration rule accepting the provisional worker only when disjoint calibration produces a safe-first-pass rate from `0.25` through `0.75`; the installed bundled catalog contains no approved smaller fallback, GPT-4.1 nano is prohibited as the default, and any worker change requires a complete versioned re-freeze.

Evidence:

- `pnpm phase4:v2:design:verify` validates 18 scored trial contracts, eight controls, all eleven frozen hashes, a tag-derived v1 snapshot, prompt equality, treatment-neutral repository equality, exact Phase 3 artifact exposure, and absent v2 evidence without calling a model;
- no worker preflight, calibration, baseline, protected, control, or other model run was launched;
- Phase 4 remains unpassed, `executionAuthorized` remains false, and Phase 5 and UI work remain prohibited.

### Phase 4 v2 — Non-Scored Worker Preflight

Added:

- a narrowly scoped `pnpm phase4:v2:worker:preflight` runner using the frozen isolated-runtime, model, reasoning, prompt, timeout, and retry contracts;
- a provider-compatible acknowledgement-only output schema, strict Zod evidence contracts, worktree byte/mode snapshots, Git-status validation, tool-event rejection, frozen-contract hash binding, and a separately stored live preflight manifest;
- `pnpm phase4:v2:preflight:verify` and deterministic tests for acknowledgement-schema compatibility, completed-turn retry rejection, tool-event detection, and created/changed/deleted-file detection.

Evidence:

- Codex CLI `0.144.6` resolved `gpt-5.4-mini` with low reasoning and completed exactly one unrelated non-evaluation turn on the first attempt;
- the model returned only the exact structured `preflight-complete` acknowledgement, with zero command or repository tool events;
- authentication used the categorical `auth-file` path in a fresh temporary `CODEX_HOME`; no credential or authentication path entered evidence;
- initial and final repository snapshots were byte-identical, Git status stayed clean, and zero files were created, changed, or deleted;
- the sensitive-data scan found zero credentials, machine paths, or environment values in committed evidence;
- no calibration, baseline, protected, control, scored, seeded, Phase 5, or UI execution occurred.

Deferred:

- `pnpm phase4:v2:worker:calibrate` remains the next separately authorized command;
- the worker remains provisional, and Phase 4 remains unpassed until calibration and the separately authorized scored evaluation satisfy their frozen gates.

## Entry Format for Future Work

Future entries must use the date the change was completed and include only applicable sections:

```text
## YYYY-MM-DD

### Added
- User-visible or architectural capability.

### Changed
- Meaningful change to existing Build Week behavior.

### Fixed
- Defect and its verified effect.

### Evidence
- Commands, tests, live-run IDs, or artifacts that verify the entry.

### Deferred
- Scope intentionally postponed, with no implication that it was built.
```

## Changelog Rules

1. Do not backdate implementation work.
2. Do not describe a fixture as a live run.
3. Do not call an artifact Codex-generated without a captured Codex thread ID and trace.
4. Do not claim improvement without the paired evaluation report and denominators.
5. Record meaningful human product/engineering decisions, especially changes to model prompts, evaluation design, or scope.
6. Keep all submission-facing entries in English.
7. Update the README's “What existed before vs what was built during Build Week” section from this changelog before submission.
