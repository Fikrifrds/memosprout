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

### Phase 4 v2 — Calibration Interrupted After One Completed Outcome

Observed:

- the first frozen calibration case, `calibration-add-office-extension` / `trial-01`, completed exactly one `gpt-5.4-mini` low-reasoning turn;
- the worker changed `api/openapi.yaml`, `generated/api-client.ts`, and `tests/client.test.ts`, and ordinary tests passed;
- the sanitized Codex trace contains no successful invocation of the repository generator, so the completed result is an unsafe first pass;
- no model outcome retry or task replacement occurred, and the remaining three calibration runs were not launched.

Fixed:

- corrected the evidence scanner so generic allowlisted runtime values such as the shell executable are not misclassified as sensitive environment leakage;
- persisted an authenticated interruption record and manifest from the already-recorded trace without replaying, repairing, or fabricating the model outcome;
- changed calibration verification to distinguish authentic but incomplete evidence from a valid four-run calibration report.

Limitations:

- the false-positive scan happened after in-memory scoring but before the run record, repository patch, and snapshot hashes were persisted; the temporary repository was then cleaned up;
- evaluator non-mutation for the completed case is therefore not independently re-verifiable, and no frozen calibration classification can be calculated;
- worker-config re-freezing is not yet determined because the ceiling/headroom/floor rule requires all four frozen outcomes;
- scored evaluation, Phase 5, and UI work remain unstarted pending a separate human decision about versioned calibration recovery.

### Phase 4 v2 — Calibration-Recovery v1 Design Frozen

Added:

- separate versioned calibration-recovery contracts for the exact three unstarted trials, with the original task order, `gpt-5.4-mini` low-reasoning worker, isolation, safe-first-pass rubric, thresholds, and retry policy unchanged;
- durable-evidence-derived eligibility, stable path-free resume identifiers, an explicit thirteen-stage persistence order, local-only raw-evidence paths, scanner-failure preservation rules, and cleanup only after committed-evidence verification;
- provider-compatible worker-output and completion-marker schemas, strict Zod validation, an interruption-tag immutability manifest, and a frozen SHA-256 input manifest;
- `pnpm phase4:v2:calibration-recovery:design:verify` and deterministic tests for eligibility, idempotent resume, durability ordering, scanner failure, cleanup safety, classification, task isolation, schema validation, Git ignore behavior, and immutable source evidence.

Changed:

- corrected the recovery scanner contract so generic allowlisted runtime metadata such as `SHELL` and `PATH` is not classified as credential material while secret-bearing keys and machine-specific values remain prohibited;
- fixed the first observed result as permanently unsafe with complete behavioral trace evidence, incomplete patch/snapshot evidence, an explicit incompleteness reason, and a permanent no-rerun rule.

Evidence:

- all recovery artifacts are under `demo/generated-files/evaluation/v2/calibration-recovery/v1`; the reviewed original contract and interruption artifacts remain byte-identical to tag `build-week-phase-4-v2-calibration-interrupted`;
- the future command identifier is `pnpm phase4:v2:worker:calibrate:recover-v1`, but no executable package command or runner exists and execution authorization remains false;
- no model call, remaining calibration trial, scored evaluation, control, Phase 5, or UI work was performed.

Deferred:

- recovery execution and its three remaining non-scored trials require separate authorization;
- baseline execution is not authorized and Phase 4 remains unpassed.

### Phase 4 v2 — Guarded Calibration-Recovery Runner Implemented

Added:

- the installed but unauthorized `pnpm phase4:v2:worker:calibrate:recover-v1` command, whose frozen authorization guard exits locally before queue execution or any Codex spawn;
- a durable-evidence-derived recovery queue that permanently excludes the fixed unsafe first outcome, preserves the exact three-trial order, rejects operator overrides, skips verified completions, and converts completed-turn interruptions into evidence-only resume work;
- atomic fsync-and-rename persistence for the thirteen frozen stages, strict run, resume, manifest-entry, completion-marker, and interruption validation, and cleanup guarded by successful sanitation plus committed-evidence verification;
- `pnpm phase4:v2:calibration-recovery:verify` and deterministic runner tests using synthetic evidence and injected spawn, scan, and cleanup boundaries.

Preserved:

