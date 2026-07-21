# MemoSprout Integration Examples

Complete, copy-paste-ready examples for integrating MemoSprout with
popular AI providers, frameworks, and languages.

Two integration modes:

- **Library mode** (Node.js/TypeScript) — `import { MemoSprout } from "memosprout"`
- **API mode** (any language) — start the REST API server, call via HTTP

Start the API server for non-Node.js languages:

```bash
pnpm api
# MemoSprout API server running at http://localhost:3456
```

---

## 1. OpenAI (Node.js / TypeScript)

```typescript
import { MemoSprout } from "memosprout";
import OpenAI from "openai";

const ms = new MemoSprout("./corrections");
const openai = new OpenAI();

async function chat(userMessage: string): Promise<string> {
  // 1. Get relevant corrections
  const { context } = await ms.context(userMessage);

  // 2. Call OpenAI with corrections injected
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant.\n\n${context}`,
      },
      { role: "user", content: userMessage },
    ],
  });

  const answer = response.choices[0].message.content ?? "";

  // 3. Check the answer before returning
  const check = await ms.check(answer);
  if (!check.ok) {
    return `[Corrected] ${check.corrections[0].correct}`;
  }
  return answer;
}

// Capture a correction when the user says "that's wrong"
await ms.correct({
  wrong: "Our office closes at 5 PM",
  correct: "Our office closes at 6 PM since March 2026",
  keywords: ["office", "close", "hours"],
  source: "Operations Memo 2026-03",
});
```

---

## 2. Claude / Anthropic (Node.js / TypeScript)

```typescript
import { MemoSprout } from "memosprout";
import Anthropic from "@anthropic-ai/sdk";

const ms = new MemoSprout("./corrections");
const anthropic = new Anthropic();

