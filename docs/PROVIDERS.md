# Supported LLM Providers

MemoSprout supports a **fixed list of providers**. An unsupported provider
name throws an `LLMError` at construction time with the list of valid
options — it never silently falls back.

```typescript
const ms = new MemoSprout("./corrections", {
  llm: { provider: "<name>", apiKey: "..." },  // model & baseUrl optional
});
```

For the REST API server, the same settings come from env:
`MEMOSPROUT_LLM_PROVIDER`, `MEMOSPROUT_LLM_API_KEY`, `MEMOSPROUT_LLM_MODEL`,
`MEMOSPROUT_LLM_BASE_URL` (override only).

## Response consistency — how divergent providers are normalized

Whatever the provider, `callLLM()` always returns the same shape and fails
the same way:

- **Return shape**: always `{ content: string, model: string }`.
- **Two wire formats** handled internally: OpenAI-compatible
  (`/chat/completions`) and Anthropic (`/messages`). You never deal with the
  difference.
- **`response_format` fallback**: providers/models that reject OpenAI's
  `response_format: json_object` (400) are retried automatically without it.
- **Markdown-fenced JSON**: models that wrap JSON in ``` fences or prose
  (common on Qwen/Kimi/open models) are handled by `extractJsonPayload()`
  before parsing.
- **Errors are always `LLMError`** with an actionable message — wrong API
  key (401/403), unknown model (404/400 with the model name spelled out),
  rate limit (429), timeout (with the configured `timeoutMs`), unreachable
  endpoint, or an empty/unexpected response body. No raw fetch crashes.
- **Retry**: one automatic retry on 429/5xx/network/timeout. 4xx errors are
  not retried.
- **Timeout**: 30 s default, configurable via `llm.timeoutMs`.

## Providers

### openai
- **Base URL**: `https://api.openai.com/v1` · **API format**: openai-compatible
- **Default model**: `gpt-4o-mini` (also the recommended cheap choice)
- **API key**: https://platform.openai.com/api-keys
- Most reliable JSON output. `baseUrl` override is allowed on this provider
  for proxies or self-hosted OpenAI-compatible gateways.

### anthropic
- **Base URL**: `https://api.anthropic.com/v1` · **API format**: anthropic (`/messages`)
- **Default model**: `claude-haiku-4-5-20251001` (also the cheap/fast choice)
- **API key**: https://console.anthropic.com/settings/keys
- Uses Anthropic's native message format internally (`x-api-key` +
  `anthropic-version` headers, `max_tokens` capped at 1024) — normalized to
  the same `{ content, model, usage }` result. `usage` is normalized and is
  `null` only when the endpoint omits or returns an invalid usage block.

### deepseek
- **Base URL**: `https://api.deepseek.com/v1` · **API format**: openai-compatible
- **Default model**: `deepseek-chat`
- **API key**: https://platform.deepseek.com/api_keys
- Extremely cheap; good structured extraction quality.

### qwen (Alibaba DashScope)
- **Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1` · **API format**: openai-compatible
- **Default model**: `qwen-plus` · **Cheap**: `qwen-turbo`
- **API key**: https://dashscope.console.aliyun.com/apiKey
- Uses DashScope's *compatible mode* endpoint — the native DashScope API is
  not supported. Strong multilingual (incl. Indonesian) extraction.
- Qwen Cloud Token Plans expose both an OpenAI-compatible and an
  Anthropic-compatible base URL; use the OpenAI-compatible one here (or
  `provider: "anthropic-compatible"` with the other).

### kimi (Moonshot)
- **Base URL**: `https://api.moonshot.cn/v1` · **API format**: openai-compatible
- **Default model**: `moonshot-v1-8k`
- **API key**: https://platform.moonshot.cn/console/api-keys
- 8k context is plenty for extraction. Some models return fenced JSON —
  handled automatically.

### xiaomi (MiMo)
- **Base URL**: `https://api.xiaomimimo.com/v1` · **API format**: openai-compatible
- **Default model**: `mimo-v2.5` · **Higher quality**: `mimo-v2.5-pro`
- **API key & docs**: https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call
- Also publishes an Anthropic-compatible endpoint (`.../anthropic`) — usable
  via `provider: "anthropic-compatible"` with that baseUrl. Token Plan
  subscriptions get a dedicated regional base URL; pass it as a `baseUrl`
  override.

### minimax
- **Base URL**: `https://api.minimax.chat/v1` · **API format**: openai-compatible
- **Default model**: `MiniMax-Text-01`
- **API key**: https://platform.minimaxi.com/user-center/basic-information/interface-key

### groq
- **Base URL**: `https://api.groq.com/openai/v1` · **API format**: openai-compatible
- **Default model**: `llama-3.3-70b-versatile` · **Cheap/fast**: `llama-3.1-8b-instant`
- **API key**: https://console.groq.com/keys
- Fastest inference; free tier available.

