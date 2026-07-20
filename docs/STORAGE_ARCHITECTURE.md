# Sprout Storage Architecture

How MemoSprout stores, retrieves, and scales validated sprouts.

## Summary (answers up front)

| Question | Answer |
|---|---|
| **Who stores a user's sprouts?** | The user (local-first, self-owned) on the free/individual tier. MemoSprout or self-hosted team infrastructure on the team tier. |
| **Where?** | The local file system — project-level (`.memosprout/`) and/or user-level (`~/.memosprout/`) — on the free tier. A managed or self-hosted database on the team tier. |
| **Which database?** | JSON file (current MVP) → SQLite (local-first product) → PostgreSQL + pgvector (team/cloud, with embeddings). |
| **Embeddings / indexing?** | Not required for the MVP — deterministic matching is sufficient. Added at scale via pgvector for semantic (hybrid) retrieval. |

The guiding principle is **local-first and user-owned**: sprouts encode an organization's
corrections and know-how, which is often sensitive, so the default is that the user stores
their own knowledge on their own machine. Cloud storage is an opt-in for teams that want to
share and govern sprouts centrally.

## 1. Ownership model

- **User-owned (free / individual).** The user stores their sprouts locally. They control,
  version, and delete them. Nothing leaves their machine unless they choose to share. This is
  the privacy-first default and fits the open-source wedge.
- **Team-managed (paid).** A shared sprout library is stored centrally (MemoSprout-hosted or
  self-hosted) and governed by the Team Control Plane (approval, release, canary, rollback,
  audit). This is the natural paid tier.

## 2. Storage tiers

### Tier 1 — Local-first (free / individual)

Sprouts live on the local file system in two optional scopes:

- **Project-level** — `.memosprout/` inside a repository. Sprouts that belong to that project.
  Because they are files, they can be **committed to git and shared with the team as code** —
  a zero-infrastructure way for a team to share knowledge without any database or cloud
  ("sprouts as code").
- **User-level** — `~/.memosprout/`. Sprouts that follow a user across projects.

**Database progression:**

- **Now (MVP):** a versioned **JSON file** (`SproutStore`), loaded into an in-memory
  `SproutRegistry`. Simple, dependency-free, sufficient for a small library.
- **Next (local-first product):** **SQLite** — embedded, zero-config, no server, with real
  indexing, queries, and transactions. This is the standard choice for a local-first app and
  the right step up from JSON once the library grows or needs faster lookup.

### Tier 2 — Team / cloud (paid)

- **Database:** **PostgreSQL + pgvector** (the Full PRD stack). Structured sprout records in
  relational tables; embedding vectors in pgvector for semantic retrieval.
- **Why Postgres:** durable, transactional, multi-tenant, and pgvector adds vector search
  without a separate vector database.
- **Companion services** (only at this tier, only if needed): a cache/queue for background
  jobs (compilation, evaluation) and object storage for large evidence bundles.

## 3. Retrieval

### Now — deterministic matching

The current `get_task_context` matches sprouts deterministically:

- **File-path scope** — a sprout matches if the task touches a file within the sprout's
  `scopePaths`.
- **Context attributes** — a sprout matches if its `contextMatch` key-values are satisfied by
  the task's `context` (for example `{ domain: "support", ticketType: "refund" }`).

This is exact, explainable, and needs no model. It is sufficient for the scenarios shipped
today and for small-to-medium libraries.

### At scale — hybrid retrieval

When a library grows large (hundreds to thousands of sprouts) or tasks do not map cleanly to
paths/keys, add **semantic retrieval** on top of the deterministic filters:

1. **Filter** by deterministic signals first (scenario, scope path, context) to a candidate set.
2. **Rank** the candidates by semantic similarity between the task and the sprout.
3. **Return** the top-k relevant sprouts.

Hybrid (filter + rank) is more robust than pure vector search: the deterministic filter keeps
results precise, and the semantic ranker handles relevance within that set.

## 4. Embeddings and indexing (when needed)

Embeddings are an optimization for large libraries, **not a prerequisite**. When added:

- **What to embed:** each sprout's `guidance` + `trigger` + `scenario` (the semantically
  meaningful text). Optionally the prohibited actions.
- **Embedding model:** any text-embedding model; store one vector per sprout.
- **Index:** pgvector with an HNSW (or IVFFlat) index for fast approximate nearest-neighbor
  search.
- **Query flow:** embed the task context (file paths joined with the task description, or the
  context attributes) → vector similarity search over sprout vectors → combine with the
  deterministic filter → deliver the top-k.
- **Re-embedding:** recompute a sprout's vector whenever its guidance changes (on validation or
  edit).

For SQLite (Tier 1), a lightweight option is a local embedding cache plus brute-force cosine
similarity over a small library; a vector index is only worth it once the library is large.

## 5. Privacy and ownership

Local-first storage is a feature, not just a convenience:

- Sprouts encode an organization's corrections and internal know-how, which can be sensitive.
- Defaulting to user-owned local storage means that knowledge never leaves the user's machine
  unless they explicitly share it (via git, or by opting into a team library).
- This aligns with the open-source, free-first wedge and builds trust.

## 6. Current implementation status

Built today:

- `SproutStore` — JSON file persistence (`lib/delivery/store.ts`).
- `SproutRegistry` — in-memory registry (`lib/delivery/registry.ts`).
- Deterministic matching by file-path scope and context attributes
  (`lib/delivery/get-task-context.ts`).
- The MCP server loads its registry from the file-backed store
  (`.memosprout-local/sprout-store.json` by default).

Not yet built (future work):

- SQLite backing for the local tier.
- Embeddings and vector indexing.
- PostgreSQL + pgvector for the team/cloud tier.
- A shared community/team sprout library.

## 7. Phased recommendation

1. **Phase 1 (now):** keep the JSON file store and deterministic matching. Ship the free,
   local-first MCP server. No database server, no embeddings.
2. **Phase 2 (local-first product):** move the local store to **SQLite** for indexing and
   faster lookup; keep deterministic matching; support project-level ("sprouts as code") and
   user-level scopes.
3. **Phase 3 (team / scale):** add **PostgreSQL + pgvector** with embeddings for the team
   tier; hybrid retrieval; shared, governed sprout library via the Team Control Plane.
