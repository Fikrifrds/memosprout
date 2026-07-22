# Live provider matrix — constructed stale-context stress test

**Status: pre-retrieval-fix and pre-gate-fix.** These results measure
`CorrectionStore.match` and `check()` as they stood on 2026-07-22, before
the subsequent retrieval and negation-aware gate changes. Revision v2: the
first version of this report contained four measurement errors, all
corrected below and all listed in [Corrections to v1](#corrections-to-v1).

**What this is not.** This is not a measurement of production accuracy.
Every drift case is built so the baseline *must* fail: the snippet in
front of the model contradicts the stored correction, and the entities are
fictional so no model can recover the answer from pretraining. A 0%
baseline is the design, not a discovery. What the run measures is the
*delta* MemoSprout produces under that constructed stress, and where the
pipeline breaks when it is pushed.

Run date 2026-07-22. Raw results in `eval/provider-matrix/results/`
(untracked). No credential appears here or in those files; providers are
`provider/model` labels and failures are error categories.

## Commands

```bash
pnpm tsx eval/provider-matrix/verify.ts         # dataset invariants
pnpm tsx eval/provider-matrix/regression.ts     # analysis regression checks
pnpm tsx eval/provider-matrix/verify-claims.ts  # recompute this report
pnpm tsx eval/provider-matrix/preflight.ts      # endpoint liveness
pnpm tsx eval/provider-matrix/run.ts --reps 3   # paid; not rerun for v2
```

`verify-claims.ts` regenerates every headline number below from the stored
raw results and fails if the document has drifted from the data.

Credentials come from the gitignored `.provider_list_to_test`. Variable
names only: `OPENAI_API_KEY`, `MEMOSPROUT_LLM_PROVIDER`,
`MEMOSPROUT_LLM_BASE_URL`, `MEMOSPROUT_LLM_API_KEY`,
`MEMOSPROUT_LLM_MODEL`.

## Frozen current-harness expectations before the next paid run

Frozen on 2026-07-22 after the offline retrieval, gate, usage-accounting,
and anti-overfit audits. These figures are predeclared expectations, not
results to reinterpret after seeing provider output:

| Retrieval metric | Expected |
|---|---:|
| correction-case recall | 88.9% (8/9) |
| micro precision | 80.0% (8/10) |
| control serve rate | 0.0% (0/6) |

`h-workwear-allowance` is the one expected retrieval miss. Its question
uses `workwear` while its triggers use `uniform allowance`; adding the
question's wording to the fixture would invalidate the medium synonym-gap
case. Closing it requires genuine semantic retrieval, not fixture tuning.

The current gate conditionally regenerates the complete answer only after
`check()` blocks arm B, records the extra latency, prompt, and token usage,
and re-checks the repair. A repair with `repairPassed === false` is not
shippable and cannot count as a correct gate output. Historical rows that
predate this field retain their historical scoring.

The next live report must keep the synonym miss visible, report clean-output
transfer separately from fact application, and include normalized token
usage where endpoints provide it.

## Methodology

15 cases across 3 fictional domains (rail HR, payments, SaaS support): 9
correction cases (6 `drift`, 3 `multifact`) and 6 `control` cases. 3
repetitions, 6 providers. 12 distractor corrections sit in the store so
retrieval has to choose rather than return.

Three arms on an identical question and an identical snippet:

| Arm | What it is |
|---|---|
| A baseline | no MemoSprout |
| B injection | `context()` prepended to the system prompt |
| C gate | arm B's answer through `check()` |

Arm C reuses arm B's generation; the gate is post-processing, so a second
sampled call would add noise without measuring anything.

**Sample sizes are item-level.** Nine cases measured three times are nine
items, not 27 observations. Rates are the mean over items of each item's
pass fraction, and intervals are a seeded percentile bootstrap over items
(10,000 resamples), which respects the clustering. Tables read
`k=items/observations`. These are empirical item-resampling intervals, not
population confidence intervals: when all nine constructed items have the
same outcome they collapse to 0-0 or 100-100 and must not be read as proof
of certainty on unseen tasks.

**Grading is a deterministic phrase oracle.** No model judges another
model. A stale phrase named only to reject it ("daily, not the weekly in
the reference") counts as correct. Stored answers are re-graded with the
current oracle at analysis time, so an oracle defect found later is fixed
without re-running paid calls.

`preferred_language` is untouched — it is the held-out coding-domain task
and played no part in designing, tuning, or running this evaluation.

## Results

### Correction cases (9 items x 3 repetitions)

| Provider | baseline | injection | gate | lift | gate delta |
|---|---|---|---|---|---|
| openai/gpt-4o-mini | 0% [0-0] | 78% [44-100] | 89% [67-100] | +77.8pp | +11.1pp |
| openrouter/openai/gpt-4o-mini | 0% [0-0] | 78% [44-100] | 89% [67-100] | +77.8pp | +11.1pp |
| qwen/qwen3.8-max-preview | 0% [0-0] | 78% [44-100] | 85% [63-100] | +77.8pp | +7.4pp |
| anthropic/claude-haiku-4-5 | 0% [0-0] | 67% [37-93] | 81% [59-100] | +66.7pp | +14.8pp |
| xiaomi/mimo-v2.5 | 0% [0-0] | 0% [0-0] | 48% [22-74] | +0.0pp | **+48.1pp** |
| togetherai/openai/gpt-oss-120b | 0% [0-0] | 0% [0-0] | 17% [0-50] | +0.0pp | +16.7pp |

k=9/27 for all except togetherai (k=6/9 — see failures).

### Paired changes on correction cases

Wins and losses compare the same case, repetition, and provider endpoint.
Ties include both pass→pass and fail→fail. These are paired observations,
not additional independent tasks.

| Provider | baseline→injection W/L/T (pairs) | injection→gate W/L/T (pairs) |
|---|---:|---:|
| openai/gpt-4o-mini | 21/0/6 (27) | 3/0/24 (27) |
| openrouter/openai/gpt-4o-mini | 21/0/6 (27) | 3/0/24 (27) |
| qwen/qwen3.8-max-preview | 21/0/6 (27) | 2/0/25 (27) |
| anthropic/claude-haiku-4-5 | 18/0/9 (27) | 5/1/21 (27) |
| xiaomi/mimo-v2.5 | 0/0/27 (27) | 13/0/14 (27) |
| togetherai/openai/gpt-oss-120b | 0/0/9 (9) | 1/0/8 (9) |

### Per-case repetition rates

Each cell is `injection passes/observed → gate passes/observed`. Baseline
was 0 for every observed correction-case repetition. `—` means that the
endpoint returned no usable observation for that case. Provider labels:
OAI = direct OpenAI, OR = OpenRouter gpt-4o-mini, Q = Qwen, H = Haiku,
M = Mimo, T = TogetherAI.

| Case | OAI | OR | Q | H | M | T |
|---|---:|---:|---:|---:|---:|---:|
| h-shift-length | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 2/3→3/3 | 0/3→2/3 | 0/3→0/3 |
| h-workwear-allowance | 0/3→0/3 | 0/3→0/3 | 0/3→0/3 | 0/3→3/3 | 0/3→3/3 | 0/2→0/2 |
| h-onboarding-multifact | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 0/3→0/3 | 0/1→0/1 |
| b-settlement-window | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 0/3→1/3 | — |
| b-dispute-fee | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 1/3→2/3 | 0/3→2/3 | 0/1→0/1 |
| b-payout-multifact | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 3/3→2/3 | 0/3→0/3 | — |
| s-sla-response | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 0/3→2/3 | 0/1→0/1 |
| s-deleted-ticket-retention | 0/3→3/3 | 0/3→3/3 | 0/3→2/3 | 0/3→0/3 | 0/3→3/3 | 0/1→1/1 |
| s-plan-multifact | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 3/3→3/3 | 0/3→0/3 | — |

### Control cases, all three arms (6 items x 3 repetitions)

Correctness, then contamination — the share of control answers that pulled
in a fact from an unrelated correction:

| Provider | correct b/i/g | contaminated b/i/g |
|---|---|---|
| openai/gpt-4o-mini | 100% / 100% / 100% | 0% / 0% / 0% |
| openrouter/openai/gpt-4o-mini | 100% / 100% / 100% | 0% / 0% / 0% |
| qwen/qwen3.8-max-preview | 100% / 100% / 100% | 0% / 0% / 0% |
| anthropic/claude-haiku-4-5 | 100% / 100% / 100% | 0% / 0% / 0% |
| xiaomi/mimo-v2.5 | 0% / 0% / 0% | 0% / **17%** / **17%** |
| togetherai/openai/gpt-oss-120b | 0% / 0% / 0% | 0% / 0% / 0% |

Reporting all three arms is what makes contamination attributable:
mimo-v2.5 goes 0% → 17% the moment injection is switched on, so the
irrelevant memory came from `context()`, not from the model's own
tendencies. Its 0% correctness in every arm is a clean-output failure:
facts may appear inside JSON/reasoning envelopes, but those are not usable
prose answers. v1 reported the gate arm only and could not show either
distinction.

### Retrieval

| Provider | recall (items) | micro precision | control serve rate |
|---|---|---|---|
| five providers | 78% [44-100] | **53.8%** (21/39) | 50% [17-83] |
| togetherai/openai/gpt-oss-120b | 67% [33-100] | 75.0% (6/8) | 33% [0-100] |

Micro precision counts every correction retrieved anywhere in the run,
including the 12 retrieved for control questions where nothing applies.
Just over half of what `context()` injects is relevant.

Latency medians, injection arm: gpt-4o-mini 1076ms, haiku 1114ms,
openrouter 1628ms, togetherai 1833ms, mimo 2698ms, qwen 4432ms.

## What the run establishes

**1. Under this stress, delivery works on four clean-output endpoints; two
compatibility-defective endpoints cannot establish delivery efficacy.**
Split by whether the needed correction was retrieved at all:

| Provider | correct when retrieved | correct when not retrieved |
|---|---|---|
| openai/gpt-4o-mini | 21/21 | 0/6 |
| openrouter/openai/gpt-4o-mini | 21/21 | 0/6 |
| qwen/qwen3.8-max-preview | 21/21 | 0/6 |
| anthropic/claude-haiku-4-5 | 18/21 | 0/6 |
| togetherai/openai/gpt-oss-120b | 0/6 clean | 0/3 |
| xiaomi/mimo-v2.5 | 0/21 clean | 0/6 |

Three endpoints produced a clean correct answer for every retrieved
correction; Haiku produced 18/21. Nothing was ever correct without
retrieval. Mimo and TogetherAI often contained the right phrase inside
client/protocol envelopes, but the grader now rejects those as unclean;
`verify-claims.ts` asserts the zero-without-retrieval property directly.

**2. Retrieval fails on paraphrase, deterministically.** The same two
items missed on every provider and every repetition: a question about
"workwear" against a correction filed under "uniform allowance", and "how
long do you keep deleted tickets" against one filed under "retention".
Keyword substring scoring cannot bridge a synonym. `easy` and `hard` items
retrieved fine; this is a `medium`-difficulty failure and it is 100%
reproducible. It alone caps the system at 78% here.

**3. The gate contributes materially only on a compatibility-defective
generator.** +48.1pp on mimo-v2.5 against +7.4 to +16.7pp elsewhere. Much
of that delta is the gate replacing wrapped output with a clean stored
correction, not evidence that the generator followed injected context. On the strong models the
gate delta is one or two items and sits well inside the interval — this
run cannot separate it from noise there. On mimo-v2.5 it is the difference
between 0% and 48% clean output.

**4. The gate also destroys correct answers.** One re-graded harmful block,
exactly what the multifact cases were built to catch:

```
claude-haiku, b-payout-multifact
  model answer  "Payouts are sent daily (not weekly), and the minimum
                 payout amount is EUR 50."          <- fully correct
  after gate    "Payouts are sent daily"            <- second fact gone
```

`check()` matched and the pipeline replaced the entire answer with
`corrections[0].correct`. Substituting one correction for a multi-fact
answer is lossy by construction. Mimo also produced an off-topic gate
replacement on unpaid leave, but its injection was already a wrapper
artefact, so it is a gate failure rather than a clean-answer regression.

**5. Fact-level cross-provider transfer holds: 43/50 (86%).** A correction extracted
through one provider and applied by a *different* one, across all 30
ordered cross-provider pairs. The 10 same-provider pairs are held out and
reported separately (10/10 applied); pooling them, as v1 did, inflates the
figure. Extraction succeeded 10/12 — mimo-v2.5 failed both utterances,
classifying them as not-a-correction at confidence 0. All 10 successful
extractions landed as `suggested` and required explicit approval,
consistent with `approvalRequired` defaulting to true.
The transfer raw records retain the `applied` boolean but not the answer
text, so wrapper cleanliness cannot be re-graded retroactively. This is a
fact-application result, not a clean-output transfer result.

## Corrections to v1

| # | v1 claim | Corrected | Why it was wrong |
|---|---|---|---|
| 1 | retrieval precision 86% | **53.8%** | The denominator excluded corrections retrieved for control questions, which are irrelevant by definition. |
| 2 | transfer 53/60 | **43/50** | 10 same-provider pairs were pooled in as if they were cross-provider. |
| 3 | n=27, Wilson intervals | k=9 items, bootstrap | Three repetitions of nine cases are not 27 independent tasks. Intervals were far too narrow. |
| 4 | contamination, gate arm only | all three arms | Without the baseline and injection arms there was no way to attribute contamination to MemoSprout. |

Two oracle defects were also found and fixed during this revision, both of
which had marked *correct* answers wrong: `"euros"` did not match `euro`,
and `"5,000"` did not match `5000`. They depressed control correctness by
up to 17pp and were identical across arms, so no lift figure changed.
Stored answers are now re-graded with the current oracle
(`analysis.regrade`), and `regression.ts` pins both cases.

## Failures, skips, and limits — nothing suppressed

- **togetherai/openai/gpt-oss-120b: 30 of 45 repetitions failed** with
  `server_error`. Its figures rest on k=6 items and are not comparable to
  the others. **Wrapper defect:** it returns a wrapped envelope
  (`{"name":"final","content":"..."}`) that `lib/llm/provider.ts` does not
  unwrap, so its answers carry JSON/protocol noise. The grader now rejects
  wrapper artefacts as unclean even when a correct phrase occurs inside.
  Unwrapping it in this lane would be silently substituting behaviour, so it stands. No
  substitute provider or model was used in its place.
- **xiaomi/mimo-v2.5 also returned structured/reasoning envelopes** in
  this run. Those outputs likewise score as unclean. This is why its
  clean injection correctness is 0%, rather than v1's phrase-only 30%.
- **Arms were coupled in the stored run.** In the code that produced these
  results, one failed call discarded the whole repetition, so togetherai's
  baseline and injection observations were lost together. The runner now
  preserves baseline and injection independently, preserves retrieval even
  if generation fails, and records gate/check errors separately using
  `status: "partial"` plus per-arm error categories. This run's numbers
  predate that fix.
- **The same endpoint failed one preflight and passed the next.** The
  probe now retries three times before declaring a provider unavailable;
  an earlier smoke run had silently dropped it. Attempt counts are stored.
- **Token and cost overhead were not measured in this stored run.** Its raw
  records predate usage instrumentation. The runner now stores normalized
  input, output, total, cache-read, and cache-creation token counts per arm;
  a future live run can measure real token overhead. Historical proxy:
  prompt size 368 → 556 characters mean, **+187 characters (+51%)** per
  request for a mean 186 characters of injected context.
- **Nine items is a small task set.** Every interval in the correction
  table spans 30 points or more. Differences between the top providers are
  not resolvable at this size.
- **One model family appears twice** (gpt-4o-mini direct and via
  openrouter). Identical scores are a useful consistency check, not two
  independent samples.
- **Deterministic oracles check facts, not answer quality.** They cannot
  see a fluent answer that is wrong in some way the case did not anticipate.
- **No adversarial, multi-turn, or long-context cases.** Single-turn
  questions against one snippet each.

## Verdict

**Established, within the stress test.** On constructed stale-context
questions where the baseline is designed to fail, MemoSprout takes four
clean-output endpoints to 67–78% on injection and 81–89% after the stored
gate. Two other endpoints returned unusable wrapper artefacts and cannot
support an efficacy claim. The four clean endpoints had no control-case
regression; contamination appeared on Mimo, whose outputs were already
unclean. Fact-level corrections transfer across providers at 43/50, but
transfer answers were not retained for wrapper re-grading. The delta is
real and large *for this failure mode and those four endpoints*. It says
nothing about accuracy on traffic where the corpus is already current.

**Established, narrowly for the stored build.** `check()` changed the
clean-output rate most on wrapped Mimo responses (+48.1pp). Elsewhere its effect is one or two items and
inside the interval.

**Contradicted for the stored pre-fix build.** That gate was safe. It
destroyed a correct multi-fact answer on claude-haiku and produced an
off-topic answer on mimo-v2.5. The current negation-aware gate code is
covered by offline regressions, but has not had a paid provider rerun, so
this report neither transfers the old failure to the current build nor
claims the current build is proven safe.

**Unmeasured in the stored run.** Token and cost overhead; behaviour on a current corpus;
anything adversarial, multi-turn, or long-context.

**The binding constraint in this stored run was retrieval.** No answer was
correct when its expected correction was missed, and micro precision was
53.8% — just over half of what got injected was relevant. The current
matcher changed after this run; only a future live rerun can establish its
provider-level effect.