async function chat(userMessage: string): Promise<string> {
  const { context } = await ms.context(userMessage);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are a helpful assistant.\n\n${context}`,
    messages: [{ role: "user", content: userMessage }],
  });

  const answer =
    response.content[0].type === "text" ? response.content[0].text : "";

  const check = await ms.check(answer);
  if (!check.ok) {
    return `[Corrected] ${check.corrections[0].correct}`;
  }
  return answer;
}
```

---

## 3. Plain JavaScript (no TypeScript, no build step)

```javascript
// server.mjs — run with: node server.mjs
import { MemoSprout } from "memosprout";
import OpenAI from "openai";

const ms = new MemoSprout("./corrections");
const openai = new OpenAI();

async function answer(question) {
  const { context } = await ms.context(question);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: `You are a helpful assistant.\n\n${context}` },
      { role: "user", content: question },
    ],
  });

  const text = response.choices[0].message.content;
  const check = await ms.check(text);

  if (!check.ok) {
    return { answer: check.corrections[0].correct, corrected: true };
  }
  return { answer: text, corrected: false };
}

// Usage
const result = await answer("How many leave days do I get?");
console.log(result);
```

---

## 4. React (frontend + API backend)

### Backend (Express)

```typescript
// server.ts
import { MemoSprout } from "memosprout";
import express from "express";

const ms = new MemoSprout("./corrections");
const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  const { question } = req.body;
  const { context } = await ms.context(question);

  // Call your AI provider with `context` injected
  const answer = await callAI(question, context);
  const check = await ms.check(answer);

  res.json({
    answer,
    corrected: !check.ok,
    corrections: check.corrections,
  });
});

app.post("/api/feedback", async (req, res) => {
  const { wrong, correct, keywords } = req.body;
  const correction = await ms.correct({ wrong, correct, keywords });
  res.json(correction);
});

app.listen(3001);
```

### Frontend (React component)

```tsx
// ChatWidget.tsx
import { useState } from "react";

export function ChatWidget() {
  const [messages, setMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    corrected?: boolean;
  }>>([]);
  const [input, setInput] = useState("");

  async function send() {
    const question = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.answer,
        corrected: data.corrected,
      },
    ]);
  }

  async function giveFeedback(wrong: string, correct: string) {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrong, correct }),
    });
  }

  return (
    <div className="chat-widget">
      {messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
          {msg.corrected && (
            <span className="badge">✓ Corrected by MemoSprout</span>
          )}
          {msg.role === "assistant" && (
            <button onClick={() => giveFeedback(msg.content, "the right answer")}>
              👎 Wrong? Correct it
            </button>
          )}
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  );
}
```

---

## 5. Python

MemoSprout corrections are Markdown files. Python can read them directly,
or call the REST API.

### Via REST API

```python
# pip install requests openai
import requests
import openai

MEMOSPROUT_URL = "http://localhost:3456"
client = openai.OpenAI()

def chat(question: str) -> str:
    # 1. Get corrections from MemoSprout API
    ctx = requests.post(f"{MEMOSPROUT_URL}/context", json={
        "query": question,
    }).json()
    context = ctx.get("context", "")

    # 2. Call OpenAI with corrections
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"You are a helpful assistant.\n\n{context}"},
            {"role": "user", "content": question},
        ],
    )
    answer = response.choices[0].message.content

    # 3. Check the answer
    check = requests.post(f"{MEMOSPROUT_URL}/check", json={
        "answer": answer,
    }).json()

    if not check.get("ok", True):
        return f"[Corrected] {check['corrections'][0]['correct']}"
    return answer


def give_feedback(wrong: str, correct: str, keywords: list[str] = None):
    """Capture a correction when the AI gets it wrong."""
    requests.post(f"{MEMOSPROUT_URL}/correct", json={
        "wrong": wrong,
        "correct": correct,
        "keywords": keywords or [],
    })


# Usage
answer = chat("How many leave days do I get?")
print(answer)

# User says "that's wrong"
give_feedback(
    wrong="Annual leave is 12 days",
    correct="Annual leave is 15 days since 2026",
    keywords=["leave", "cuti"],
)
```

### Read corrections directly (no API server needed)

```python
import os
import yaml

def load_corrections(directory: str = "./corrections") -> list[dict]:
    """Read MemoSprout correction files directly."""
    corrections = []
    for filename in os.listdir(directory):
        if not filename.endswith(".md"):
            continue
        with open(os.path.join(directory, filename)) as f:
            content = f.read()
        # Parse YAML frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                meta = yaml.safe_load(parts[1])
                if meta.get("status") == "active":
                    corrections.append(meta)
    return corrections

def build_context(question: str, corrections: list[dict]) -> str:
    """Find relevant corrections for a question."""
    tokens = question.lower().split()
    relevant = []
    for c in corrections:
        keywords = c.get("trigger_keywords", [])
        if any(kw.lower() in tokens for kw in keywords):
            relevant.append(
                f'- Do NOT say "{c["wrong_pattern"]}". '
                f'Correct: {c["correct_answer"]}'
            )
    if not relevant:
        return ""
    return "Important corrections:\n" + "\n".join(relevant)
```

---

## 6. PHP

### Via REST API

```php
<?php
// composer require openai-php/client guzzlehttp/guzzle

$memosproutUrl = 'http://localhost:3456';

function msPost(string $endpoint, array $data): array {
    global $memosproutUrl;
    $ch = curl_init("$memosproutUrl/$endpoint");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}

function chat(string $question): string {
    // 1. Get corrections
    $ctx = msPost('context', ['query' => $question]);
    $context = $ctx['context'] ?? '';

    // 2. Call your AI provider (example: OpenAI)
    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode([
            'model' => 'gpt-4o',
            'messages' => [
                ['role' => 'system', 'content' => "You are a helpful assistant.\n\n$context"],
                ['role' => 'user', 'content' => $question],
            ],
        ]),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . getenv('OPENAI_API_KEY'),
        ],
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $response = json_decode(curl_exec($ch), true);
    curl_close($ch);
    $answer = $response['choices'][0]['message']['content'];

    // 3. Check the answer
    $check = msPost('check', ['answer' => $answer]);
    if (!$check['ok']) {
        return '[Corrected] ' . $check['corrections'][0]['correct'];
    }
    return $answer;
}

function giveFeedback(string $wrong, string $correct, array $keywords = []): void {
    msPost('correct', [
        'wrong' => $wrong,
        'correct' => $correct,
        'keywords' => $keywords,
    ]);
}

// Usage
echo chat("How many leave days do I get?");

giveFeedback(
    wrong: "Annual leave is 12 days",
    correct: "Annual leave is 15 days since 2026",
    keywords: ["leave", "cuti"],
);
```

---

## 7. cURL (any system, any language)

```bash
# Start the MemoSprout API server first:
# pnpm api

# ── Capture a correction ──
curl -X POST http://localhost:3456/correct \
  -H "Content-Type: application/json" \
  -d '{
    "wrong": "Annual leave is 12 days",
    "correct": "Annual leave is 15 days since January 2026",
    "keywords": ["leave", "cuti", "annual"],
    "source": "HR Policy v3.2",
    "domain": "rag-chat"
  }'

# ── Get corrections for a query ──
curl -X POST http://localhost:3456/context \
  -H "Content-Type: application/json" \
  -d '{"query": "How many leave days do I get?"}'

# Response:
# {
#   "corrections": [...],
#   "context": "Important corrections...\n- Do NOT say \"Annual leave is 12 days\"..."
# }

# ── Check an answer ──
curl -X POST http://localhost:3456/check \
  -H "Content-Type: application/json" \
  -d '{"answer": "You get 12 days of annual leave"}'

# Response:
# {
#   "ok": false,
#   "corrections": [{"id": "corr_...", "correct": "15 days since January 2026", ...}]
# }

# ── List all corrections ──
curl http://localhost:3456/corrections

# ── List active corrections for a domain ──
curl "http://localhost:3456/corrections?status=active&domain=rag-chat"

# ── Get one correction ──
curl http://localhost:3456/corrections/corr_a1b2c3d4

# ── Remove (deprecate) a correction ──
curl -X DELETE http://localhost:3456/corrections/corr_a1b2c3d4

# ── Health check ──
curl http://localhost:3456/health
```

### Shell script: full chat flow with cURL + OpenAI

```bash
#!/bin/bash
# chat.sh — a complete chatbot with MemoSprout corrections, using only curl

MS_URL="http://localhost:3456"
QUESTION="$1"

# 1. Get corrections
CONTEXT=$(curl -s -X POST "$MS_URL/context" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUESTION\"}" | jq -r '.context // ""')

# 2. Call OpenAI
ANSWER=$(curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d "{
    \"model\": \"gpt-4o\",
    \"messages\": [
      {\"role\": \"system\", \"content\": \"You are a helpful assistant.\n\n$CONTEXT\"},
      {\"role\": \"user\", \"content\": \"$QUESTION\"}
    ]
  }" | jq -r '.choices[0].message.content')

# 3. Check the answer
CHECK=$(curl -s -X POST "$MS_URL/check" \
  -H "Content-Type: application/json" \
  -d "{\"answer\": $(echo "$ANSWER" | jq -Rs .)}")

OK=$(echo "$CHECK" | jq -r '.ok')
if [ "$OK" = "false" ]; then
  CORRECT=$(echo "$CHECK" | jq -r '.corrections[0].correct')
  echo "[Corrected] $CORRECT"
else
  echo "$ANSWER"
fi
```

---

## 8. Next.js App Router (server component)

```typescript
// app/api/chat/route.ts
import { MemoSprout } from "memosprout";
import OpenAI from "openai";

const ms = new MemoSprout("./corrections");
const openai = new OpenAI();

export async function POST(req: Request) {
  const { question } = await req.json();

  const { context } = await ms.context(question);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: `You are a helpful assistant.\n\n${context}` },
      { role: "user", content: question },
    ],
  });

  const answer = response.choices[0].message.content ?? "";
  const check = await ms.check(answer);

  return Response.json({
    answer,
    corrected: !check.ok,
    corrections: check.corrections,
  });
}
```

---

## 9. LangChain (Python)

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
import requests

MS_URL = "http://localhost:3456"

def answer(question: str) -> str:
    # Get corrections
    ctx = requests.post(f"{MS_URL}/context", json={"query": question}).json()
    context = ctx.get("context", "")

    # LangChain chain
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant.\n\n{context}"),
        ("human", "{question}"),
    ])
    chain = prompt | ChatOpenAI(model="gpt-4o")
    response = chain.invoke({"question": question, "context": context})

    # Check
    check = requests.post(f"{MS_URL}/check", json={"answer": response.content}).json()
    if not check.get("ok", True):
        return f"[Corrected] {check['corrections'][0]['correct']}"
    return response.content
