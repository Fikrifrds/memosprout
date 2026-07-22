# Knowledge-drift benchmark

Does MemoSprout actually make answers more correct? This benchmark is the
measurement, not the argument.

```bash
pnpm drift:bench                   # lexical check only
pnpm drift:bench --semantic-check  # adds the LLM semantic pass
```

## What it measures

Twenty-six questions against a fictional company handbook. Both
conditions get the identical question and the identical retrieved
snippet; the only difference is MemoSprout.

- **20 drift cases** — the snippet is stale, and one correction in the
  store holds the current fact. Baseline answers from the stale snippet
  and is wrong by construction, which is exactly the situation the
  product claims to fix.
- **6 control cases** — the snippet is current and no correction applies.
  These catch the failure mode nobody advertises: a correction layer that
  degrades answers it should have left alone.
- **20 distractor corrections** share the handbook's vocabulary, so
  retrieval has to pick the right record out of 40 rather than return the
  only one it has.

The corpus is fictional, so no model can recover the current fact from
pretraining. Grading is a deterministic phrase oracle, not an LLM judge —
a measurement meant to be believed should not carry a judge's error bar.

## Results

`claude-haiku-4-5-20251001`, 2026-07-22. Full transcript in
`demo/generated-files/evidence/knowledge-drift/report.json`.

| Metric | Result |
|---|---|
| Baseline accuracy (drift) | 0% (0/20) |
| Protected, context injection only | 100% (20/20) |
| Protected, with the `check()` gate | **100% (20/20)** |
| Retrieval recall | 100% |
| Retrieval precision | 61% |
| Control accuracy, baseline → protected | 100% → 100% |
| False blocks on control cases | 0 |
| Harmful blocks | 0 |
| Regressions | none |

Read the two protected rows together: on this benchmark **context
injection does all the work, and the `check()` gate adds nothing.** A
capable model given the correction in its system prompt applies it every
time. The gate fired on 4 answers and changed no outcome.

That is not an argument for deleting the gate — it is an argument that
this benchmark does not yet measure it. The gate earns its place against
a model that ignores injected context, which the offline
`stub-stubborn` test covers and no live case here does. Measuring it
honestly needs a weaker model or a longer-context setting where
injected instructions get lost. Until that exists, the claim this
benchmark supports is about delivery, not about the gate.

Retrieval precision of 61% means `context()` injects roughly one useful
correction for every two it serves. It costs tokens rather than accuracy
here, but it is the number to watch as a store grows past 40 records.

## Known weakness this benchmark exposed

The first run of this benchmark reported 100% only because two failures
cancelled out: `check()` blocked answers that were already correct, and
the substituted correction happened to be right. Two bugs, one in the
product and one in the oracle, both since fixed.

**In the product.** `check()` matched an answer against every active
correction in the domain, and the numeric guard in
`matchesWrongPattern` only required the disputed number to appear
*somewhere* in the answer. A multi-fact answer therefore tripped
unrelated wrong patterns:

```
answer  "New vendors require 3 approvers before onboarding.
         New hires serve a probation period of 6 months."
pattern "New hires serve a probation period of 3 months"   → blocked
```

Both facts are correct; the "3" from `3 approvers` satisfied the numeric
guard for the probation pattern. On a block the pipeline serves
`corrections[0]`, so a correct answer was replaced by an off-topic one.
Token overlap is now scored one sentence at a time, and `check()` ranks
its matches so `corrections[0]` is the strongest rather than an
arbitrary one. The report tracks any recurrence as `harmfulBlocks`.

**In the oracle.** Grading rejected any answer containing the stale
phrase, including answers that named it only to reject it — "16 weeks,
not the 8 weeks stated in the older version" was scored wrong. The
oracle now ignores a forbidden phrase governed by a contrast cue. This
is what moved context-injection accuracy from an apparent 75% to its
real 100%.

## Extending it

Add cases to `lib/eval/knowledge-drift/dataset.ts`. The offline tests
enforce the invariants that keep the numbers meaningful: every drift
snippet must state the fact its correction disputes, must not already
leak the current fact, and every correction must satisfy its own oracle.