### togetherai (Together AI)
- **Base URL**: `https://api.together.xyz/v1` · **API format**: openai-compatible
- **Default model**: `meta-llama/Llama-3.3-70B-Instruct-Turbo` · **Cheap**: `meta-llama/Llama-3.1-8B-Instruct-Turbo`
- **API key**: https://api.together.xyz/settings/api-keys
- Model ids include the org prefix (`meta-llama/...`). A wrong id returns a
  clear "model not found" `LLMError`.

### openrouter
- **Base URL**: `https://openrouter.ai/api/v1` · **API format**: openai-compatible
- **Default model**: `deepseek/deepseek-chat-v3-0324`
- **API key**: https://openrouter.ai/settings/keys
- One key, hundreds of models (`vendor/model` ids). Useful for trying
  providers without separate accounts.

### ollama (local)
- **Base URL**: `http://localhost:11434/v1` · **API format**: openai-compatible
- **Default model**: `llama3.2` · **No API key needed** (pass any non-empty string)
- **Install**: https://ollama.com
- Free and local. A ~3B model is sufficient for extraction; expect weaker
  JSON discipline than hosted models (fence-stripping handles most of it).

## Custom / self-hosted endpoints

Arbitrary provider names are rejected. For your own gateway (LiteLLM,
vLLM, an internal proxy, ...), pick the wire format explicitly with one of
the two custom providers — both **require** `baseUrl` and `model`:

```typescript
// Endpoint speaking OpenAI's format (POST <baseUrl>/chat/completions)
llm: {
  provider: "openai-compatible",
  baseUrl: "https://your-gateway.internal/v1",
  apiKey: "...",
  model: "your-model-id",
}

// Endpoint speaking Anthropic's format (POST <baseUrl>/messages, x-api-key)
llm: {
  provider: "anthropic-compatible",
  baseUrl: "https://your-proxy.internal/v1",
  apiKey: "...",
  model: "your-model-id",
}
```

Omitting `baseUrl` or `model` on these providers throws an `LLMError`
immediately. A `baseUrl` whose format does not match fails with a clear
`LLMError` at request time, not a silent crash. (A `baseUrl` override on a
named provider like `openai` also still works and keeps that provider's
format and default model.)

## Verifying a provider works

```bash
MEMOSPROUT_LLM_PROVIDER=qwen MEMOSPROUT_LLM_API_KEY=sk-... pnpm test:live
```

Runs 8 live checks (lexical block, paraphrase + translation semantic block,
false-positive guards, extraction) against the real provider.

## Verification status

Two different things are worth separating: whether the transport works, and
whether the model returns an answer you can put in front of a user. A
provider can pass the first and fail the second.

| Provider | Model tested | Transport | Usable prose | Date |
|---|---|---|---|---|
| openai | gpt-4o-mini | pass | pass | 2026-07-21 |
| anthropic | claude-haiku-4-5-20251001 | pass | pass | 2026-07-21 |
| qwen | qwen3.8-max-preview | pass | pass | 2026-07-21 |
| openrouter | openai/gpt-4o-mini | pass | pass | 2026-07-21 |
| xiaomi | mimo-v2.5 | pass | **see note** | 2026-07-22 |
| togetherai | openai/gpt-oss-120b | **30/45 failed** | **see note** | 2026-07-22 |

### Some models answer with a schema instead of prose

`mimo-v2.5` and `openai/gpt-oss-120b` frequently replied with a structure
rather than the sentence they were asked for:

```
{"reasoning":"...","answer":"A standard depot shift is 8 hours."}
{"response":"A standard depot shift is 8 hours."}
{"action":"polite_decline","action_input":"The standard depot shift is 8 hours."}
{"finalA standard depot shift is 8 hours.
```

The correct fact is usually in there, but the string MemoSprout returns is
the whole structure, so `check()` and anything rendering the answer see the
scaffold.

**There is no envelope to strip.** Across 45 replies, `mimo-v2.5` produced
twenty different shapes — `reasoning`/`answer`, `response`, `content`/`role`,
`point`, `primary_answer`/`supporting_references`, and more — plus nine that
were not valid JSON at all. Unwrapping would mean guessing which key holds
the answer, and a wrong guess silently shows the user the wrong text. The
library therefore never alters the content; `LLMResponse.looksStructured`
reports the shape so a caller can react.

This is a property of the model, not of the provider or the transport. Both
endpoints also serve ordinary instruct models that reply in prose — the
suggested `togetherai` model in the README is `Llama-3.1-8B-Instruct-Turbo`,
not `gpt-oss-120b`. If you use a reasoning or agent-tuned model, either
instruct it explicitly to answer in plain prose, or extract the field
yourself before passing the text to `check()`.

`togetherai/openai/gpt-oss-120b` also failed 30 of 45 evaluation
repetitions with server errors, independently of the wrapper issue.

Both wire formats are covered: `anthropic` exercises the `/messages` path,
the rest exercise the OpenAI-compatible path. Remaining providers
(deepseek, kimi, minimax, groq, ollama) use the same OpenAI-compatible
code path as the verified ones but have not been run against a live key.
