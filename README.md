# MemoSprout

**Correct once. Improve every interaction.**

MemoSprout captures corrections to AI outputs, validates them, and delivers
them to every future interaction — so a mistake fixed once never happens again.

Works with any AI system: RAG pipelines, chatbots, coding agents, report
generators. Any domain where AI produces outputs that humans verify.

## Install

```bash
npm install memosprout
```

## Quick start

```typescript
import { MemoSprout } from "memosprout";

// Configure once — pick any supported provider (see docs/PROVIDERS.md)
const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
  semanticCheck: true, // also catch paraphrased/translated wrong answers
});

// Your chatbot handler:
async function handleChat(userMessage: string, previousAIAnswer: string) {
  // 1. MemoSprout auto-detects corrections and extracts structured fields.
  //    User says: "No, annual leave is 15 days since 2026, check SK-045"
  //    LLM extracts: wrong="12 days", correct="15 days since 2026", source="SK-045"
  //    High confidence → correction goes live automatically.
  const result = await ms.processMessage(userMessage, previousAIAnswer);

  // 2. Get relevant corrections and inject into your AI's system prompt
  const { context } = await ms.context(userMessage);

  // 3. Call your AI provider with `context` injected
  const answer = await callYourAI(userMessage, context);

  // 4. Check the answer before sending it to the user
  const check = await ms.check(answer);
  if (!check.ok) {
    return check.corrections[0].correct; // use the verified answer
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
    provider: "deepseek",   // see docs/PROVIDERS.md for the full list
    apiKey: "sk-...",
    model: "deepseek-chat", // optional — provider default otherwise
    baseUrl: "https://...", // optional override for proxies
    timeoutMs: 30_000,      // optional, default 30s
  },
  approvalRequired: false,     // true = every correction needs approval
  autoActivateThreshold: 0.8,  // min LLM confidence to auto-activate
  semanticCheck: false,        // LLM pass in check() for paraphrases
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
`corrections[0].correct` to fix it.

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
//   topCorrections: [{ correctionId: "corr_abc", timesServed: 45, timesBlocked: 8 }],
// }
```

### `ms.audit(correctionId)`

Full lifecycle history for a correction:

```typescript
const history = await ms.audit("corr_abc");
// [{ action: "approved", actor: "admin", timestamp: "..." }, ...]
```

### `ms.validate(correctionId)`

Validate a correction against a domain-specific oracle. Uses the
DomainAdapter oracle if set, otherwise falls back to LLM-based
source verification.

```typescript
const result = await ms.validate("corr_abc");
// { passed: true, detail: "Correction validated against scenario..." }
```

## LLM providers

Eleven providers are supported out of the box — pass the name and your key:

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

For a self-hosted or proxied endpoint, choose the wire format explicitly:

```typescript
llm: {
  provider: "openai-compatible",   // or "anthropic-compatible"
  baseUrl: "https://your-gateway.internal/v1",
  apiKey: "...",
  model: "your-model-id",
}
```

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
    return `Correction needed: ${check.corrections[0].correct}`;
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
  return check.ok ? text : `Correction: ${check.corrections[0].correct}`;
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
  llm: { provider: "deepseek", apiKey: process.env.LLM_KEY },
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
MEMOSPROUT_LLM_PROVIDER=deepseek \
MEMOSPROUT_LLM_API_KEY=sk-... \
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

## Trust and safety

Corrections change what your AI tells users, so they are not accepted
blindly:

- **Role-based trust.** `agent`/`admin`/`system` corrections go live;
  `customer` corrections are always saved as `suggested` pending approval.
- **Confidence threshold.** LLM-extracted corrections auto-activate only
  at confidence ≥ `autoActivateThreshold` (default `0.8`). Set
  `approvalRequired: true` to require manual approval for everything —
  recommended when the input comes from the public.
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

## Development

```bash
pnpm install
pnpm dev          # marketing/docs site
pnpm cli <cmd>    # CLI
pnpm test         # 69 test files, 474 tests
pnpm test:live    # smoke test against a real LLM (needs an API key)
pnpm api          # REST API server
pnpm lint
pnpm typecheck
pnpm build:lib    # build the publishable package (dist/)
```

## License

MIT
