# Changelog

All notable changes to this project are documented here. This project
follows [Semantic Versioning](https://semver.org/). While the major version
is `0`, the public API may change between minor versions.

## 0.3.0 — first public release

MemoSprout captures corrections to AI answers, gates them before they count,
and delivers them to later interactions.

Earlier `0.x` versions existed only in the repository and were never
published, so there is no upgrade path to describe.

### Included

- **Capture.** `processMessage()` detects a correction in a user message and
  extracts structured fields with an LLM. `correct()` writes one directly.
- **Gate.** `approvalRequired` defaults to `true`: a correction is stored as
  `suggested` and served only after `approve()`. Model confidence is not
  treated as source validation.
- **Deliver.** `context()` returns the corrections relevant to a question for
  injection into a system prompt. `check()` scores a generated answer against
  known-wrong patterns.
- **Operate.** `report()` shows whether corrections are being served and
  triggered, `audit()` returns a correction's full lifecycle, `validate()`
  checks one against a domain oracle.
- 13 LLM providers, plus any OpenAI- or Anthropic-compatible endpoint.
- Corrections stored as Markdown with YAML frontmatter. No database, and no
  data leaves your infrastructure.
- **Diagnose.** `report()` also returns `queriesWithoutMatch` and
  `unmatchedQueries`. Retrieval failing is silent — an empty context, not an
  error — so these name the phrasings your triggers do not cover yet.
- `generateAliases: true` asks the model once per new correction for the
  other words users say for the same fact, and stores them as triggers. One
  call on the write, none on the read path. Off by default.
- `LLMResponse.usage` reports normalized token counts. `inputTokens` is the
  whole input side on every provider, with `cachedInputTokens` and
  `cacheCreationInputTokens` as the breakdown pricing needs.
- `LLMResponse.looksStructured` flags a reply that arrived as a JSON
  scaffold or raw chat-template tokens instead of prose. The content is
  never altered: an evaluated model produced twenty different shapes across
  forty-five replies, so there is no envelope to strip and picking a field
  would mean guessing which key holds the answer.

### Evaluation

- A full six-provider live run against the frozen harness is recorded in
  `docs/evaluations/PROVIDER_MATRIX_POST_FIX.md`. Under shippable-output
  scoring, four prose-returning providers reach 78–89% correct on
  stale-context questions where the baseline is 0% by construction.
  Cross-provider transfer is 44/50 at the fact level and 33/50 as usable
  prose. `pnpm tsx eval/provider-matrix/verify-post-fix.ts` reproduces
  every figure from the raw results.

### Known limitations

These are measured and documented in the README, not open questions:

- **Retrieval is lexical.** Recall is 100% when the question shares
  vocabulary with the trigger and 20% for pure paraphrases. A miss is
  silent — an empty context, not an error. `unmatchedQueries` shows you
  which phrasings are missing and `generateAliases` widens the triggers, but
  neither is a substitute for semantic retrieval.
- **The output gate matters most on weak models**: +48 points on a small
  model that ignored injected context, +7 to +15 on stronger ones.
- **Published accuracy numbers come from constructed stale-context stress
  tests**, where the baseline is designed to fail. They are a delta on that
  failure mode, not production accuracy.
- No coverage yet for multi-turn, adversarial, or long-context use, or for
  corpora that are already current.

### Notes for early adopters

When `check()` blocks an answer, regenerate the complete answer using every
returned correction and check it again. Never replace a multi-fact answer
with a single correction field — that silently drops the facts that were
already right. The quick start shows the full loop.