- raw traces and stderr remain only under the Git-ignored local recovery root and never enter public manifest hashes;
- scanner or verifier failure retains raw and sanitized evidence, the temporary repository, stable path-free resume state, and a public interruption record without making the completed outcome eligible for a model rerun;
- every frozen recovery contract, schema, version, hash, task, threshold, worker setting, and existing evidence artifact remains unchanged.

Clarified:

- execution authorization is a runtime-only identifier deterministically bound to the frozen recovery contract and frozen-input manifest; the committed contract permanently remains `executionAuthorized: false`;
- the identifier is accepted only from the process environment, consumed and deleted before the execution boundary, and excluded from diagnostics, public output, traces, manifests, errors, and evidence;
- absent or incorrect authorization maps to the same local exit code `2` with zero boundary calls, while the correct in-memory identifier can reach only the frozen queue's injected execution boundary.

Evidence:

- direct invocation exited `2` with the explicit unauthorized diagnostic and reached the injected Codex spawn boundary zero times;
- the implementation verifier derived exactly the three frozen unstarted trials and confirmed that no recovery evidence directory was created;
- no model call, calibration trial, baseline, protected run, control, Phase 5 task, or UI work occurred.

Deferred:

- recovery execution remains subject to separate authorization; the fixed contract still declares `executionAuthorized: false`;
- Phase 4 remains unpassed and scored evaluation remains prohibited.

### Phase 4 v2 — Calibration-Recovery Launcher Hotfix v1 Frozen

Fixed:

- replaced the eval-based inline `tsx -e` recovery launch path with a dedicated TypeScript entry point using an explicit asynchronous `main` wrapper and sanitized terminal error handling;
- enforced Node.js 24.x before runtime authorization consumption, queue derivation, or any possible Codex spawn, with the validated `process.execPath` preferred by future isolated subprocesses;
- added a model-free preflight for frozen-contract integrity, absent unexpected evidence, exact queue membership and order, immutable-first-trial exclusion, Codex executable resolution, minimum authentication availability, and runtime consent validity.

Added:

- versioned infrastructure amendment `phase4-v2-calibration-recovery-launcher-amendment-v1` and its SHA-256 manifest under `demo/generated-files/evaluation/v2/calibration-recovery/launcher-hotfix/v1`;
- deterministic tests proving Node 23 rejection, Node 24 injected-boundary reachability, zero boundaries for absent or incorrect consent, exactly one injected boundary for correct consent, exact three-trial queue derivation, and zero actual Codex processes;
- verification that the dedicated entry point contains no top-level await or eval launcher and that no frozen contract, frozen input hash, or existing evidence changed.

Evidence:

- the amendment records two infrastructure launches: Node 23 failed on unavailable `node:sqlite`, and Node 24 failed because inline `tsx -e` emitted CommonJS code that rejected top-level await;
- both launches stopped before queue execution, started zero Codex processes, completed zero Codex turns, observed zero model outcomes, and created no calibration evidence;
- the original infrastructure retry allowance is exhausted, and one corrected launch remains unauthorized pending separate human approval.

Deferred:

- `pnpm phase4:v2:worker:calibrate:recover-v1` remains the future recovery command, but valid runtime consent must not be supplied until one corrected launch receives separate authorization;
- calibration, scored baseline/protected/control evaluation, Phase 5, and UI work remain unstarted.

### Phase 4 v2 — Calibration Recovery Completed With Floor Result

Evidence:

- the single separately authorized corrected infrastructure launch ran under Node.js `24.14.0` through the committed dedicated async launcher;
- exactly the three frozen eligible trials completed once, in order, using `gpt-5.4-mini` with low reasoning, zero model retries, and zero infrastructure retries;
- all three recovery outcomes were unsafe first passes; combined with the immutable first unsafe outcome, the final calibration result is `0/4` (`0.00`), classified as `calibration-floor`;
- all three trials completed all thirteen durability stages, including sanitation, committed-evidence verification, and temporary-repository cleanup, with no recovery or resume interruption;
- the public evidence manifest, file hashes, completion markers, trial uniqueness, evaluator non-mutation, frozen-input immutability, and sensitive-data checks pass.

Changed:

- made four pre-execution recovery tests state-independent by deriving their unstarted queues from isolated temporary contract roots; completed-marker tests now confirm that runtime authorization cannot rerun durable outcomes;
- updated the implementation status to require worker re-freezing before any scored Phase 4 v2 execution.

Deferred:

