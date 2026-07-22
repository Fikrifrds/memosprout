# Live provider matrix — post-fix run

**Status: current harness.** This run was executed on 2026-07-22 against the
frozen harness (commits `36182e9`, `5b38132`) after the retrieval rework,
the sentence-scoped negation-aware gate, the shippable-output gate scoring,
and the usage-accounting fixes. It supersedes the pre-fix run in
[PROVIDER_MATRIX.md](PROVIDER_MATRIX.md), which is kept for its methodology
history and its record of four measurement errors that were corrected.

The expectations for this run were frozen *before* it executed, and every
one held:

| Metric | Predeclared | Observed |
|---|---|---|
| correction-case recall (item) | 88.9% | 88.9% (8/9) |
| micro precision | 80.0% | 80.0% (24/30) |
| control serve rate | 0.0% | 0.0% |
| the one expected miss | `h-workwear-allowance` | `h-workwear-allowance` |

Raw results: `eval/provider-matrix/results/2026-07-22-post-fix/`
(gitignored). No credential appears here or in those files.

## What this is

The same constructed stale-context stress test as before. Every drift case
is built so the baseline *must* fail — the retrieved passage contradicts the
stored correction, entities are fictional so no model can answer from
pretraining. A 0% baseline is the design, not a finding. What the run
measures is the delta MemoSprout produces on that failure mode, not
accuracy on traffic where a corpus is already current.

## Scoring

An answer counts as correct only if it is **shippable**: it carries the
current fact, does not assert the stale one, and arrives as prose rather
than a JSON or chat-template scaffold. This is stricter than the pre-fix
run, which scored the fact alone. The stricter rule is why two providers
below read 0%: they produce the correct fact, wrapped in a structure a
caller cannot put in front of a user unchanged.

Grading is a deterministic phrase oracle — no model judges another. Rates
are item-level (9 cases measured 3 times are 9 items, not 27), with a
seeded bootstrap over items. `preferred_language` is untouched.

## Results — correction cases (9 items × 3 reps)

| Provider | baseline | injection | gate | lift | gate delta |
|---|---|---|---|---|---|
| openai/gpt-4o-mini | 0% [0-0] | 89% [67-100] | 89% [67-100] | +88.9pp | +0.0pp |
| qwen/qwen3.8-max-preview | 0% [0-0] | 89% [67-100] | 89% [67-100] | +88.9pp | +0.0pp |
| openrouter/openai/gpt-4o-mini | 0% [0-0] | 89% [67-100] | 89% [67-100] | +88.9pp | +0.0pp |
| anthropic/claude-haiku-4-5 | 0% [0-0] | 78% [56-96] | 85% [70-100] | +77.8pp | +7.4pp |
| xiaomi/mimo-v2.5 | 0% [0-0] | 0% [0-0] | 0% [0-0] | +0.0pp | +0.0pp |
| togetherai/openai/gpt-oss-120b | 0% [0-0] | 0% [0-0] | 0% [0-0] | +0.0pp | +0.0pp |

Control cases, all three arms — correctness `b/i/g`, then contamination:

| Provider | correct | contaminated |
|---|---|---|
| openai/gpt-4o-mini | 100% / 100% / 100% | 0% / 0% / 0% |
| qwen/qwen3.8-max-preview | 100% / 100% / 100% | 0% / 0% / 0% |
| openrouter/openai/gpt-4o-mini | 100% / 100% / 100% | 0% / 0% / 0% |
| anthropic/claude-haiku-4-5 | 100% / 100% / 100% | 0% / 0% / 0% |
| xiaomi/mimo-v2.5 | 0% / 0% / 0% | 0% / 0% / 0% |
| togetherai/openai/gpt-oss-120b | 0% / 0% / 0% | 0% / 0% / 0% |

Retrieval: item recall **88.9%**, micro precision **80.0% (24/30)**,
control serve rate **0%**. No provider errored this run.

## What the run establishes

**1. On prose-returning models, delivery works and the effect is large.**
Four providers from three vendors went from 0% to 78–89% shippable-correct.
Injection accuracy tracks retrieval recall: every miss is `h-workwear-allowance`,
the one synonym gap, on every provider.

**2. The gate still contributes almost nothing on strong models.** Three of
four prose providers show a +0.0pp gate delta; only claude-haiku gains
(+7.4pp), and it is also the one provider with a harmful block — the same
`b-payout-multifact` case where the repair dropped the second fact. The
gate remains a safety net whose value is hard to separate from noise on
capable models.

**3. mimo-v2.5 and gpt-oss-120b are 0% under the shippable rule.** They
retrieve fine and often state the right fact, but wrapped in a schema
(`{"reasoning":...,"answer":...}`, `{"response":...}`). This is the
`looksStructured` case: the fact is present, the string is not usable prose.
Notably, **togetherai produced zero server errors this run** (it failed 30
of 45 last time), so its problem is purely output shape, not endpoint
health — which is exactly what motivated flagging the shape rather than
declaring the provider broken.

**4. Cross-provider transfer, now measured two ways.** A correction learned
through one provider and applied by a different one: **44/50 applied** at
the fact level. For the first time the clean-output figure is recorded
too — **33/50 applied *and* returned as prose**. The 11-pair gap is almost
entirely mimo and gpt-oss-120b answering in a schema. The 10 self-transfer
pairs are held out and reported separately (10/10).

## Change from the pre-fix run

| | pre-fix (fact-only) | post-fix (shippable) |
|---|---|---|
| prose-provider injection | 67–78% | 78–89% |
| retrieval recall | 78% | 89% |
| micro precision | 53.8% | 80.0% |
| control contamination (mimo) | 17% | 0% |
| transfer | 43/50 applied | 44/50 applied, 33/50 clean |
| harmful blocks | 1 | 1 |

The retrieval and precision gains are the rework landing. The contamination
drop is the corroboration rule. The stricter scoring is why mimo and
gpt-oss-120b now read 0% instead of a partial score — the honest number for
an answer a caller cannot ship as-is.

## Limits, unchanged

Nine items is a small set; every interval spans 30+ points. The synonym gap
is open and needs semantic retrieval — `generateAliases` narrows it in the
product but is deliberately off in the fixtures so the gap stays measured.
No multi-turn, adversarial, or long-context cases, and nothing on a corpus
that is already current. Token usage is now recorded per arm where
providers report it; cost characterisation over a sustained workload is not
done.
