# MemoSprout

**Correct once. Improve every interaction.**

MemoSprout captures corrections to AI outputs, gates them before they count,
and delivers them to every future interaction — so a mistake fixed once stops
coming back.

Works with any AI system: RAG pipelines, chatbots, coding agents, report
generators. Any domain where AI produces outputs that humans verify.

## Install

```bash
npm install memosprout
```

## Quick start

```typescript
import { MemoSprout } from "memosprout";

// Configure once. Any endpoint works — give it a base URL, an API key,
// and a model id.
const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "openai-compatible",          // wire format of the endpoint
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: "gpt-4o-mini",
  },
  semanticCheck: true, // also catch paraphrased/translated wrong answers
});

// Your chatbot handler:
async function handleChat(userMessage: string, previousAIAnswer: string) {
  // 1. MemoSprout auto-detects corrections and extracts structured fields.
  //    User says: "No, annual leave is 15 days since 2026, check SK-045"
  //    LLM extracts: wrong="12 days", correct="15 days since 2026", source="SK-045"
  //    The correction is saved as suggested until it is validated/approved.
  const result = await ms.processMessage(userMessage, previousAIAnswer);
  if (result.correctionStatus === "suggested") {
    await queueForSourceReview(result.correctionSaved!.correctionId);
  }

  // 2. Get previously approved corrections and inject them into the prompt
  const { context } = await ms.context(userMessage);

  // 3. Call your AI provider with `context` injected
  const answer = await callYourAI(userMessage, context);

  // 4. Check the answer before sending it to the user
  const check = await ms.check(answer);
  if (!check.ok) {
    // A correction is one fact, not a replacement for a potentially
    // multi-fact answer. Regenerate the full answer and check it again.
    const requiredFacts = check.corrections.map((item) => item.correct).join("\n");
    const revised = await callYourAI(
      userMessage,
      `${context}\n\nRevise the entire answer and preserve unrelated facts.\n${requiredFacts}`,
    );
    if (!(await ms.check(revised)).ok) throw new Error("Unsafe answer blocked");
    return revised;
  }
  return answer;
}
```

One `processMessage()` call handles detection, extraction, and saving.
No manual field writing. Works in any language.

### Manual corrections (admin / agent)

```typescript
// Agents and admins can also add corrections directly:
await ms.correct({
  wrong: "Refund takes 3 business days",
  correct: "Refund takes 5 business days since March 2026",
  keywords: ["refund", "processing"],
  source: "Refund Policy v4.1",
  role: "agent",  // trusted → auto-active
});
```

## API

### `new MemoSprout(directory?, options?)`

Create a MemoSprout instance. Corrections are stored as Markdown files
in `directory` (default: `"./corrections"`).

```typescript
new MemoSprout("./corrections", {
  llm: {
    // Any endpoint: give it the wire format, URL, key, and model.
    provider: "openai-compatible",         // or "anthropic-compatible"
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: "gpt-4o-mini",
    timeoutMs: 30_000,                     // optional, default 30s

    // Shorthand: a named provider fills in baseUrl and a default model.
    // provider: "openai", apiKey: "..."
  },
  // Optional separate judge. Prefer a domain adapter backed by a real oracle.
  // validationLlm: { provider: "anthropic", apiKey: process.env.JUDGE_API_KEY },
  approvalRequired: true,      // default; model confidence is not validation
  autoActivateThreshold: 0.8,  // used only after explicitly setting approvalRequired: false
  semanticCheck: false,        // LLM pass in check() for paraphrases
  generateAliases: false,      // one LLM call per new correction, on write
});
```

All LLM options are optional — without them, MemoSprout works as a
manual correction store (`correct()`, `context()`, `check()`).

### `ms.correct(options)`

Capture a correction. Returns the `CorrectionRecord`.

```typescript
await ms.correct({
  wrong: "the wrong answer",       // required
  correct: "the correct answer",   // required
  domain: "rag-chat",              // optional, default "general"
  keywords: ["keyword1", "keyword2"], // optional trigger keywords
  entities: ["entity1"],           // optional trigger entities
  explanation: "why this changed", // optional
  source: "document reference",    // optional
  by: "user-id",                   // optional
});
```

Calling `correct()` with the same `wrong` + `correct` + `domain` again
increments `confirmCount` (multiple users confirming the same correction).

### `ms.context(query, domain?)`

Find corrections relevant to a query. Returns `{ corrections, context }`.

Inject `context` into your AI's system prompt or RAG context so it
applies verified corrections automatically.

