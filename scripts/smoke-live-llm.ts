/**
 * Live LLM smoke test for semanticCheck() and processMessage().
 * Needs OPENAI_API_KEY in .env (or MEMOSPROUT_LLM_API_KEY + provider).
 *
 *   pnpm tsx scripts/smoke-live-llm.ts
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoSprout } from "@/lib/index";

try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env"); // Node >= 20.12
  } else {
    const { readFileSync } = await import("node:fs");
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch {
  // .env optional; env vars may already be set.
}

// Flexible config: any OpenAI-compatible endpoint works with just a base
// URL + API key (+ optional model id). Named providers are a shortcut.
const apiKey = process.env.MEMOSPROUT_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("No OPENAI_API_KEY or MEMOSPROUT_LLM_API_KEY found. Aborting.");
  process.exit(1);
}
const baseUrl = process.env.MEMOSPROUT_LLM_BASE_URL;
const provider = process.env.MEMOSPROUT_LLM_PROVIDER ?? (baseUrl ? undefined : "openai");
const model =
  process.env.MEMOSPROUT_LLM_MODEL ?? (provider === "openai" ? "gpt-4o-mini" : undefined);

let failures = 0;
function assert(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const dir = await mkdtemp(join(tmpdir(), "memosprout-live-"));
const ms = new MemoSprout(dir, {
  llm: { provider, baseUrl, apiKey, model },
  semanticCheck: true,
});

console.log(`Provider: ${provider ?? baseUrl}, model: ${model ?? "(provider default)"}\n`);

await ms.correct({
  wrong: "Annual leave is 12 days",
  correct: "Annual leave is 15 days since 2026",
  keywords: ["annual", "leave"],
  source: "SK-045",
});

// 1. Lexical path still works (no LLM needed).
const lexical = await ms.check("Sure! Annual leave is 12 days per year.");
assert("lexical: literal wrong answer blocked", !lexical.ok);

// 2. Semantic path: paraphrased/translated wrong answer, no shared phrasing.
const paraphrased = await ms.check(
  "Employees are entitled to twelve days of yearly vacation.",
);
assert("semantic: paraphrased wrong answer blocked", !paraphrased.ok);

const translated = await ms.check("Cuti tahunan karyawan adalah 12 hari.");
assert("semantic: translated (Indonesian) wrong answer blocked", !translated.ok);

// 3. Correct answers must NOT be blocked.
const correctAnswer = await ms.check("Annual leave is 15 days since 2026.");
assert("semantic: corrected answer passes", correctAnswer.ok);

const denial = await ms.check(
  "Some people think annual leave is twelve days, but that is wrong — it is 15 days.",
);
assert("semantic: denial of the wrong claim passes", denial.ok, denial.ok ? "" : "flagged a denial");

// 4. processMessage extraction end to end.
const processed = await ms.processMessage(
  "No, that's outdated — refunds take 5 business days since March 2026, see Refund Policy v4.1.",
  "Refunds take 3 business days.",
);
assert(
  "processMessage: classified as correction",
  processed.type === "correction",
  `type=${processed.type}, confidence=${processed.confidence}`,
);
assert("processMessage: correction saved", processed.correctionSaved !== null);

const none = await ms.processMessage("Thanks, that helps!", "Refunds take 5 business days.");
assert("processMessage: 'thanks' classified as none", none.type === "none", `type=${none.type}`);

await rm(dir, { recursive: true, force: true });

console.log(failures === 0 ? "\nAll live checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
