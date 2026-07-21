import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Docs — MemoSprout",
  description: "Get started with MemoSprout: install, configure, and start capturing corrections.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-slate-100 pt-8 first:border-0 first:pt-0">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Get started</h1>
        <p className="mt-2 text-slate-600">
          MemoSprout captures corrections to AI outputs and delivers them to future interactions.
          Fix a mistake once — every future answer improves.
        </p>

        {/* Install */}
        <Section id="install" title="1. Install">
          <Code>{`npm install memosprout`}</Code>
        </Section>

        {/* Configure */}
        <Section id="configure" title="2. Configure your LLM provider">
          <p>
            MemoSprout uses your LLM to detect and extract corrections automatically. Pick any
            provider:
          </p>
          <Code>{`import { MemoSprout } from "memosprout";

const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
});`}</Code>
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
                {[
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
                ].map(([provider, model, note]) => (
                  <tr key={provider}>
                    <td className="px-2 py-1.5 font-mono font-medium">{provider}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-600">{model}</td>
                    <td className="px-2 py-1.5 text-slate-500">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Custom or self-hosted endpoints: use provider <code>openai-compatible</code> or{" "}
            <code>anthropic-compatible</code> with an explicit <code>baseUrl</code> +{" "}
            <code>model</code>. Unsupported provider names throw a clear error listing valid
            options. Whichever provider you pick, responses and errors are normalized — see{" "}
            <code>docs/PROVIDERS.md</code> for per-provider setup, keys, and caveats.
          </p>
        </Section>

        {/* Use */}
        <Section id="use" title="3. Add to your chatbot">
          <Code>{`async function handleChat(userMessage: string, previousAIAnswer: string) {
  // MemoSprout auto-detects corrections and feedback.
  // "No, it's 15 days, not 12" → correction saved automatically.
  // "My refund seems too low"  → feedback signal for your team.
  // "Thank you"               → ignored.
  const result = await ms.processMessage(userMessage, previousAIAnswer);

  // Get relevant corrections for the AI's context
  const { context } = await ms.context(userMessage);

  // Call your AI with context injected into the system prompt
  const answer = await callYourAI(userMessage, context);

  // Check the answer before sending
  const check = await ms.check(answer);
  if (!check.ok) return check.corrections[0].correct;
  return answer;
}`}</Code>
          <p>That&apos;s it. Corrections are captured, validated, and delivered automatically.</p>
          <p>
            <code>check()</code> catches literal, reworded, and reordered wrong answers out of
            the box. Enable <code>semanticCheck: true</code> to also catch paraphrases and
            translations via your LLM:
          </p>
          <Code>{`const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
  semanticCheck: true,  // catches "twelve days of yearly vacation"
});`}</Code>
        </Section>

        {/* Manual corrections */}
        <Section id="manual" title="4. Add corrections manually (optional)">
          <p>Agents and admins can add corrections directly:</p>
          <Code>{`await ms.correct({
  wrong: "Refund takes 3 business days",
  correct: "Refund takes 5 business days since March 2026",
  keywords: ["refund", "processing"],
  source: "Refund Policy v4.1",
  role: "agent",
});`}</Code>
        </Section>

        {/* REST API */}
        <Section id="rest-api" title="5. Use from Python, PHP, or any language">
          <p>
            Run the built-in REST API server and call it over HTTP — the full feature set,
            not a subset:
          </p>
          <Code>{`MEMOSPROUT_API_KEY=your-secret-key \\
MEMOSPROUT_LLM_PROVIDER=deepseek \\
MEMOSPROUT_LLM_API_KEY=sk-... \\
pnpm api        # http://127.0.0.1:3456`}</Code>
          <Code>{`import requests, os

BASE = "http://127.0.0.1:3456"
HEAD = {"Authorization": f"Bearer {os.environ['MEMOSPROUT_API_KEY']}"}

requests.post(f"{BASE}/correct", headers=HEAD, json={
    "wrong": "Refund takes 3 business days",
    "correct": "Refund takes 5 business days",
})

ctx = requests.post(f"{BASE}/context", headers=HEAD,
                    json={"query": "how long is a refund?"}).json()`}</Code>
          <p>
            The server binds to <code>127.0.0.1</code> and refuses to bind anywhere else
            without an API key. All endpoints except <code>/health</code> require the key,
            requests are rate limited (120/min per key by default), and bodies are capped at
            1&nbsp;MB.
          </p>
        </Section>

        {/* What happens */}
        <Section id="what-happens" title="What happens behind the scenes">
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="font-medium">Corrections</span> from agents/admins go live
              automatically. From customers, they wait for approval.
            </li>
            <li>
              <span className="font-medium">Feedback</span> (complaints without a clear answer)
              is stored as a signal for your team, never as a correction.
            </li>
            <li>
              <span className="font-medium">Stale corrections</span> are detected automatically
              (source document changed, conflicting correction, or expired).
            </li>
            <li>
              <span className="font-medium">Storage</span> is plain Markdown files in the
              directory you chose. No database, no cloud. Git-versionable. Writes are atomic
              and serialized, so concurrent requests never corrupt a file.
            </li>
            <li>
              <span className="font-medium">Answer checking</span> catches literal, reworded,
              and reordered wrong answers without an LLM — and paraphrases and translations
              when <code>semanticCheck</code> is on. If the LLM fails, it falls back to
              lexical matching and logs a warning rather than blocking your answers.
            </li>
          </ul>
        </Section>

        {/* FAQ */}
        <Section id="faq" title="FAQ">
          <h3 className="font-semibold">Does MemoSprout store customer data?</h3>
          <p>
            No. Corrections are general knowledge (e.g., &quot;refund takes 5 days&quot;), not
            personal data. No chat logs or session data is stored.
          </p>

          <h3 className="font-semibold">Can customers poison the knowledge base?</h3>
          <p>
            Guardrails prevent it. Manual corrections from customers are always saved as{" "}
            <code>suggested</code> and need approval. LLM-extracted corrections auto-activate
            only above a 0.8 confidence threshold — set <code>approvalRequired: true</code> to
            require manual approval for everything.
          </p>

          <h3 className="font-semibold">Does it require an LLM?</h3>
          <p>
            Only for automatic detection. You can add corrections manually via{" "}
            <code>ms.correct()</code> or the CLI without any LLM.
          </p>

          <h3 className="font-semibold">Is the REST API secured?</h3>
          <p>
            Yes. The API server binds to localhost by default and refuses to expose itself
            without <code>MEMOSPROUT_API_KEY</code> set. Requests authenticate via{" "}
            <code>Authorization: Bearer</code> or <code>x-api-key</code>.
          </p>

          <h3 className="font-semibold">Where does data live?</h3>
          <p>
            On your server. Markdown files in a directory. No cloud, no external calls except
            to your own LLM provider.
          </p>
        </Section>

        <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          For full documentation (architecture, adapters, REST API, CLI, framework examples),
          see the Markdown docs in the repository.
        </footer>
      </main>
    </>
  );
}
