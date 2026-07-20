# Token Economics

Why MemoSprout reduces the cost of running AI agents, what exactly it saves, and how the
saving is measured. This is the thesis behind decision BW-044.

## The bottleneck has moved from intelligence to token cost

Developers consistently adopt the newest, most capable models — raw model intelligence is
rarely the limiting factor anymore. The limiting factor is **token consumption**: a single
coding session can burn millions of tokens, subscription limits (5-hour and weekly windows)
run out, and developers upgrade to $100–$200 plans mainly to stop hitting them.

Where do those tokens actually go? Mostly not to "thinking":

1. **Failed iterations** — the agent gets it wrong → long output → human correction →
   re-run → wrong again → re-run. One mistake discovered late can waste from tens of
   thousands to millions of tokens. This is the single biggest cost multiplier.
2. **Repeated exploration** — every new session, the agent re-reads large parts of the
   repository to rediscover conventions that were already discovered in earlier sessions,
   because those discoveries were never captured.
3. **Context bloat** — the longer the session runs (because of 1 and 2), the more expensive
   every subsequent turn becomes. Waste compounds.

## The root cause is a knowledge gap, not an intelligence gap

The mistakes behind (1) and the searching behind (2) are overwhelmingly caused by missing
**project-local facts**: this project soft-deletes, every query must be tenant-scoped, that
client file is generated from a schema. No model, however intelligent, can *guess* local
facts — they must be supplied. This makes the gap MemoSprout fills **immune to model
progress**: as models get smarter, the intelligence gap shrinks, but the local-knowledge gap
remains — and becomes the dominant remaining source of failures and wasted tokens.

## How MemoSprout attacks token cost

Three paths:

1. **Right on the first try.** A sprout of a few hundred tokens, delivered just-in-time, can
   prevent a wrong-attempt → correction → re-run cycle. How favourable that trade is depends
   entirely on what a retry costs: the sprout is paid on every attempt, the retry only when
   the agent goes wrong. See the measured results below — the effect is real but smaller than
   the arithmetic suggests, because the sprout cost is recurring.
2. **Knowledge replaces repeated exploration.** A convention discovered once is delivered as
   a few sentences (`get_task_context`) instead of being rediscovered by reading dozens of
   files every session.
3. **The Cost–Intelligence Router.** Developers use the most expensive models because cheap
   models fail on their tasks. When a sprout makes a cheap model reliable on a task class
   (measured: 0/3 → 3/3 on the idempotency scenario), the router can send that task to a
   cheaper model rather than always reaching for the frontier.

A side effect of the trend itself: because developers switch models every few months,
knowledge that is portable across models (Open Knowledge Format) compounds in value, while
vendor-locked memory dies with every migration.

## Honest limits

- MemoSprout is **not** context compression and **not** a caching layer. It does not shrink
  the codebase an agent must read, and it does not reduce the baseline tokens of a genuinely
  large task.
- The claim is precisely: MemoSprout cuts **wasted** tokens (retries, re-exploration, wrong
  paths), not all tokens.
- Measured mean savings are around 10%, not the order-of-magnitude reduction the retry
  arithmetic might suggest. The sprout is sent on every attempt; the retry it prevents happens
  only sometimes. The measured effect on *variance* is much larger than the effect on the
  mean — see the results below.

## The metric: tokens-to-success

**`tokens_to_success`** — the total number of tokens consumed from the start of a task until
the task passes its oracle, **including all retries and corrections**. Recorded per outcome
in the Outcome Ledger's `metrics` map and compared between conditions:

- `baseline` — the task attempted without sprouts.
- `protected` — the same task with the applicable sprouts delivered.

`OutcomeLedger.tokenImpact(scenario)` reports the average baseline tokens, average protected
tokens, absolute savings, and savings rate. This turns the cost claim into a measured number
per scenario, exactly as `sproutImpact` does for the quality claim.

## Measurement integrity: a corrected methodology bug

The first live run of this experiment produced a headline result of 64% token savings with a
0/3 baseline success rate. **That result was wrong and has been discarded.** It is recorded
here because a measurement system that hides its own errors cannot be trusted to measure
anything.

