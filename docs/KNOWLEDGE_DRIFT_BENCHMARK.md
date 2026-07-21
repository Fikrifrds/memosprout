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
| Protected, context injection only | 75% (15/20) |
| Protected, with the `check()` gate | **100% (20/20)** |
| Retrieval recall | 100% |
| Retrieval precision | 61% |
| Control accuracy, baseline → protected | 100% → 100% |
| False blocks on control cases | 0 |
| Regressions | none |

Both halves of the design earn their place: context injection alone
leaves 5 of 20 wrong, and the gate catches every one of them. Nine
answers were blocked in total — 5 genuine saves, 4 answers that were
already correct and got replaced by a correction that happened to say the
same thing.

## Known weakness this benchmark exposes

`check()` matches an answer against **every** active correction in the
domain, not the ones relevant to the question, and the numeric guard in
`matchesWrongPattern` only requires the disputed number to appear
*somewhere* in the answer. A multi-fact answer therefore trips unrelated
wrong patterns:

```
answer  "New vendors require 3 approvers before onboarding.
         New hires serve a probation period of 6 months."
pattern "New hires serve a probation period of 3 months"   → blocked
```

Both facts are correct; the "3" from `3 approvers` satisfies the numeric
guard for the probation pattern. On a block the pipeline serves
`corrections[0]`, which may be about an entirely different topic — so a
correct answer is replaced by a wrong one. The report tracks this as
`harmfulBlocks`. It is zero on the short single-fact answers here and
rises with answer length; the offline test
`tests/eval/knowledge-drift.test.ts` reproduces it deliberately.

## Extending it

Add cases to `lib/eval/knowledge-drift/dataset.ts`. The offline tests
enforce the invariants that keep the numbers meaningful: every drift
snippet must state the fact its correction disputes, must not already
leak the current fact, and every correction must satisfy its own oracle.
