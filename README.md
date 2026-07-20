# MemoSprout

**Correct once. Improve every agent.**

MemoSprout is the continuous learning and improvement layer for AI agents. It turns agent
outcomes and human corrections into **verified, portable knowledge** — so a fix made once
improves every future run, across models and tools.

Memory stores a note. MemoSprout attaches evidence, validates it with an independent oracle,
and delivers it to any agent exactly when it is needed.

## Prerequisites

- Node.js 24.x
- pnpm 11.x

```bash
nvm use
pnpm install --frozen-lockfile
```

## Quick start

```bash
pnpm dev
```

Open `http://localhost:3000`:

- **Home** — what MemoSprout is and how it works.
- **Demo** — a four-step walkthrough of the full loop (failed run → Candidate Sprout →
  evaluation → improved fresh run). Runs on seeded evidence by default; the live extractor
  on the Candidate step uses GPT-5.6 and needs `OPENAI_API_KEY`.
- **Dashboard** — scenarios, validated sprouts, measured outcomes, and cost-intelligence routing.
- **Docs** — this guide, in the app.

## MCP server

MemoSprout serves validated knowledge to any agent over the Model Context Protocol:

```bash
pnpm mcp:serve
```

It exposes two tools:

- `get_task_context` — returns the validated guidance relevant to the files a task touches
  (`filePaths`) and/or context attributes (`context`), such as ticket type or domain.
- `check_tool_call` — the reflex gate: returns allow / block / warn for a planned edit, so an
  agent cannot tamper with guarded files.

Connect it from any MCP-capable client. For Claude Code, point an MCP server entry at
`pnpm mcp:serve`. The server loads its sprouts from a file-backed store
(`.memosprout-local/sprout-store.json` by default; override with `MEMOSPROUT_SPROUT_STORE`),
seeding the demo sprouts on first run.

## How it works

1. **Capture** — a failed agent run and the human correction are recorded as evidence.
2. **Compile** — the Experience Compiler distills the correction into a narrow Candidate Sprout
   (trigger, procedure, prohibited actions, scope), exportable as Open Knowledge Format.
3. **Validate** — the Validation Engine tests the sprout against a held-out oracle, comparing
   runs with and without it before anything is trusted.
4. **Deliver** — validated sprouts are served to any agent through MCP and rendered to
   `AGENTS.md` or `CLAUDE.md`.

## Core concepts

- **Sprout** — a narrow, validated unit of knowledge.
- **Scenario** — a deterministic task with a held-out oracle. Four coding scenarios ship today:
  idempotency, soft-delete, tenant-isolation, and secret-handling.
- **Oracle** — the independent judge of correctness (an acceptance test suite for code; a
  structured-check or rubric-judge oracle for other domains).
- **Outcome Ledger** — records outcomes per scenario and measures the lift a sprout provides.
- **Cost–Intelligence Router** — routes a task to the cheapest model that stays reliable.

## Commands

```bash
pnpm dev                       # UI: landing, demo, dashboard, docs
pnpm mcp:serve                 # MCP stdio server
pnpm test                      # full test suite
pnpm lint                      # ESLint
pnpm typecheck                 # TypeScript
pnpm build                     # production build
pnpm convergence:design:verify # verify the convergence experiment design
```

## Architecture

- `lib/eval/engine/` — reusable Validation Engine (scenario definition, oracles, runner).
- `lib/compiler/` — Experience Compiler (correction → sprout) and guidance compiler.
- `lib/artifact/` — Artifact Compiler (sprout → enforcement artifact spec).
- `lib/delivery/` — sprout registry, `get_task_context`, adapters, persistent store.
- `lib/ledger/` — Outcome Ledger and domain outcome metrics.
- `lib/router/` — Cost–Intelligence Router.
- `lib/control-plane/` — sprout release lifecycle and audit trail.
- `lib/reflex/` — Runtime Reflex Gate.
- `lib/mcp/` — MCP server wiring.
- `demo/` — the four scenario templates.
- `app/` — Next.js UI and API routes.

## Status

The core loop is built and demonstrated end-to-end, and the central thesis is validated by a
live scored experiment: a validated sprout lifts a cheap model from 0% to 100% on a
knowledge-dependent task. See `docs/DECISIONS.md` and `docs/BUILD_WEEK_CHANGELOG.md` for the
full record.
