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
                  ["anthropic", "claude-3-5-haiku-20241022", "Cheapest Claude"],
                  ["deepseek", "deepseek-chat", "Extremely cheap"],
                  ["qwen", "qwen-turbo", "Strong multilingual"],
                  ["groq", "llama-3.1-8b-instant", "Free tier available"],
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
            Also supported: kimi, minimax, together. Custom endpoints via baseUrl.
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
              directory you chose. No database, no cloud. Git-versionable.
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
            No. Customer input is stored as feedback signals, never as corrections. Only
            agents/admins can create corrections that affect AI answers.
          </p>

          <h3 className="font-semibold">Does it require an LLM?</h3>
          <p>
            Only for automatic detection. You can add corrections manually via{" "}
            <code>ms.correct()</code> or the CLI without any LLM.
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