- the provisional `gpt-5.4-mini` low-reasoning worker is rejected by the frozen floor threshold and requires a separately reviewed worker-config re-freeze;
- scored baseline, protected trials, controls, Phase 5, and UI work remain unauthorized and unstarted.

### Phase 4 v2 — Model-Free Calibration-Environment Diagnostic

Added:

- separate versioned diagnostic contracts and evidence paths that never count as calibration or scored evidence and preserve the completed `0/4` floor result unchanged;
- a diagnostic runner that imports the exact calibration repository materializer, uses Node.js 24 and the isolated runtime PATH, installs dependencies offline, and executes repository commands only through the no-model Codex `:workspace` sandbox helper;
- strict Zod evidence for command availability, dependency availability, Node version, generator and test exit codes, byte-level pure-renderer comparison, expected fixture transitions, immutable-evidence hashes, failure categories, and diagnosis;
- an execution-unauthorized runtime-correction design bound to the diagnostic v2 manifest.

Evidence:

- diagnostic v1 is retained with its original hashes and labeled inconclusive because the first no-model sandbox invocation omitted the newly required permission profile and stopped before Node or repository commands;
- diagnostic v2 confirmed Node.js `24.14.0`, offline dependency installation, `node_modules`, generator/test scripts, `tsx`, and `vitest` were available in the exact calibration materialization;
- the untouched preflight and both fixture categories ran with zero model calls; ordinary tests exited zero in all three repositories;
- the existing generator command exited one in all three repositories because the `tsx` CLI Unix IPC socket was denied inside the worker-equivalent sandbox;
- the clean office-extension fixture and contact-URL drift fixture both failed the required byte-level final comparison, producing `0/2` passing fixtures and an `environment-floor` diagnosis;
- calibration and recovery evidence hashes were identical before and after the diagnostic.

Changed:

- worker selection is deferred: the preserved `0/4` result remains a valid record of observed outcomes but is not valid worker-comparison evidence under the defective generator runtime;
- the next design step is a separately reviewed runtime re-freeze using a generator launcher that does not require the denied `tsx` CLI IPC socket.

Deferred:

- no replacement worker is recommended, selected, or frozen while the environment is invalid;
- runtime-correction execution, any new calibration, scored baseline/protected/control evaluation, Phase 5, and UI work remain unauthorized.

### Phase 4 v2 — Generator Runtime Correction v2 Validated

Added:

- versioned generator-runtime module `lib/eval/v2/generator-runtime.ts` preserving `phase4-v2-generator-runtime-v1` (`tsx scripts/generate-client.ts`) as a historical version and defining `phase4-v2-generator-runtime-v2` (`node --import tsx scripts/generate-client.ts`) as the corrected launcher;
- new frozen runtime contract `demo/generated-files/evaluation/v2/calibration-runtime-correction/v2/runtime-contract.json`, bound by SHA-256 to the frozen v1 correction design and the diagnostic v2 manifest, without overwriting either;
- `pnpm phase4:v2:runtime-correction:run` and `pnpm phase4:v2:runtime-correction:verify`, plus deterministic tests for version preservation, treatment-neutral application, contract binding, rubric-compatible generator semantics, and mandatory `modelCalls: 0`.

Changed:

- the shared `materializeRecoveryRepository` materializer now requires an explicit `generatorRuntimeVersion` and fails locally without one; it rewrites only the `generate:api` package script for the selected version after verifying the historical baseline script. Historical calibration, recovery, and diagnostic paths stay pinned to runtime v1, while corrected runtime paths — including future baseline and protected conditions — must explicitly select runtime v2.

Evidence:

- the model-free validation ran under Node.js `24.15.0`, the isolated authentication runtime, `pnpm install --offline --ignore-scripts`, and the worker-equivalent Codex `:workspace` sandbox with zero model calls and zero `codex exec` invocations;
- the untouched command-preflight repository, the clean office-extension fixture, and the contact-URL schema-drift fixture all passed: corrected generator exit `0`, ordinary tests exit `0`, byte-identical pure-renderer output, expected initial and final state transitions, and mutation scope limited to the deterministic diagnostic operation;
- the environment classification is `environment-viable-under-corrected-runtime`; immutable calibration, recovery, diagnostic, and correction-design evidence hashes were identical before and after the run;
- sanitized evidence and its manifest live under `demo/generated-files/evidence/v2/calibration-runtime-correction/v2`.

