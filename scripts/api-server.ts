import { MemoSprout } from "@/lib/index";
import { createApiServer } from "@/lib/api/server";

const directory = process.env.MEMOSPROUT_DIR ?? "corrections";
const port = Number(process.env.MEMOSPROUT_PORT ?? 3456);

// LLM config for the /process endpoint (correction detection + extraction).
// Optional — the API works without it, but /process requires it.
const llm = process.env.MEMOSPROUT_LLM_API_KEY
  ? {
      provider: process.env.MEMOSPROUT_LLM_PROVIDER,
      baseUrl: process.env.MEMOSPROUT_LLM_BASE_URL,
      apiKey: process.env.MEMOSPROUT_LLM_API_KEY,
      model: process.env.MEMOSPROUT_LLM_MODEL,
    }
  : undefined;

const ms = new MemoSprout(directory, { llm });
createApiServer(ms, port);
