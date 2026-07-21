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
          MemoSprout captures corrections to AI outputs and delivers them to future
          interactions. Fix a mistake once, and it stops coming back.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Steps 1, 3 and 4 are all you need. Step 2 adds automatic correction detection, and
          step 5 is for calling MemoSprout from a language other than JavaScript.
        </p>

        {/* Install */}
        <Section id="install" title="1. Install">
          <Code>{`npm install memosprout`}</Code>
        </Section>

        {/* Configure */}
        <Section id="configure" title="2. Connect an LLM (optional)">
          <p>
            An LLM lets MemoSprout detect corrections inside ordinary chat messages and
            extract the fields for you. Skip this and everything still works — you just add
            corrections yourself with <code>ms.correct()</code> (step 4) or the CLI.
          </p>
          <p>
            For any endpoint, pick the wire format it speaks — <code>openai-compatible</code>{" "}
            or <code>anthropic-compatible</code> — and supply a base URL, an API key, and a
            model id (all three required):
          </p>
          <Code>{`import { MemoSprout } from "memosprout";

const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "openai-compatible",   // or "anthropic-compatible"
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: "gpt-4o-mini",
  },
});`}</Code>
          <p>
            For these eleven named providers you can pass the name instead — <code>baseUrl</code>{" "}
            and a default <code>model</code> are filled in for you, e.g.{" "}
            <code>{`llm: { provider: "openai", apiKey: "..." }`}</code>:
          </p>
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
          <p>
            Three calls wrap the AI call you already have: one to learn from the message, one
            to enrich the prompt, one to check the answer before it goes out.
          </p>
          <Code>{`// ms is the instance from step 2 (or \`new MemoSprout("./corrections")\`)
async function handleChat(userMessage: string, previousAIAnswer: string) {
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
          <p>
            That&apos;s the whole loop: corrections are captured, gated, and delivered on
            every future turn.
          </p>
          <p>
            <code>check()</code> catches literal, reworded, and reordered wrong answers with
            no LLM involved. Enable <code>semanticCheck: true</code> to also catch paraphrases
            and translations, at the cost of one LLM call per check:
          </p>
          <Code>{`const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: "gpt-4o-mini",
  },
  semanticCheck: true,  // catches "twelve days of yearly vacation"
});`}</Code>
        </Section>

        {/* Manual corrections */}
        <Section id="manual" title="4. Add corrections manually">
          <p>
            No LLM needed here. Use this for a review queue, an admin panel, or seeding known
            fixes — <code>role</code> decides whether it goes live immediately (
            <code>agent</code>, <code>admin</code>, <code>system</code>) or waits for approval
            (<code>customer</code>):
          </p>
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
MEMOSPROUT_LLM_PROVIDER=openai-compatible \\
MEMOSPROUT_LLM_BASE_URL=https://api.openai.com/v1 \\
MEMOSPROUT_LLM_API_KEY=your-llm-key \\
MEMOSPROUT_LLM_MODEL=gpt-4o-mini \\
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
          <h3 className="font-semibold">What does MemoSprout store?</h3>
          <p>
            Corrections themselves are general knowledge (e.g. &quot;refund takes 5
            days&quot;), not personal data, and no chat transcripts are kept. One thing to
            know: when <code>context()</code> serves a correction, the query text that
            triggered it is recorded in <code>outcomes.json</code> so you can see which
            corrections actually get used. If your queries can contain personal data, treat
            that file as you would any log — it stays on your server either way.
          </p>

          <h3 className="font-semibold">Can customers poison the knowledge base?</h3>
          <p>
            Several guardrails make it hard. Corrections submitted with{" "}
            <code>role: &quot;customer&quot;</code> are always saved as <code>suggested</code>{" "}
            and need approval. Corrections the LLM extracts from a message go live only above
            a 0.8 confidence threshold, and prompts treat user text as data rather than
            instructions. If your input comes from the public and you want no automatic path
            at all, set <code>approvalRequired: true</code> so every correction waits for a
            human.
          </p>

          <h3 className="font-semibold">Does it require an LLM?</h3>
          <p>
            No. Capturing, storing, matching, and blocking all work without one. An LLM only
            adds two things: detecting corrections inside ordinary messages (
            <code>processMessage()</code>) and semantic answer checking.
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
          Deeper reference lives in the repository:{" "}
          <code>docs/PROVIDERS.md</code> (every LLM provider),{" "}
          <code>docs/ARCHITECTURE.md</code> (internals),{" "}
          <code>docs/INTEGRATION_EXAMPLES.md</code> (frameworks and other languages).
        </footer>
      </main>
    </>
  );
}