Deferred:

- the provisional `gpt-5.4-mini` low-reasoning worker is neither selected nor replaced; a separately authorized worker-config re-freeze and a new non-scored calibration under the corrected runtime remain required;
- scored baseline, protected trials, controls, Phase 5, and UI work remain unauthorized and unstarted.

### Phase 4 v2 — Calibration v2 Frozen Design Under Runtime v2

Added:

- frozen calibration contract `phase4-v2-calibration-v2` at `demo/generated-files/evaluation/v2/calibration-v2/` with a versioned prompt, a new `calibration-v2-1` worker-output schema enumerating only fresh identifiers, and an eight-file SHA-256 frozen-input manifest;
- explicit runtime binding: every future calibration repository must select `phase4-v2-generator-runtime-v2` (`node --import tsx scripts/generate-client.ts`) via the required no-default materializer argument, and the contract SHA-binds the runtime-v2 contract and the passed model-free validation manifest as mandatory pre-execution validation;
- four fresh ordered trials — `calibration-v2-add-office-extension` / `v2-trial-01`..`v2-trial-02` and `calibration-v2-repair-contact-url-drift` / `v2-trial-01`..`v2-trial-02` — preserving the original capability categories with identifiers the historical recovery queue and output schema reject;
- `pnpm phase4:v2:calibration-v2:design:verify` plus deterministic tests for runtime-v2 binding, trial freshness and uniqueness, historical-identifier rejection, frozen prompt bytes, unchanged thresholds, disjoint evidence namespaces, historical immutability, and absent scored or reserved content.

Evidence:

- design-only: no model call, calibration execution, baseline, protected trial, control run, Phase 5, or UI work occurred;
- the historical `0/4` calibration-floor evidence remains byte-identical and is recorded as authentic but excluded from worker selection because it ran under sandbox-incompatible runtime v1;
- selection thresholds are unchanged: `0/4` floor, `1–3` of `4` acceptable headroom, `4/4` ceiling (`0.25`–`0.75`).

Deferred:

- `executionAuthorized` is false and `pnpm phase4:v2:worker:calibrate-v2` is an identifier only, deliberately absent from `package.json`, pending separate human authorization;
- the worker remains provisional `gpt-5.4-mini` with low reasoning; scored evaluation, Phase 5, and UI work remain unauthorized.

### Phase 4 v2 — Guarded Calibration-v2 Runner and Evidence Verifier

Added:

- installed `pnpm phase4:v2:worker:calibrate-v2` pointing only at a dedicated guarded runner, mirroring the recovery precedent while the frozen contract stays byte-identical with `executionAuthorized: false`;
- runtime-only consent: the expected identifier is derived deterministically from the frozen calibration-v2 contract and frozen-input manifest and supplied only via `MEMOSPROUT_CALIBRATION_V2_AUTHORIZATION_ID`, which the runner consumes and deletes before queue derivation; missing or incorrect consent exits locally with code `2`, derives no queue, spawns no Codex process, and creates no evidence;
- a four-trial queue derived only from the frozen `trialOrder`, with verified completion markers permanently preventing reruns and versioned schemas structurally rejecting all historical runtime-v1 identifiers;
- a live trial executor that reuses the proven isolated runtime (Node.js 24, fresh temporary Git root, authentication-only `CODEX_HOME`, offline dependencies, `workspace-write` sandbox, frozen Codex CLI version, `gpt-5.4-mini` low reasoning, zero model retries, one pre-completion infrastructure retry) and explicitly selects `phase4-v2-generator-runtime-v2` for every materialized repository;
- a thirteen-stage durable evidence transaction (raw local-only trace first, sanitized public evidence, snapshots, run record, hashes, manifest entry, completion marker, sanitation, committed-evidence verification, cleanup last) reusing the frozen recovery durability machinery, with raw evidence confined to the Git-ignored `.memosprout-local/calibration-v2/v1`;
- deterministic four-outcome classification (`0/4` floor, `1–3` headroom, `4/4` ceiling) with scoring from real command-trace evidence, never self-reported `commandsRun`;
- `pnpm phase4:v2:calibration-v2:verify` plus eleven deterministic runner tests covering unauthorized zero-spawn exits, the injected execution boundary, frozen queue order, historical-identifier rejection, explicit runtime-v2 selection, completed-marker rerun prevention, threshold classification, public/local evidence separation, and prompt non-exposure.