The bug: `AcceptanceSuiteOracle.evaluate` materializes the held-out acceptance test into the
repository whenever that file is absent — which is every baseline attempt, since the baseline
condition deliberately removes it. The experiment detected policy violations by asking git
which files were dirty. From the second attempt onward, git therefore reported
`tests/idempotency.acceptance.test.ts` as changed, that path is on the guarded list, and the
worker was blamed for a file the *oracle* had written.

Two consequences, both inflating the result in MemoSprout's favor:

1. The baseline was scored 0/3 despite actually solving the task (the oracle passed on attempt
   two in all three trials). The "cheap model fails without a sprout" reading was an artifact.
2. Because the phantom violation prevented the success condition from being met, baseline
   trials were forced into a third attempt they did not need, adding tokens that no real
   workflow would have spent.

The tell was the pattern itself: attempt 1 never violated, attempts 2 and 3 always did, in
every trial, deterministically. Model behavior is not that consistent — test harnesses are.

The fix: policy violations are now detected by hashing the content of every guarded file
immediately before and after each worker turn, and comparing. A file the oracle creates is
never attributed to the worker, and the attribution survives that file persisting into later
attempts. A regression check confirms both directions — an honest worker is no longer flagged
across repeated attempts, and a worker that genuinely tampers with a guarded file is still
caught. Each attempt now records `violatedPaths`, `repositoryChangedPaths`, and any
`workerError` so the raw evidence can be audited independently.

## Measured results

Two live experiments, both on gpt-5.4-mini, both with the corrected violation detection.
Every attempt is recorded in the evidence directories with per-run token counts.

### Experiment 1 — small repository (idempotency)

3 trials per condition, 164-line repository.

| | Success | Attempts | Mean tokens-to-success |
| --- | --- | --- | --- |
| Baseline | 3/3 | 5 | 19,414 |
| Protected | 3/3 | 3 | 17,634 |

**9.2% mean saving.** The mechanism was visible — the sprout removed two retries — but the
saving was small because the sprout is sent on every attempt while a retry on a 164-line
repository is cheap. On a repository an agent can read in one pass, there is little discovery
cost for a sprout to displace.

### Experiment 2 — multi-file repository (api-conventions)

8 trials per condition, ~450 lines across 12 files, with conventions (tenant scoping, archive
filtering, sort order, cursor pagination, response envelope, validation helpers) discoverable
only by reading the codebase. The scenario is verified to discriminate before use: a
conventions-following implementation passes the oracle, a plausible naive implementation fails
it while still passing the ordinary tests.

| | Success | First-attempt | Mean | Median | SD |
| --- | --- | --- | --- | --- | --- |
| Baseline | 8/8 | 7/8 | 20,088 | 19,103 | 4,865 |
| Protected | 8/8 | 8/8 | 17,834 | 18,323 | 911 |

**11.2% mean saving — and an 81% reduction in run-to-run spread.**

### What the numbers actually support

The mean saving is real but modest, and consistent across both scenarios (9.2%, 11.2%). It
moved in the predicted direction as the repository grew, which supports the mechanism, but
the movement is small. **A ~10% mean saving does not move anyone from a $200 plan to a $100
plan, and it should not be presented as if it does.**

The stronger and better-evidenced finding is variance. Baseline runs ranged from 15,807 to
30,655 tokens (SD 4,865); protected runs clustered between 16,021 and 18,515 (SD 911). One
baseline run in eight exhausted its tool-loop turn budget exploring the repository, failed
entirely, and had to start over — costing nearly twice the median. No protected run needed a
second attempt.

This matters because subscription quotas are not consumed by the average run; they are
consumed by the runs that go wrong. The honest claim is therefore **"more predictable cost"**
rather than "a smaller bill": MemoSprout removes the expensive tail where an agent gets lost
rediscovering what the project already knows.

### Limits of these results

- One scenario each, 3 and 8 trials, a single model. This shows a direction, not a guarantee.
- Both scenarios are synthetic fixtures built for measurement, not production codebases.
- The plan-tier question ($200 → $100) remains unanswered and is not supported by this data.
- Larger runs across more scenarios, and ideally on real repositories, are the next step.
