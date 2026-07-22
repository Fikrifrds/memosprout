# Release readiness evidence

This document separates what MemoSprout has demonstrated from what it has
not. A correction layer is useful only if it improves wrong answers without
silently degrading correct ones.

## What is proven

> **A current run now exists.** See
> [docs/evaluations/PROVIDER_MATRIX_POST_FIX.md](evaluations/PROVIDER_MATRIX_POST_FIX.md),
> executed against the frozen harness after all the fixes. The block
> below is kept for history.
>
> **Historical.** The live paid run below predates the retrieval rework, the
> sentence-scoped `check()`, and the gate repair loop. It is kept as recorded
> evidence and must not be quoted as current behaviour. The deterministic
> stress test further down runs against the present code; the provider matrix
> has not been re-run on it.


The live paired knowledge-drift benchmark gives the same fictional stale
handbook passage and question to both conditions. The protected condition is
the only one that receives MemoSprout context. With 20 current corrections,
20 same-domain distractors, and 6 current-information controls, the recorded
Claude Haiku run produced:

| Measure | Result |
|---|---:|
| Stale-fact baseline accuracy | 0/20 |
| Accuracy with correction context | 20/20 |
| Accuracy after the output gate | 20/20 |
| Retrieval recall | 20/20 |
| Control accuracy, baseline and protected | 6/6 and 6/6 |
| Harmful blocks | 0 |
| Regressions | 0 |

This is causal evidence for the core use case: **when a valid correction is
already stored and the retriever finds it, MemoSprout can override stale RAG
context and materially improve the returned answer.** It is not evidence that
every captured correction is true or that every user formulation will be
retrieved.

The full live transcript is in
`demo/generated-files/evidence/knowledge-drift/report.json`.

## Deterministic release stress test

Run:

```bash
pnpm verify:readiness
```

The no-model evaluation uses the same 40-record store, 20 fresh lexical query
variants, 20 semantic paraphrases, 10 adversarial irrelevant queries, stale
answers, corrected answers, and correct multi-fact answers.

Results on 2026-07-22:

| Measure | Result |
|---|---:|
| Original-query recall / mean reciprocal rank | 100% / 1.00 |
| Fresh lexical-variant recall / mean reciprocal rank | 100% / 1.00 |
| Pure semantic-paraphrase recall (diagnostic) | 20% |
| Stale answers blocked | 20/20 |
| Corrected answers allowed | 20/20 |
| Correct multi-fact answers allowed | 20/20 |
| Adversarial irrelevant queries receiving context | 10/10 |
| Irrelevant corrections served across those queries | 11 |

The semantic and adversarial rows are intentional honesty checks. The default
retriever is lexical, not an embedding retriever. It handles configured
keywords and close wording well, but it does not understand an unrelated use
of a broad keyword: `training` can match `training room`, for example. That
causes prompt noise and token cost. In the live controls it did not change a
correct answer, but large stores should use specific trigger phrases and
monitor `correctionsServed` until query-aware or semantic retrieval is added.

The output gate has a different role. It now scores one sentence at a time,
ignores non-identifying function words during overlap, and ranks the strongest
match first. The stress test protects against both previously observed failure
modes: borrowing a disputed number from another sentence and treating a
categorical correction such as `quarterly` to `monthly` as still wrong.

## Lifecycle and package gates

Offline integration tests cover:

- suggested, expired, cross-domain, and deprecated corrections never being
  served;
- successful oracle validation persisting validation metadata while keeping a
  suggested correction out of prompts until approval;
- failed validation quarantining a correction;
- ESM, CommonJS, CLI, and packed-package consumer behavior;
- lint, type checking, the complete Vitest suite, and the supply-chain audit.

## Honest release decision

MemoSprout is a real and useful **correction delivery and enforcement layer**.
The evidence supports an npm beta for teams that can provide or approve valid
corrections and instrument the outcome. It does not yet support the stronger
claim that MemoSprout autonomously discovers truth, retrieves arbitrary
semantic paraphrases, or guarantees accuracy in every domain.

Before promoting the beta to `latest`, add at least one external integration
run from a real RAG/chat workload and track false retrieval, false block, user
override, and correction-staleness rates over time.