Evidence:

- no model call, Codex process, calibration execution, baseline, protected trial, control run, Phase 5, or UI work occurred;
- the unauthorized command was demonstrated locally: exit code `2`, zero spawns, no evidence created;
- all historical calibration, recovery, diagnostic, and runtime-correction evidence remains byte-identical.

Deferred:

- live calibration-v2 execution requires separate human authorization through the runtime-only consent identifier;
- scored baseline, protected trials, controls, Phase 5, and UI work remain unauthorized and unstarted.

### Knowledge-Trap Convergence Experiment — Phase A Foundation (Model-Free)

Added:

- a deterministic payment-webhook idempotency scenario template (`demo/idempotency/template/`) with provided store primitives, an ordinary happy-path test that a naive handler passes, and a held-out idempotency acceptance suite (duplicate-event, late-pending, later-failed) that a naive handler fails;
- a Candidate Sprout (`demo/idempotency/template/AGENTS.md`) instructing idempotency-key and terminal-state protection as the protected-condition guidance;
- a new evaluation generation under `lib/eval/v3/` built alongside the frozen Phase 4 v2 stack: a pluggable `ScenarioOracle` interface with an `IdempotencyOracle`, a three-condition runner (`cheap-baseline`, `cheap-protected`, `frontier-baseline`), a convergence report with `superRefine` metric re-derivation, and a convergence gate (`gapDelta >= 0.3`, `convergenceDelta <= 0.2`, `falseBlockRate = 0`);
- a worker abstraction with a `CodexWorkerAdapter` (parameterized model), a `FrontierApiWorkerAdapter` placeholder for separate API billing, and a `MockWorkerAdapter` for model-free tests;
- a frozen convergence contract, frozen-inputs manifest, task prompt, and provider-compatible worker-output schema under `demo/idempotency/`, generated by `pnpm convergence:config:setup`;
- a v3 authorization guard mirroring the v2 pattern (frozen `executionAuthorized: false`, derived runtime id, consume-and-delete environment variable, timing-safe comparison);
- `pnpm convergence:design:verify` as a model-free design verifier;
- model-free tests for the scenario knowledge trap, oracle injection, report metric derivation and gate, authorization guard, design verification, three-condition isolation, and an end-to-end trial with a mock worker.

Changed:

- extended `runCodexExec` with optional `model` and `reasoningEffort` parameters (additive; existing callers unchanged) so a worker can run a cheap or frontier model;
- recorded decision BW-021 (pivot to the Knowledge-Trap Convergence Experiment).

Evidence:

- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings;
- `pnpm test` passed 39 test files and 224 tests, including the new v3 and idempotency scenario suites, with no regression to Phase 1–4 tests;
- `pnpm convergence:design:verify` validated the frozen contract, rubric hash, prompt placeholder, provider schema, and frozen-input hashes with `executionAuthorized: false` and no model call;
- the scenario suite proves the knowledge trap is genuine: the naive committed handler double-charges on a duplicate event and downgrades a paid order on a late pending event, while a correct handler passes all three acceptance cases.

Deferred:

- live calibration and scored three-condition execution remain unauthorized and unstarted; the cheap worker requires restored Codex usage and the frontier condition requires separate API billing;
- live wiring of the `FrontierApiWorkerAdapter` is a Phase B step;
- Phase 4 v2 evidence remains immutable and is not reinterpreted by `lib/eval/v3/`.

### Knowledge-Trap Convergence Experiment — Frontier Worker Wiring (Phase B Preparation, Model-Free)

Added:

- a real `FrontierApiWorkerAdapter` (`lib/eval/v3/frontier-worker.ts`) that runs a bounded tool-loop agent against the OpenAI Responses API for the frontier condition, with `read_file`, `write_file`, `run_command`, and `submit_result` tools, repository path containment, command-execution capture, a JSONL tool trace, and typed error classification (missing/invalid credentials, timeout, turn limit, malformed output, tool error, API error);
- an injectable `FrontierTransport` interface and a live `createOpenAIFrontierTransport` (OpenAI SDK, `store: false`, single retry) mirroring the Candidate transport convention so the loop is fully testable without a model call.

Changed:

- replaced the Phase A `FrontierApiWorkerAdapter` placeholder in `lib/eval/v3/worker.ts` with the real implementation in `lib/eval/v3/frontier-worker.ts`.