### `ms.check(answer, domain?)`

Check an AI-generated answer against known-wrong patterns.
Returns `{ ok, corrections }`.

If `ok` is `false`, the answer contains a known-wrong pattern. Use
all returned corrections as constraints when regenerating the complete
answer, then call `check()` again. A correction is one verified fact; it is
not a safe replacement for a multi-fact answer.

Matching is layered:

1. **Lexical** (always on, no LLM): normalized word-boundary matching plus
   token overlap — catches case, punctuation, and reordered phrasing.
   Numeric values must match exactly, so an already-corrected answer is
   never blocked by mistake.
2. **Semantic** (opt-in via `semanticCheck: true` + an LLM): catches
   paraphrases and translations of the wrong answer. If the LLM call
   fails, it falls back to lexical matching and logs a warning — a broken
   LLM never blocks your answers.

### `ms.list(filter?)`

List corrections. Filter by `status`, `domain`, or `keyword`.

### `ms.get(correctionId)`

Get a single correction by ID.

### `ms.remove(correctionId)`

Deprecate a correction (soft delete).

### `ms.report(domain?)`

Outcome tracking. Shows whether corrections actually help:

```typescript
const report = await ms.report("support");
// {
//   totalQueries: 142,
//   correctionsServed: 89,
//   blocksTriggered: 12,
//   queriesWithoutMatch: 31,
//   unmatchedQueries: ["How much for workwear?", "when do I get paid out?"],
//   topCorrections: [{ correctionId: "corr_abc", timesServed: 45, timesBlocked: 8 }],
// }
```

`queriesWithoutMatch` is the number that tells you whether retrieval is
working. A correction that is never found fails silently — the caller gets
an empty context, not an error — so `unmatchedQueries` lists the actual
phrasings your trigger keywords did not cover. Reading that list and adding
the words your users really type is the fastest way to improve recall.

Only queries in a domain that holds active corrections are counted, so an
unrelated question is never reported as a retrieval failure.

### `ms.audit(correctionId)`

Full lifecycle history for a correction:

```typescript
const history = await ms.audit("corr_abc");
// [{ action: "approved", actor: "admin", timestamp: "..." }, ...]
```

### `ms.validate(correctionId)`

Validate a correction against a domain-specific oracle. Uses the
DomainAdapter oracle if set, otherwise an explicitly configured, separate
`validationLlm` for plausibility checking. The LLM fallback does not retrieve or read the
referenced source; use a domain adapter when authoritative validation is
required. MemoSprout rejects using the extraction model as its own judge. A
passing suggested correction becomes `validated` and remains out
of prompts until `ms.approve(id)` activates it. A failed correction is
quarantined.

```typescript
const result = await ms.validate("corr_abc");
// { passed: true, detail: "Correction validated against scenario..." }

await ms.approve("corr_abc"); // validated → active
```

## LLM providers

`provider` accepts 13 values: two generic ones for any endpoint, and
eleven named shortcuts.

### Any endpoint

Pick the wire format your endpoint speaks. `baseUrl` and `model` are
**required** here — there is no default to fall back on:

```typescript
llm: {
  provider: "openai-compatible",   // POST <baseUrl>/chat/completions
  baseUrl: "https://your-endpoint.com/v1",
  apiKey: process.env.LLM_API_KEY,
  model: "your-model-id",
}

llm: {
  provider: "anthropic-compatible", // POST <baseUrl>/messages
  baseUrl: "https://your-endpoint.com/anthropic",
  apiKey: process.env.LLM_API_KEY,
  model: "your-model-id",
}
```

That covers self-hosted models, gateways like LiteLLM or vLLM, and any
provider not listed below.

### Named providers (shorthand)

For these eleven, pass the name instead and `baseUrl` plus a default
`model` are filled in for you:

```typescript
llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY }
```

| Provider | Suggested model | Note |
|---|---|---|
| `openai` | `gpt-4o-mini` | Best price/performance |
| `anthropic` | `claude-haiku-4-5-20251001` | Cheapest Claude |
| `deepseek` | `deepseek-chat` | Extremely cheap |
| `qwen` | `qwen-turbo` | Strong multilingual |
| `kimi` | `moonshot-v1-8k` | Moonshot |
| `xiaomi` | `mimo-v2.5` | Xiaomi MiMo |
| `minimax` | `MiniMax-Text-01` | Competitive pricing |
| `groq` | `llama-3.1-8b-instant` | Fastest, free tier |
| `togetherai` | `meta-llama/Llama-3.1-8B-Instruct-Turbo` | Open models |
| `openrouter` | `deepseek/deepseek-chat-v3-0324` | Hundreds of models, one key |
| `ollama` | `llama3.2` | Free, local, no API key |

