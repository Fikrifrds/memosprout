/**
 * Preflight probe: one trivial call per configured provider, so the matrix
 * knows which endpoints are operational before spending a full run on them.
 *
 *   pnpm tsx eval/provider-matrix/preflight.ts
 *
 * Prints provider/model labels and error categories only.
 */
import { callLLM } from "@/lib/llm/provider";

import { categorizeError, loadProviders, type ProviderEntry } from "@/eval/provider-matrix/providers";

export interface ProbeResult {
  id: string;
  provider: string;
  model: string;
  operational: boolean;
  latencyMs: number | null;
  errorCategory: string | null;
  /** How many attempts it took. >1 means the endpoint is flaky. */
  attempts: number;
}

/** Attempts before an endpoint is declared unavailable. */
const PROBE_ATTEMPTS = 3;

/**
 * A single failed call is not evidence that a provider is down. Dropping a
 * provider on one flake would quietly shrink the matrix and overstate the
 * health of whatever remains, so the probe retries and reports the count.
 */
export async function probe(entry: ProviderEntry): Promise<ProbeResult> {
  const label = { id: entry.id, provider: entry.provider, model: entry.model };
  let lastCategory: string | null = null;

  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const response = await callLLM(entry.config, [
        { role: "system", content: "Reply with exactly one word." },
        { role: "user", content: "Say READY." },
      ]);
      if (response.content.trim().length === 0) {
        lastCategory = "empty_response";
      } else {
        return { ...label, operational: true, latencyMs: Date.now() - started, errorCategory: null, attempts: attempt };
      }
    } catch (error) {
      lastCategory = categorizeError(error);
    }
    if (attempt < PROBE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { ...label, operational: false, latencyMs: null, errorCategory: lastCategory, attempts: PROBE_ATTEMPTS };
}

export async function probeAll(entries: ProviderEntry[]): Promise<ProbeResult[]> {
  return Promise.all(entries.map((entry) => probe(entry)));
}

if (process.argv[1]?.endsWith("preflight.ts")) {
  const entries = loadProviders();
  console.log(`Configured providers: ${entries.length}\n`);
  for (const result of await probeAll(entries)) {
    console.log(
      `  ${result.id.padEnd(38)} ${result.operational ? "operational" : "UNAVAILABLE"}` +
        `  ${result.latencyMs ?? "-"}ms  attempts=${result.attempts}` +
        `${result.errorCategory ? `  [${result.errorCategory}]` : ""}`,
    );
  }
}