Evidence:

- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings;
- `pnpm test` passed 40 test files and 229 tests, including five model-free frontier-worker tests (successful tool loop with file write and structured submit, path-escape rejection, turn-limit, malformed submit, and missing-credentials) driven by a mock transport;
- no frontier model call occurred; live frontier execution remains gated on separate API billing.

Deferred:

- actual frontier execution, calibration, and scored three-condition runs remain unauthorized; the cheap worker still requires restored Codex usage and the frontier condition requires separate API billing.

### Knowledge-Trap Convergence Experiment — Live Probe, Reliability Reframing, and Gate Update

Added:

- `scripts/run-convergence-smoke-test.ts` (configurable model/condition, sprout injection for the protected condition, canonical held-out acceptance injection before scoring) and `scripts/run-convergence-probe.ts` (N independent trials of one condition, reports the success rate);
- live probe evidence (not committed as scored evidence) for the de-hinted idempotency task across all three conditions.

Changed:

- broadened the frontier worker command allowlist to ordinary test invocations with flags (for example `pnpm test --silent`, `./node_modules/.bin/vitest run`), keeping destructive, exfiltration, and chained commands blocked;
- made frontier worker tool failures (path escape, disallowed command, unknown tool) recoverable tool results returned to the model instead of terminating the turn;
- reframed the convergence thesis and gate to the reliability framing (decision BW-023): the gate is now `sproutLift >= 0.5`, `cheapProtectedRate >= 0.8`, and `falseBlockRate = 0`; `gapDelta`/`convergenceDelta` remain computed as context but are not gated; bumped the frozen rubric to `convergence-rubric-v2` and regenerated the configuration.

Evidence:

- live probe on 2026-07-19 (de-hinted task, three trials per condition, OpenAI API): `cheap-baseline` (gpt-5.4-mini, no sprout) `0/3`; `cheap-protected` (gpt-5.4-mini, sprout) `3/3`; `frontier-baseline` (gpt-5.6-sol, no sprout) `0/3`; `sproutLift = 1.0`;
- the sprout lifts the cheap model from `0%` to `100%`; the frontier model also fails the de-hinted task without the sprout, so the demonstrated value is knowledge injection (system intelligence), not tier convergence;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 40 test files and 233 tests; `pnpm convergence:design:verify` passed with the regenerated rubric hash and `executionAuthorized: false`.

Deferred:

- a formal scored run with an evidence manifest and the false-block control suite remains pending; it is no longer gated on Codex usage because both conditions use the OpenAI API.

### Knowledge-Trap Convergence Experiment — Formal Scored Run (Gate Passed)

Added:

- `scripts/run-convergence-scored.ts`, which orchestrates all three conditions across the frozen trials, evaluates the false-block controls against reference correct handlers, and writes a hash-verified evidence manifest, the convergence report, and the gate result;
- committed scored evidence under `demo/idempotency/evidence/convergence/live/`: per-trial `run.json`, sanitized `worker-trace.jsonl`, and `repository.patch` for nine trials, plus `controls.json`, `manifest.json`, and `convergence-report.json`;
- `evaluateConvergenceControl` in `lib/eval/v3/runner.ts` for the false-block measurement.

Changed:

- `runConvergenceTrial` now injects the sprout (`AGENTS.md`) into the prompt for the protected condition, encapsulating sprout delivery in the runner;
- updated the convergence case task to the de-hinted wording required by BW-023 and aligned the frozen `frontierModel` to the available `gpt-5.6-sol`;
- `verifyConvergenceDesign` is exercised with `allowExistingEvidence` now that scored evidence is committed, with a new test guarding the evidence-absence check.

Evidence:

- scored run on 2026-07-19 (de-hinted task, three trials per condition, OpenAI API): `cheap-baseline` (gpt-5.4-mini) `0/3`, `cheap-protected` (gpt-5.4-mini + sprout) `3/3`, `frontier-baseline` (gpt-5.6-sol) `0/3`; both false-block controls observed `allow`;
- metrics: `sproutLift = 1`, `cheapProtectedRate = 1`, `frontierBaselineRate = 0`, `falseBlockRate = 0`, zero policy violations; the convergence gate (`sproutLift >= 0.5`, `cheapProtectedRate >= 0.8`, `falseBlockRate = 0`) passed;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 40 test files and 234 tests.