A named provider also accepts a `baseUrl` override (for a regional or
proxied endpoint) and a `model` override.

Unsupported provider names throw a clear error listing the valid options.
Every provider returns the same shape and the same error type — see
[docs/PROVIDERS.md](docs/PROVIDERS.md) for per-provider setup, API key
links, caveats, and live verification status.

## Use with any framework

### LangChain

```typescript
import { MemoSprout } from "memosprout";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const ms = new MemoSprout("./corrections");

async function answer(question: string) {
  const { context } = await ms.context(question);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant.\n\n{context}"],
    ["human", "{question}"],
  ]);

  const chain = prompt.pipe(new ChatOpenAI({ model: "gpt-4o" }));
  const response = await chain.invoke({ question, context });

  const check = await ms.check(response.content as string);
  if (!check.ok) {
    const requiredFacts = check.corrections.map((item) => item.correct).join("\n");
    const revised = await chain.invoke({
      question,
      context: `${context}\n\nRevise the complete answer using:\n${requiredFacts}`,
    });
    if (!(await ms.check(revised.content as string)).ok) {
      throw new Error("Unsafe answer blocked");
    }
    return revised.content;
  }
  return response.content;
}
```

### Vercel AI SDK

```typescript
import { MemoSprout } from "memosprout";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const ms = new MemoSprout("./corrections");

async function answer(question: string) {
  const { context } = await ms.context(question);

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: `You are a helpful assistant.\n\n${context}`,
    prompt: question,
  });

  const check = await ms.check(text);
  if (check.ok) return text;

  const requiredFacts = check.corrections.map((item) => item.correct).join("\n");
  const { text: revised } = await generateText({
    model: openai("gpt-4o"),
    system: `${context}\n\nRevise the complete answer using:\n${requiredFacts}`,
    prompt: question,
  });
  if (!(await ms.check(revised)).ok) throw new Error("Unsafe answer blocked");
  return revised;
}
```

### Express / any HTTP API

```typescript
import { MemoSprout } from "memosprout";
import express from "express";

const ms = new MemoSprout("./corrections");
const app = express();
app.use(express.json());

// Capture corrections from user feedback
app.post("/feedback", async (req, res) => {
  const { wrong, correct, keywords } = req.body;
  const correction = await ms.correct({ wrong, correct, keywords });
  res.json(correction);
});

// Enhance any chat endpoint
app.post("/chat", async (req, res) => {
  const { question } = req.body;
  const { context } = await ms.context(question);

  // Pass `context` to your AI provider
  const answer = await callYourAI(question, context);

  const check = await ms.check(answer);
  res.json({ answer, corrections: check.ok ? [] : check.corrections });
});
```

## Use from Python, PHP, Go, or any language

Run the built-in REST API server and call it over HTTP. Start it from a
few lines of Node:

```typescript
// server.mjs — node server.mjs
import { MemoSprout, createApiServer } from "memosprout";

const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "openai-compatible",
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  },
});

createApiServer(ms, 3456, {
  apiKey: process.env.MEMOSPROUT_API_KEY, // required to expose it
  // host: "0.0.0.0",                     // needs apiKey to be set
  // corsOrigin: "https://your-app.com",
  // rateLimitPerMinute: 120,
});
```

Or from a clone of this repo, configured entirely by environment:

```bash
MEMOSPROUT_API_KEY=your-secret-key \
MEMOSPROUT_LLM_PROVIDER=openai-compatible \
MEMOSPROUT_LLM_BASE_URL=https://api.openai.com/v1 \
MEMOSPROUT_LLM_API_KEY=your-llm-key \
MEMOSPROUT_LLM_MODEL=gpt-4o-mini \
pnpm api
```

```python
import requests

BASE = "http://127.0.0.1:3456"
HEAD = {"Authorization": "Bearer your-secret-key"}

requests.post(f"{BASE}/correct", headers=HEAD, json={
    "wrong": "Refund takes 3 business days",
    "correct": "Refund takes 5 business days",
})

ctx = requests.post(f"{BASE}/context", headers=HEAD,
                    json={"query": "how long is a refund?"}).json()
```