```

---

## API Reference

| Endpoint | Method | Body / Query | Description |
|---|---|---|---|
| `/correct` | POST | `{ wrong, correct, keywords?, domain?, source?, role?, by? }` | Capture a correction |
| `/process` | POST | `{ message, previousAnswer, domain? }` | LLM detect + extract (correction/feedback/none) |
| `/context` | POST | `{ query, domain? }` | Get corrections for a query |
| `/check` | POST | `{ answer, domain? }` | Check an answer |
| `/feedback` | POST | `{ topic, message, domain?, by?, role? }` | Capture a feedback signal |
| `/feedback/summary` | GET | `?domain=` | Aggregate feedback by topic |
| `/report` | GET | `?domain=` | Outcome tracking report |
| `/refresh-staleness` | POST | — | Re-evaluate corrections for staleness |
| `/corrections` | GET | `?status=&domain=&keyword=` | List corrections |
| `/corrections/:id` | GET | — | Get one correction |
| `/corrections/:id/audit` | GET | — | Correction audit trail |
| `/corrections/:id/validate` | POST | — | Validate against oracle |
| `/corrections/:id/approve` | POST | — | Approve a correction |
| `/corrections/:id` | DELETE | — | Deprecate a correction |
| `/health` | GET | — | Health check |

Start the API server (with LLM config to enable `/process`):

```bash
MEMOSPROUT_LLM_PROVIDER=deepseek \
MEMOSPROUT_LLM_API_KEY=sk-... \
pnpm api                          # default: port 3456
```

Environment variables: `MEMOSPROUT_PORT`, `MEMOSPROUT_DIR`,
`MEMOSPROUT_LLM_PROVIDER`, `MEMOSPROUT_LLM_API_KEY`,
`MEMOSPROUT_LLM_BASE_URL`, `MEMOSPROUT_LLM_MODEL`.