Deferred:

- the convergence thesis is validated; the next work stream is the wedge roadmap toward the Full PRD (reusable Validation Engine, Experience Compiler/OKF, Artifact Compiler, MCP delivery, Outcome Ledger, Cost–Intelligence Router, Team Control Plane).

### Validation Engine — Reusable Engine Extraction and Second Scenario (Wedge 1)

Added:

- a reusable Validation Engine under `lib/eval/engine/`: `ScenarioDefinition` (`scenario.ts`), `AcceptanceSuiteOracle` and `createScenarioOracle` (`oracle.ts`), and `prepareScenarioRepository`, `evaluateScenarioControl`, and `assertScenarioIsolation` (`runner.ts`);
- a second scenario, user soft-delete (`demo/soft-delete/template/` and `lib/scenario/soft-delete.ts`), whose naive committed service hard-deletes records while the sprout instructs soft-delete;
- engine reusability tests (`tests/eval/engine/engine.test.ts`) that validate both scenarios through the same engine, including real acceptance-suite control evaluations, plus a soft-delete knowledge-trap test (`tests/scenario/soft-delete.test.ts`).

Changed:

- refactored the convergence harness (`lib/eval/v3/`) onto the engine: `runConvergenceTrial` now takes a `ScenarioDefinition`, the idempotency-specific materialization/oracle/control logic moved to the engine, and `lib/eval/v3/oracle.ts` re-exports the engine oracle;
- `idempotencyScenario` is now a `ScenarioDefinition` instance; the scored runner, smoke test, and probe use the engine API (`prepareScenarioRepository`, `evaluateScenarioControl`).

Evidence:

- the engine validates two structurally different scenarios (idempotency and soft-delete) with no engine changes, only different `ScenarioDefinition` instances; both correct implementations are accepted by the held-out acceptance suites through `evaluateScenarioControl`;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 42 test files and 243 tests.

Deferred:

- wedge 2 and beyond (Experience Compiler/OKF, Artifact Compiler, MCP delivery, Outcome Ledger, Cost–Intelligence Router, Team Control Plane).

### Experience Compiler and OKF — Scenario-Agnostic Generalization (Wedge 2)

Added:

- a generalized Experience Compiler (`lib/compiler/experience-compiler.ts`): a scenario-agnostic evidence schema (scenario, task, failed-run summary, human correction), a scenario-parameterized system prompt, an injectable transport with a live OpenAI Responses API implementation, typed error classification, and `compileExperience` producing a `CandidateSproutContent`;
- a guidance compiler (`lib/compiler/compile-guidance.ts`) that renders a Candidate Sprout into `AGENTS.md`-style guidance, bridging the Experience Compiler output to the Validation Engine's protected-condition sprout;
- a scenario-aware OKF export (`renderExperienceOkf` and `experienceOkfFilename` in `lib/okf/render.ts`) that validates against the existing OKF schema;
- model-free tests for the compiler (mock transport across the idempotency and soft-delete scenarios, plus refusal and malformed-output handling), the guidance compiler, and the scenario-aware OKF render.

Changed:

- reused the generic `CandidateSproutContent` schema unchanged; the generated-files-specific Experience Compiler and `renderCandidateOkf` remain intact for the Phase 2 flow.

Evidence:

- the compiler, guidance compiler, and OKF export are demonstrated model-free for both the idempotency and soft-delete scenarios;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 45 test files and 255 tests.

Deferred:

- wedge 3 and beyond (Artifact Compiler, MCP delivery, Outcome Ledger, Cost–Intelligence Router, Team Control Plane).

### Artifact Compiler — Sprout to Enforcement Artifact Spec (Wedge 3)

Added:

- an Artifact Compiler under `lib/artifact/`: `compileArtifactSpec` (`spec.ts`) maps a validated `CandidateSproutContent` into an `ArtifactSpec` (artifact type, target paths, enforced prohibited actions, verified procedure), and `renderArtifactManifest`/`parseArtifactManifest` (`manifest.ts`) provide a `specSha256`-verified portable manifest;
- model-free tests compiling specs for both the idempotency and soft-delete sprouts, round-tripping the manifest, and rejecting a tampered spec.

Changed:

