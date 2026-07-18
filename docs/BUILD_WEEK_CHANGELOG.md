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
