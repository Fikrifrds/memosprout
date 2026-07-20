"use client";

import { useState } from "react";

const presetEvidence = {
  idempotency: {
    scenario: "idempotency",
    task: "Implement the payment webhook handler.",
    failedSummary:
      "The handler double-charged on a duplicate callback and downgraded a paid order on a late pending event.",
    humanCorrection:
      "Use the provider event id as the idempotency key and protect terminal order states.",
  },
  "soft-delete": {
    scenario: "soft-delete",
    task: "Implement user deletion.",
    failedSummary: "The service hard-deleted the user record, losing the audit trail.",
    humanCorrection: "Soft-delete by setting deletedAt; never hard-delete a user record.",
  },
} as const;

type ScenarioKey = keyof typeof presetEvidence;

interface ExtractResponse {
  source?: string;
  sproutId?: string;
  content?: {
    title: string;
    trigger: string;
    procedure: string[];
    prohibitedActions: string[];
  };
  guidance?: string;
  error?: { code: string; message: string };
}

export function LiveExtractor() {
  const [scenario, setScenario] = useState<ScenarioKey>("idempotency");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<ExtractResponse | null>(null);

  async function extract() {
    setState("loading");
    setResult(null);
    try {
      const response = await fetch("/api/sprouts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(presetEvidence[scenario]),
      });
      const data = (await response.json()) as ExtractResponse;
      setResult(data);
      setState(data.error ? "error" : "done");
    } catch (error) {
      setResult({
        error: {
          code: "network",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      setState("error");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Live extraction (requires OPENAI_API_KEY)
      </p>

      <div className="mb-4 flex items-center gap-3">
        <select
          value={scenario}
          onChange={(event) => setScenario(event.target.value as ScenarioKey)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="idempotency">idempotency</option>
          <option value="soft-delete">soft-delete</option>
        </select>
        <button
          type="button"
          onClick={extract}
          disabled={state === "loading"}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {state === "loading" ? "Extracting…" : "Extract with GPT-5.6"}
        </button>
      </div>

      {state === "error" && result?.error && (
        <p className="text-sm text-red-600">{result.error.message}</p>
      )}

      {state === "done" && result?.content && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Extracted sprout
            </p>
            <p className="font-medium">{result.content.title}</p>
            <p className="text-sm text-slate-600">{result.content.trigger}</p>
            <ol className="mt-1 list-inside list-decimal text-sm text-slate-600">
              {result.content.procedure.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {result.guidance && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Compiled guidance (AGENTS.md)
              </p>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-700">
                {result.guidance}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