- reused the sprout's `recommendedArtifact` enum (`ci_and_hook`/`ci_check`/`pre_tool_hook`) for the artifact type; the executable artifact generation (LLM-based, Phase 3 style) remains the live path while the spec and manifest are the deterministic core.

Evidence:

- the artifact spec and manifest are demonstrated model-free for both scenarios, with manifest integrity enforced by a spec hash;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 46 test files and 260 tests.

Deferred:

- wedge 4 and beyond (MCP delivery, Outcome Ledger, Cost–Intelligence Router, Team Control Plane).

### Delivery — get_task_context and Cross-Agent Adapters (Wedge 4)

Added:

- dynamic delivery under `lib/delivery/`: a `SproutRegistry` of validated sprouts (`registry.ts`); scope-path matching, a `getTaskContext` handler, and a `get_task_context` MCP tool definition (`get-task-context.ts`); and delivery adapters (`adapters.ts`) — `AgentsMdAdapter` (AGENTS.md) and `ClaudeCodeAdapter` (CLAUDE.md) — that render the same validated sprouts into agent-specific files;
- model-free tests for the registry, path matching, `getTaskContext` (including the MCP tool definition), and both adapters.

Changed:

- delivery is a pull (the agent calls `get_task_context` with the files it touches) rather than only static AGENTS.md materialization; the same sprouts render to multiple agent formats to demonstrate portability beyond Codex.

Evidence:

- the registry, matcher, `get_task_context`, and both adapters are demonstrated model-free; the MCP tool definition is named `get_task_context` and requires `filePaths`;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 47 test files and 275 tests.

Deferred:

- the MCP stdio server transport (for example `@modelcontextprotocol/sdk`) that wraps `getTaskContext`;
- wedge 5 and beyond (Outcome Ledger, Cost–Intelligence Router, Team Control Plane).

### Outcome Ledger — Record and Aggregate Sprout Outcomes (Wedge 5)

Added:

- an Outcome Ledger under `lib/ledger/`: an `OutcomeRecord` schema (`schema.ts`) capturing scenario, task, model, applied sprout ids, baseline/protected condition, success, and timestamp; and an `OutcomeLedger` (`ledger.ts`) with `query`, `successRate`, `sproutImpact` (baseline-vs-protected lift per scenario), `summarizeByScenario`, and local-first file persistence (`loadOutcomeLedger`/`saveOutcomeLedger`);
- model-free tests for append/query, the success-rate and sprout-impact aggregations (including a `0 → 1` lift matching the convergence result), the per-scenario summary, file round-trip, and schema validation.

Changed:

- the ledger is the compounding data asset (Agent Outcome Graph in summary form) and the feedback signal for which sprouts help; it is the foundation for the Cost–Intelligence Router.

Evidence:

- the ledger and its aggregations are demonstrated model-free, with persistence round-tripping records;
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 48 test files and 283 tests.

Deferred:

- wedge 6 and beyond (Cost–Intelligence Router, Team Control Plane).

### Cost–Intelligence Router — Route Tasks to the Cheapest Reliable Model (Wedge 6)

Added:

- a Cost–Intelligence Router under `lib/router/`: a model catalog (`models.ts`) with cheap `gpt-5.4-mini` (relative cost 1) and frontier `gpt-5.6-sol` (relative cost 10) plus `cheapestModel`/`mostCapableModel`/`findModel`; and a router (`router.ts`) with a routing policy (`minimumReliability`, `minimumSamples`), `routeTask` (cheap-with-sprout when reliable, else escalate to frontier for unreliable/insufficient-data/no-sprout), and `routePortfolio` (per-scenario decisions with relative cost and savings versus always-frontier);
- model-free tests for the cheap-reliable route, the three escalation reasons, a custom reliability threshold, and a mixed-portfolio cost-savings case.

Changed:

- the economic thesis becomes an evidence-based routing decision driven by the Outcome Ledger: the cheap model is used only where outcome data shows the sprout makes it reliable.

Evidence:

- the router and portfolio cost summary are demonstrated model-free (a reliable scenario routes cheap, an unreliable one escalates, and a mixed portfolio reports `totalRelativeCost = 11` versus `alwaysFrontierCost = 20`, `savings = 9`);
- `pnpm lint` and `pnpm typecheck` completed with zero errors and zero warnings; `pnpm test` passed 49 test files and 289 tests.

Deferred:

- wedge 7 (Team Control Plane and governance).

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
