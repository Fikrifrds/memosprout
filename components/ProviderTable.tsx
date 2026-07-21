"use client";

import { useState } from "react";

const PROVIDERS: Array<[string, string, string]> = [
  ["openai", "gpt-4o-mini", "Best price/performance"],
  ["anthropic", "claude-haiku-4-5-20251001", "Cheapest Claude"],
  ["deepseek", "deepseek-chat", "Extremely cheap"],
  ["qwen", "qwen-turbo", "Strong multilingual"],
  ["kimi", "moonshot-v1-8k", "Moonshot"],
  ["xiaomi", "mimo-v2.5", "Xiaomi MiMo"],
  ["minimax", "MiniMax-Text-01", "Competitive pricing"],
  ["groq", "llama-3.1-8b-instant", "Free tier available"],
  ["togetherai", "meta-llama/Llama-3.1-8B-Instruct-Turbo", "Open models"],
  ["openrouter", "deepseek/deepseek-chat-v3-0324", "Hundreds of models"],
  ["ollama", "llama3.2", "Free, local, no API key"],
];

const PREVIEW_COUNT = 3;

export function ProviderTable() {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? PROVIDERS : PROVIDERS.slice(0, PREVIEW_COUNT);
  const hidden = PROVIDERS.length - PREVIEW_COUNT;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-2 py-2 font-medium">Provider</th>
              <th className="px-2 py-2 font-medium">Suggested model</th>
              <th className="px-2 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([provider, model, note]) => (
              <tr key={provider}>
                <td className="px-2 py-1.5 font-mono font-medium">{provider}</td>
                <td className="px-2 py-1.5 font-mono text-slate-600">{model}</td>
                <td className="px-2 py-1.5 text-slate-500">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-2 flex items-center gap-1.5 text-xs font-medium text-teal-800 transition hover:text-teal-900"
      >
        {expanded ? "Show fewer" : `Show ${hidden} more providers`}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
