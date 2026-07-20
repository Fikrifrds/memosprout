# Sprout Applicability, Precedence, and Day-Zero Delivery

How MemoSprout keeps sprouts correct across different projects, resolves conflicts between
sprouts, and becomes useful before a user has any corrections of their own.

## The core principle: a sprout is conditional, not universal

A sprout is not a universal truth. It is a **conditional rule**:

```
IF <applicable to this project/task> THEN <guidance>
```

Example: "When changing the API client, edit the schema and regenerate; do not edit the
generated file directly." This is correct **only** for a project that has a schema and a
generator. For a project that hand-writes its API client, the same sprout is wrong.

Therefore every sprout carries **applicability conditions** that decide whether it applies to a
given project and task. This is what lets a large library of pre-built and community sprouts
stay correct even though different projects need different rules.

## 1. Applicability conditions

Each sprout declares when it applies, across three signals:

- **Project characteristics** — what kind of project this is (for example
  `schema-first-codegen`, `uses-postgres`, `has-secrets-in-config`). This is the strongest
  signal for pre-built sprouts.
- **Scope paths** — the files or directories the sprout governs (already supported as
  `scopePaths`).
- **Context attributes** — task-level key-values such as `{ domain: "support", ticketType:
  "refund" }` (already supported as `contextMatch`).

A sprout applies only when its conditions are satisfied. The "edit schema, regenerate" sprout
carries the characteristic `schema-first-codegen`; if a project lacks a schema and generator,
the condition fails and the sprout stays inactive.

**Current state:** `scopePaths` and `contextMatch` exist today. **Needed:** richer
project-characteristic preconditions on top of them.

## 2. Precedence hierarchy (conflict resolution)

When sprouts overlap or contradict, MemoSprout resolves them by **precedence**, not by trying
to detect the contradiction:

```
user's own  >  project (team)  >  community  >  pre-built
 (highest)                                      (lowest)
```

A sprout from a higher layer overrides a lower-layer sprout that covers the same scope. This
mirrors configuration layers (local overrides global) and matches how developers expect
defaults to be overridden.

This resolves the common case **without semantic conflict detection**: if the user has a sprout
for a scope, it wins, and the conflicting pre-built sprout is suppressed for that scope. Each
sprout therefore carries a `source` (and derived precedence).

## 3. Selective retrieval (handling volume)

A rich library may hold hundreds of sprouts, but an agent must not receive all of them — that
is the "remembering everything" anti-pattern. Delivery is **selective**:

1. **Filter** by applicability — keep only sprouts whose conditions match this project/task.
2. **Resolve** by precedence — drop lower-precedence sprouts overridden by a higher one.
3. **Rank** by relevance — order the survivors by relevance to the task.
4. **Deliver** the top-k — a few relevant sprouts, not the whole library.

Matching is deterministic today (scope + context); semantic ranking via embeddings is added at
scale (see `STORAGE_ARCHITECTURE.md`).

## 4. Project detection (the day-zero key)

To be useful before a user has any corrections, MemoSprout detects a project's characteristics
on first open and activates the applicable pre-built sprouts automatically.

Detection methods, from cheap to rich:

- **File/path patterns** — the project contains `openapi.yaml`, `*.generated.ts`, a `generate`
  script → infer `schema-first-codegen`.
- **Heuristics / static analysis** — detect language, framework, and structural patterns.
- **Explicit declaration** — a `.memosprout/config` where the team states characteristics
  directly (most reliable, zero guesswork).
- **LLM-assisted analysis** — analyze the repository to infer characteristics (richest, costs a
  model call; used sparingly).

The result is a **project fingerprint** — the set of characteristics that selects which
pre-built sprouts apply.

## 5. Walkthrough: a sprout that is right for one project and wrong for another

Pre-built library contains "edit schema, regenerate." Project B hand-writes its client and does
not want this rule.

- **Detection:** MemoSprout scans project B, finds no schema or generator → the
  `schema-first-codegen` condition fails → the sprout is **not active**. The conflict never
  arises.
- **If the user disagrees anyway:** the user corrects once → that becomes the user's own sprout
  ("in this project, edit the client directly") → **user precedence beats pre-built** → the
  user's sprout wins for that scope.
- **Volume:** even with 200 pre-built sprouts, only the applicable and relevant few for the
  current task are delivered.

## 6. The day-zero flow

```
User opens a brand-new project (no corrections yet)
  → MemoSprout scans it → detects characteristics
     (schema-first-codegen, uses-postgres, has-secrets-in-config)
  → activates the applicable pre-built sprouts
     (edit-schema, mask-secrets, ...)
  → the agent immediately receives relevant, validated guidance
  → as the user corrects, their own sprouts are added and
     override pre-built ones wherever they differ
```

This is the "usable before you start" experience: value on day zero from the pre-built library,
then increasingly personalized as the user's own knowledge accumulates.

## 7. Honest challenges

- **Project detection is hard.** Reliably inferring characteristics from a repository needs
  heuristics and possibly LLM analysis; it is real engineering work, not trivial.
- **The pre-built library is a curation burden.** Each pre-built sprout needs guidance,
  well-authored applicability conditions, and validation. This is more of a content/operational
  challenge than a technical one.
- **Subtle semantic conflicts can slip through.** Precedence resolves most conflicts, but
  natural-language guidance can contradict in ways precedence alone does not catch. This is a
  known limitation; explicit conflict markers or a semantic judge are possible mitigations later.

## 8. Architecture additions

Building on the existing `scopePaths`, `contextMatch`, and retrieval:

1. **`source` / precedence** on each sprout (`user`, `project`, `community`, `prebuilt`).
2. **Richer applicability conditions** — project-characteristic preconditions.
3. **Project detection** — a project fingerprint from patterns, heuristics, explicit config,
   and optional LLM analysis.
4. **Precedence-based resolution** in the retrieval/delivery layer.

## 9. Phasing

- **Phase 1 (MVP):** `scopePaths` + `contextMatch` + deterministic matching (built today); add a
  `source`/precedence field and basic applicability.
- **Phase 2:** richer applicability conditions + project detection (patterns/heuristics +
  explicit config) + precedence-based resolution; ship a curated pre-built library.
- **Phase 3:** semantic retrieval (embeddings) + LLM-assisted detection + a community sprout
  library (network effect).
