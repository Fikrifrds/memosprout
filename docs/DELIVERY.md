# Delivery & Distribution

How MemoSprout reaches users.

**Focus: MVP, local-first, free-first.** Team and cloud delivery is documented future work
(see `STORAGE_ARCHITECTURE.md`). This document covers how the free, local-first product is
distributed and adopted.

## Positioning

- **Free-first, open-source core.** The engine and delivery are free; governance and team
  collaboration are the future paid tier (open-core).
- **The MCP server is the delivery mechanism.** Users do not adopt a separate app; they install
  MemoSprout into the AI coding agent they already use. Delivery meets users inside their
  existing workflow.
- **Value accumulates with use.** Each correction becomes a sprout; the user's growing knowledge
  library is the retention moat.

## Target users

- **Primary (MVP):** individual developers using MCP-capable coding agents.
- **Future (paid):** engineering teams and organizations that need to share and govern sprouts
  (Team Control Plane).

## Distribution channels (MVP, prioritized)

1. **MCP registries and directories** — the highest-intent free channel. MemoSprout is an MCP
   server, so listing it where people actively look for MCP servers (the official MCP directory
   and community registries) puts it directly in front of users ready to install one.
2. **Open source (GitHub)** — the classic developer-tool wedge: trust, community, stars, and
   word-of-mouth. Fits the free-first, local-first design.
3. **npm / npx** — `npx memosprout` for a zero-install trial; `npm install -g memosprout` for
   global install. Low friction.
4. **Hosted demo (free static hosting)** — the landing page and dashboard deployed for discovery
   and conversion, requiring no install. The core value remains local (the MCP server connects to
   the user's agent).
5. **Content hook** — the convergence result ("a validated sprout lifts a cheap model from 0% to
   100% on a knowledge-dependent task") is a genuine, empirical story for a blog post, developer
   communities, and social channels — not empty marketing.
6. **Agent ecosystem integrations** — plugins or extensions for MCP-capable coding agents,
   built per ecosystem, to meet users where they already work.

## Adoption funnel

```
Discover  →  Try  →  Install  →  Use  →  Accumulate
```

- **Discover** — MCP registries, GitHub, content.
- **Try** — `npx memosprout` or the hosted demo.
- **Install** — connect the MCP server to the user's agent (a small config snippet, or one-click
  install from a registry).
- **Use** — `get_task_context` delivers relevant guidance; `check_tool_call` guards edits.
- **Accumulate** — the user's corrections become sprouts; the Outcome Ledger shows the measured
  lift; the growing library creates retention.

## The aha moment

A user makes a correction → MemoSprout compiles a sprout → the next agent run improves. The
early experience should be optimized to reach this moment as quickly as possible.

## Cold-start and network effect

- **Cold-start:** a new user has no sprouts and therefore no value yet. Mitigate with seed value
  — the demo scenarios and a starter sprout library.
- **Network effect (future):** because sprouts are portable (Open Knowledge Format), users can
  share them. A community sprout library lets users benefit from each other's corrections — a
  free growth loop that reinforces the "portable knowledge" thesis.

## Getting started (concrete)

```bash
# run the MCP server from source
pnpm mcp:serve

# or, once published, zero-install
npx memosprout
```

Then add MemoSprout to the agent's MCP configuration. The server loads its sprouts from a
local, file-backed store (`.memosprout-local/sprout-store.json` by default; override with
`MEMOSPROUT_SPROUT_STORE`), seeding the demo sprouts on first run.

## Free → paid (open-core, future)

- **Free (individual):** open-source MCP server, personal sprouts, local-first storage,
  deterministic matching.
- **Paid (team):** the Team Control Plane — shared sprout library, approval / release / canary /
  rollback, audit trail, SSO, and cross-team outcome analytics. The foundation for this tier is
  already built (wedge 7).

## MVP scope vs deferred

**In the MVP:**

- Open-source MCP server (`get_task_context`, `check_tool_call`).
- Local-first file-backed store and deterministic matching.
- Four coding scenarios (idempotency, soft-delete, tenant-isolation, secret-handling).
- Demo UI (landing, demo, dashboard, docs).
- Distribution via npm/npx, GitHub, MCP registries, and hosted demo.

**Deferred (documented for later):**

- Team/cloud storage (PostgreSQL + pgvector) and embeddings/vector indexing
  (`STORAGE_ARCHITECTURE.md`).
- Community/team sprout library and network effect.
- Billing and native per-ecosystem agent plugins.