Endpoints: `POST /correct`, `/context`, `/check`, `/process`, `/feedback`,
`/refresh-staleness`, `/corrections/:id/validate`, `/corrections/:id/approve`;
`GET /corrections`, `/corrections/:id`, `/corrections/:id/audit`,
`/feedback/summary`, `/report`, `/health`; `DELETE /corrections/:id`.

**Security defaults:** the server binds to `127.0.0.1` only and refuses to
bind elsewhere without `MEMOSPROUT_API_KEY`. All endpoints except `/health`
require the key (`Authorization: Bearer` or `x-api-key`). Rate limited to
120 requests/min per key (`MEMOSPROUT_RATE_LIMIT`), body limit 1 MB, CORS
origin configurable via `MEMOSPROUT_CORS_ORIGIN`.

See [docs/INTEGRATION_EXAMPLES.md](docs/INTEGRATION_EXAMPLES.md) for more
languages and frameworks.

## CLI

```bash
npx memosprout init
npx memosprout add --domain coding --wrong "Edit generated files" --correct "Modify schema and regenerate"
npx memosprout list --status active
npx memosprout check "query" "answer"
```

## How corrections are stored

Corrections are Markdown files with YAML frontmatter — human-readable,
git-versionable, portable:

```markdown
---
correction_id: corr_a1b2c3d4
status: active
domain: rag-chat
trigger_keywords: [leave, cuti, annual]
wrong_pattern: Annual leave is 12 days
correct_answer: Annual leave is 15 days since January 2026
source_ref: HR Policy v3.2
---

# Correction: Annual leave is 15 days since January 2026

## Wrong pattern
Annual leave is 12 days

## Correct answer
Annual leave is 15 days since January 2026

## Source
HR Policy v3.2
```

No database. No vendor lock-in. `git diff` your corrections.

Writes are atomic (temp file + rename) and serialized in-process, so
concurrent requests cannot corrupt a file or lose a `confirmCount` bump.

## Limitations

Read this before adopting. Each item is measured, not estimated.

### Retrieval is lexical, not semantic

A correction is found by matching trigger keywords, entities, and the words
of the correction itself against the question. It handles inflection
("dispute" finds "disputed") and reordering, but it cannot relate two
different words for the same thing.

```typescript
await ms.correct({
  wrong: "The annual uniform allowance is EUR 120",
  correct: "The annual uniform allowance is EUR 200",
  keywords: ["uniform allowance"],
});

await ms.context("How much can I claim for workwear?"); // -> no match
```

On a deterministic paraphrase set, recall is **100% for queries that share
vocabulary with the trigger and 20% for pure paraphrases**. The failure is
silent: you get an empty context, not an error.

Two things reduce this. `report()` tells you which phrasings are missing
(`unmatchedQueries`), and `generateAliases: true` asks the model once per
new correction for the other words users say:

```typescript
const ms = new MemoSprout("./corrections", {
  llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY! },
  generateAliases: true,
});

await ms.correct({ wrong: "...EUR 120", correct: "...EUR 200",
                   keywords: ["uniform allowance"] });
// stored triggers: uniform allowance, workwear, protective clothing, ...
```

The call happens on the write, so queries stay free and no latency is added
to the read path. It is off by default because it spends money on an
otherwise free code path, and because each extra trigger term trades a
little retrieval precision for recall. Neither substitutes for semantic
retrieval — they narrow the gap, they do not close it.

### The output gate helps weak models most

`check()` catches a wrong answer after generation. Across six live
endpoints, it was worth **+48 points on a small model that ignored the
injected context, and +7 to +15 points on stronger ones** — inside the
measurement interval for the latter. If you already use a capable model,
most of the benefit comes from `context()`, not from the gate.

When the gate fires, do not substitute a single correction for the whole
answer: regenerate and re-check, as the quick start shows. A correction is
one fact, and an answer often carries several.

### Benchmarks measure a constructed failure mode

The published numbers come from stale-context stress tests: the retrieved
passage is deliberately made to contradict a stored correction, so the
baseline is designed to fail. They measure the delta MemoSprout produces on
that failure, **not accuracy on traffic where your corpus is already
current**. Nothing here has been measured on production traffic.

### A correction is only as good as its approval

`approvalRequired` defaults to `true` because model confidence is not source
validation. MemoSprout enforces that a correction was approved before it is
served; it cannot tell you whether the approver was right.

### Not yet covered

Multi-turn conversations, adversarial inputs, long-context settings, and
corpora that are already up to date. Token and cost overhead are reported
per call but have not been characterised over a sustained workload.

## FAQ

### The source document gets updated and my correction is now outdated. What happens?

