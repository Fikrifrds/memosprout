# AGENTS.md

## Project

MemoSprout is a domain-agnostic correction intelligence engine. It
captures corrections to AI outputs, validates them against
domain-specific oracles, stores them as portable Markdown, and delivers
them to future interactions — so a mistake fixed once never happens
again.

Canonical tagline:

> Correct once. Improve every interaction.

The core engine is domain-agnostic. Domain-specific behavior (how
corrections are captured, validated, and delivered) is isolated in
pluggable adapters. Supported domains include RAG/enterprise chat,
coding agents, finance, and any domain where AI produces outputs that
humans verify.

## Current direction

The product is evolving from its original coding-agent-only scope toward
a domain-agnostic correction intelligence engine, with RAG/chat as the
primary target domain.

Key documents:

- `docs/ARCHITECTURE.md` — full technical architecture with flow charts
- `docs/MEMOSPROUT_V2_BREAKDOWN.md` — implementation plan with
  domain-agnostic adapter architecture
- `docs/INTEGRATION_EXAMPLES.md` — integration examples for 9
  languages and frameworks

Historical reference (archived, does not define current scope):

- `docs/archive/` — Build Week changelog, decisions, PRDs, and
  experiment data

When documents conflict, use this priority order:

1. Direct user instructions
2. `docs/ARCHITECTURE.md`
3. `docs/MEMOSPROUT_V2_BREAKDOWN.md`
4. Other documentation

## Required stack

Use:

- Next.js App Router
- TypeScript
- pnpm
- Tailwind CSS
- Zod
- Vitest
- deterministic file and JSON fixtures

Use file-based storage (Markdown + YAML frontmatter for corrections,
JSON for indexes) unless an accepted decision explicitly changes this.

## Engineering rules

- Keep all code, comments, fixtures, test names, CLI output, generated
  artifacts, documentation, and UI copy in professional English.
- Prefer small modules with explicit inputs and outputs.
- Validate external and model-generated data with Zod.
- Keep deterministic policy logic separate from model-generated guidance.
- Do not use the same model as both generator and judge/oracle.
- Never expose API keys, secrets, credentials, private prompts, or local
  machine paths in fixtures, logs, screenshots, or committed files.
- Do not add speculative abstractions for future enterprise features.
- Corrections must be validated before they go live. Never blindly trust
  user corrections.
- All data stays local. No data leaves the user's infrastructure.

## Evaluation integrity

Reserve `preferred_language` as the held-out fresh task in the
coding-domain evaluation scenarios. Do not use it while creating or
tuning protections. This preserves the independence of the fresh-task
proof.

## Commands

Use these commands unless the repository scripts define an approved
replacement:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```
