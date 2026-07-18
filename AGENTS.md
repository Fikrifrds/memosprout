# AGENTS.md

## Project

MemoSprout is an agent-learning developer tool that turns agent outcomes
and human corrections into verified, portable knowledge that improves
future AI-agent runs.

Canonical Build Week tagline:

> Correct once. Improve every agent.

## Current implementation scope

The OpenAI Build Week implementation is the only active engineering scope.

Read and follow:

- `docs/prd/BUILD_WEEK_PRD.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DECISIONS.md`
- `docs/BUILD_WEEK_CHANGELOG.md`

The following documents contain long-term product context only and must
not expand the current implementation scope:

- `docs/prd/FULL_PRD.md`
- `docs/strategy/Intelligence_Amplification_and_Operational_Distillation_PRD.md`

When documents conflict, use this priority order:

1. Direct user instructions
2. `docs/DECISIONS.md`
3. `docs/prd/BUILD_WEEK_PRD.md`
4. `docs/IMPLEMENTATION_PLAN.md`
5. Other documentation

## Build Week vertical slice

Implement only this flow:

1. Load a failed agent-run fixture.
2. Load the corresponding human correction.
3. Generate a Candidate Sprout with GPT-5.6.
4. Export the Candidate Sprout as OKF-compatible Markdown.
5. Materialize an executable generated-files protection.
6. Compare baseline and protected evaluations.
7. Demonstrate improvement on a held-out fresh task.

The only scenario is:

> Generated files must not be edited directly. Modify the source schema
> and run the generator instead.

Reserve `preferred_language` as the held-out fresh task. Do not use it
while creating or tuning the initial protection.

## Required stack

Use:

- Next.js App Router
- TypeScript
- pnpm
- Tailwind CSS
- Zod
- Vitest
- deterministic file and JSON fixtures

Do not add during Build Week:

- FastAPI
- Redis
- queues
- authentication
- billing
- GitHub App
- MCP
- Claude Code adapter
- OpenCode adapter
- enterprise infrastructure
- distributed services
- unnecessary databases

Use file-based storage for the demo unless an accepted decision explicitly
changes this.

## Implementation order

The deterministic core proof is a hard gate before UI work.

Follow the phases and exit gates in `docs/IMPLEMENTATION_PLAN.md`.

Do not begin a later phase until:

- the current phase exit gate passes;
- linting passes;
- type checking passes;
- tests pass;
- the implementation plan and changelog are updated.

Do not silently change an accepted decision. Record a genuinely necessary
new decision in `docs/DECISIONS.md`.

## Engineering rules

- Keep all code, comments, fixtures, test names, CLI output, generated
  artifacts, documentation, and UI copy in professional English.
- Prefer small modules with explicit inputs and outputs.
- Validate external and model-generated data with Zod.
- Keep deterministic policy logic separate from model-generated guidance.
- Do not use GPT output as the evidence oracle that proves the same GPT
  output is correct.
- Preserve reproducibility for the judge demo.
- Seeded judge mode must work without live model or Codex execution.
- Live GPT-5.6 and Codex runs should be captured separately as evidence.
- Never expose API keys, secrets, credentials, private prompts, or local
  machine paths in fixtures, logs, screenshots, or committed files.
- Do not add speculative abstractions for future enterprise features.

## Commands

Use these commands unless the repository scripts define an approved
replacement:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm demo
```