This is the case MemoSprout is built for, so it has explicit machinery for
it — but the machinery only runs if you give a correction a fingerprint of
its source.

When you capture the correction, record what it was based on:

```typescript
import { createHash } from "node:crypto";

const doc = await fetchPolicyDoc("SK-045");        // your source of truth
await ms.correct({
  wrong: "Annual leave is 12 days",
  correct: "Annual leave is 15 days since 2026",
  source: "SK-045",
  sourceHash: createHash("sha256").update(doc).digest("hex"),
});
```

Then teach MemoSprout how to look up the current fingerprint:

```typescript
ms.setSourceHashProvider({
  async getCurrentHash(sourceRef) {
    const doc = await fetchPolicyDoc(sourceRef);       // re-fetch live
    return createHash("sha256").update(doc).digest("hex");
  },
});
```

Now, on every `context()` and `check()`, MemoSprout re-computes the source
hash. If the document changed, the correction is **quarantined** — marked
`staleness: "source_changed"`, dropped from retrieval, and never injected
again. It is not deleted: quarantine is a held state, not a verdict, so you
can review why it went stale rather than silently losing the record.

The reasoning is deliberate: once the underlying document changes, the
correction may have become right, wrong, or redundant, and MemoSprout
cannot know which. Serving a correction whose basis has shifted would be
worse than serving nothing, so it stops serving and surfaces it for a
human.

There are three other ways a correction stops being served, in the same
spirit of not trusting a stale fact:

- **Expiry.** Set `expiresAt` when you know a correction has a shelf life
  (a temporary policy, a rate that resets). After that date it is
  quarantined automatically — no source hash needed.
