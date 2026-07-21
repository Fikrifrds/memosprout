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

// Configure once — use any LLM provider
const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
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

### `new MemoSprout(directory?)`

Create a MemoSprout instance. Corrections are stored as Markdown files
in `directory` (default: `"./corrections"`).

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

## Principles

- **Corrections are verified, not blindly trusted.** Validate against
  domain-specific oracles before going live.
- **Your data never leaves your infrastructure.** Local-first, open
  source. Audit the code yourself.
- **Portable and open.** Markdown files, not a proprietary database.
- **Domain-agnostic core.** Pluggable adapters for any domain.

## Development

```bash
pnpm install
pnpm dev          # UI
pnpm cli <cmd>    # CLI
pnpm test         # 61 test files, 388 tests
pnpm lint
pnpm typecheck
```

## License

MIT