- **Supersession.** Capturing a newer correction that contradicts an older
  one quarantines the old one instead of leaving the AI with two "verified"
  answers. This happens on its own; see [Trust and safety](#trust-and-safety).
- **Manual deprecation.** `ms.remove(id)` retires a correction you know is
  wrong.

If you record no `sourceHash`, none of the automatic source-change
detection runs — MemoSprout has nothing to compare against, and the
correction stays active until it expires, is superseded, or is removed by
hand. For a RAG pipeline over documents that change, wiring up the hash
provider is the piece that keeps the correction store honest as the corpus
moves underneath it.

### "Connect an LLM — optional." What runs without one, and what is the default?

The default is **no LLM**. Constructing `new MemoSprout("./corrections")`
with no `llm` option gives you a manual correction store, and these work
entirely offline with no API key and no network call:

| Method | Needs an LLM? |
|---|---|
| `correct()` | no |
| `context()` | no |
| `check()` (lexical) | no |
| `list()`, `get()`, `remove()`, `report()`, `audit()` | no |
| `processMessage()` | **yes** — returns type `"none"` without one |
| `check()` with `semanticCheck: true` | **yes** for the semantic pass |
| `correct()` with `generateAliases: true` | **yes** for aliases |
| `validate()` | uses the LLM only as a fallback oracle |

So without an LLM you can still capture corrections by hand, retrieve them,
and block known-wrong answers by exact and reordered phrasing. What you lose
is the convenience layer: automatically turning a user's "no, that's wrong"
into a structured correction (`processMessage`), catching paraphrased wrong
answers (`semanticCheck`), and widening triggers with synonyms
(`generateAliases`). Add an LLM when you want those; leave it out to keep
everything local and free.

### What is `./corrections`? Do I need to create the folder first?

It is the directory where corrections are written, one Markdown file each,
plus small JSON index files for outcomes and the audit log. The argument is
just a path — name it whatever you like; `"./corrections"` is only the
default.

**You do not create it.** MemoSprout runs `mkdir` recursively on first use,
so a path that does not exist yet is fine. Point it wherever the corrections
should live:

```typescript
new MemoSprout();                          // ./corrections
new MemoSprout("./data/memosprout");       // created on first write
new MemoSprout("/var/lib/app/corrections");
```

Because it is plain files, the store is portable and inspectable: commit it
to git to version your corrections, diff it in a review, or copy the folder
to move the whole knowledge base. See
[How corrections are stored](#how-corrections-are-stored) for the file
format.

### Does any of my data leave my machine?

Only what you send to the LLM, and only if you connected one. The
correction store is local files. With no LLM configured, nothing leaves at
all. With one, the text you pass to `processMessage()`, `check(..., {
semanticCheck })`, or alias generation is sent to that endpoint — the
corrections themselves are never uploaded anywhere by MemoSprout.

### Which model should I use?

Any of the 13 named providers, or any OpenAI- or Anthropic-compatible
endpoint. The work here — classifying a message, extracting a correction,
listing synonyms — is well within a small, cheap model's reach; the
suggested defaults in [LLM providers](#llm-providers) are chosen for
price. One caveat from live testing: reasoning and agent-tuned models
sometimes answer with a JSON scaffold instead of prose, which the retrieval
and gate layers cannot use directly. `LLMResponse.looksStructured` flags
that so you can react. Prefer an instruct model for the answer itself.

### How do I know if it's actually working?

`report()` is the honest signal. `correctionsServed` and `blocksTriggered`
show corrections doing their job; `queriesWithoutMatch` and
`unmatchedQueries` show the opposite — questions that found no correction
although the domain had some. A high `queriesWithoutMatch` usually means
your trigger keywords do not match how users phrase things; add the words
from `unmatchedQueries`, or turn on `generateAliases`.

## Trust and safety

Corrections change what your AI tells users, so they are not accepted
blindly:

- **Role-based trust.** `agent`/`admin`/`system` corrections go live;
  `customer` corrections are always saved as `suggested` pending approval.
- **Safe default.** LLM-extracted corrections require approval by default;
  model confidence is not source validation. Setting `approvalRequired: false`
  explicitly enables auto-activation at `autoActivateThreshold` (default
  `0.8`) and should be limited to a trusted input channel.
- **Prompt-injection hardening.** User text is framed as data, not
  instructions, in every LLM prompt; extracted output is validated with a
  strict schema and unknown ids are discarded.
- **Conflict quarantine and staleness.** A new correction that contradicts
  an active one quarantines the old record. Corrections also expire by
  date or when the source document's hash changes.
- **Audit trail.** Every lifecycle action is recorded via `ms.audit(id)`.

## Principles

- **Corrections are verified, not blindly trusted.** Validate against
  domain-specific oracles before going live.
- **Your data never leaves your infrastructure.** Local-first, open
  source. Audit the code yourself.
- **Portable and open.** Markdown files, not a proprietary database.
- **Domain-agnostic core.** Pluggable adapters for any domain.

## Documentation

- [docs/PROVIDERS.md](docs/PROVIDERS.md) — every supported LLM provider,
  setup, and response-handling guarantees
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — internals: lifecycle,
  staleness, storage, adapters
- [docs/INTEGRATION_EXAMPLES.md](docs/INTEGRATION_EXAMPLES.md) — framework
  and cross-language integration recipes
- [docs/RELEASING.md](docs/RELEASING.md) — how releases are published
  (GitHub Actions with npm provenance)

## Supply-chain safety

This package installs onto your machine, so it is built to be verifiable:

- **Published only from GitHub Actions with npm provenance** — a
  Sigstore-signed attestation ties every release to the exact repository,
  commit, and workflow that built it. Verify with
  `npm view memosprout dist.attestations`.
- **No install-time scripts.** Nothing executes when you `npm install`.
- **No shell execution.** The shipped code contains no `child_process`,
  `eval`, or `vm` usage.
- **Two runtime dependencies** (`yaml`, `zod`), both pinned exactly, both
  with no install scripts of their own.
- **No telemetry.** Without an LLM configured it makes zero network calls;
  with one, it talks only to the endpoint you chose, and your API key
  travels only in the `Authorization` header.

Run `pnpm audit:package` to verify all of the above against the actual
tarball yourself.

## Development

```bash
pnpm install
pnpm hooks:install # once per clone: refuse commits carrying credentials
pnpm dev          # marketing/docs site
pnpm cli <cmd>    # CLI
pnpm test         # 71 test files, 535 tests
pnpm test:live    # smoke test against a real LLM (needs an API key)
pnpm api          # REST API server
pnpm lint
pnpm typecheck
pnpm build:lib    # build the publishable package (dist/)
```

`pnpm hooks:install` points git at `.githooks`, which refuses a commit carrying
credentials — a key file by name, or a recognisable key format pasted into
a source file. `.gitignore` is the usual defence and it has failed here
before, so the hook checks what is actually staged rather than trusting a
file that can be edited. Run it by hand with `pnpm check:secrets`, and
bypass a false positive with `git commit --no-verify`.

It is a one-time command rather than an `install` hook on purpose: the
published package declares no install-time lifecycle scripts at all, and
`pnpm audit:package` fails the build if one appears.

## License

MIT — see [LICENSE](LICENSE). Use it commercially, modify it, ship it in
closed-source products; just keep the copyright notice.
