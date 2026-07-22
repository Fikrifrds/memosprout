import { CodeBlock } from "@/components/CodeBlock";
import { GitHubLink } from "@/components/GitHubLink";
import { ProviderTable } from "@/components/ProviderTable";
import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Docs — MemoSprout",
  description: "Get started with MemoSprout: install, configure, and start capturing corrections.",
};

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

        {/* Install */}
        <Section id="install" title="1. Install">
          <CodeBlock>{`npm install memosprout`}</CodeBlock>
        </Section>

        {/* Configure */}
        <Section id="configure" title="2. Connect an LLM — optional">
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
          <CodeBlock>{`import { MemoSprout } from "memosprout";

const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "openai-compatible",   // or "anthropic-compatible"
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: "gpt-4o-mini",
  },
});`}</CodeBlock>
          <p>
            For these eleven named providers you can pass the name instead — <code>baseUrl</code>{" "}
            and a default <code>model</code> are filled in for you, e.g.{" "}
            <code>{`llm: { provider: "openai", apiKey: "..." }`}</code>:
          </p>
          <ProviderTable />
          <p className="text-xs text-slate-400">
            Custom or self-hosted endpoints: use provider <code>openai-compatible</code> or{" "}
            <code>anthropic-compatible</code> with an explicit <code>baseUrl</code> +{" "}
            <code>model</code>. Unsupported provider names throw a clear error listing valid
            options. Whichever provider you pick, responses and errors are normalized — see{" "}
            <code>docs/PROVIDERS.md</code> for per-provider setup, keys, and caveats.
          </p>
        </Section>

        {/* Use */}
        <Section id="use" title="3. Add to your app">
          <p>
            Three calls wrap the AI call you already have: one to learn from the message, one
            to enrich the prompt, one to check the answer before it goes out.
          </p>
          <CodeBlock>{`// ms is the instance from step 2 (or \`new MemoSprout("./corrections")\`)
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
  if (!check.ok) {
    // A correction is one fact. An answer may carry several, so regenerate
    // the whole answer with every returned correction and preserve the
    // parts that were already right.
    const verified = check.corrections.map((item) => \`- \${item.correct}\`).join("\\n");
    const revised = await callYourAI(
      userMessage,
      \`\${context}

Revise the entire draft below. Keep every unrelated fact, replace only
the stale claims, and return the complete answer.

Draft:
\${answer}

Verified facts:
\${verified}\`,
    );

    // The repair is not trusted until it passes the same gate.
    if (!(await ms.check(revised)).ok) throw new Error("Unsafe answer blocked");
    return revised;
  }
  return answer;
}`}</CodeBlock>
          <p>
            That&apos;s the whole loop: corrections are captured, gated, and delivered on
            every future turn.
          </p>
          <p>
            <code>check()</code> catches literal, reworded, and reordered wrong answers with
            no LLM involved. Enable <code>semanticCheck: true</code> to also catch paraphrases
            and translations, at the cost of one LLM call per check:
          </p>
          <CodeBlock>{`const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: "gpt-4o-mini",
  },
  semanticCheck: true,  // catches "twelve days of yearly vacation"
});`}</CodeBlock>
        </Section>

        {/* Manual corrections */}
        <Section id="manual" title="4. Add corrections manually">
          <p>
            No LLM needed here. Use this for a review queue, an admin panel, or seeding known
            fixes — <code>role</code> decides whether it goes live immediately (
            <code>agent</code>, <code>admin</code>, <code>system</code>) or waits for approval
            (<code>customer</code>):
          </p>
          <CodeBlock>{`await ms.correct({
  wrong: "Refund takes 3 business days",
  correct: "Refund takes 5 business days since March 2026",
  keywords: ["refund", "processing"],
  source: "Refund Policy v4.1",
  role: "agent",
});`}</CodeBlock>
        </Section>

        {/* REST API */}
        <Section id="rest-api" title="5. Call it from Python, PHP, Go — optional">
          <p>
            Run the built-in REST API server and call it over HTTP — the full feature set,
            not a subset:
          </p>
          <CodeBlock>{`MEMOSPROUT_API_KEY=your-secret-key \\
MEMOSPROUT_LLM_PROVIDER=openai-compatible \\
MEMOSPROUT_LLM_BASE_URL=https://api.openai.com/v1 \\
MEMOSPROUT_LLM_API_KEY=your-llm-key \\
MEMOSPROUT_LLM_MODEL=gpt-4o-mini \\
pnpm api        # http://127.0.0.1:3456`}</CodeBlock>
          <CodeBlock>{`import requests, os

BASE = "http://127.0.0.1:3456"
HEAD = {"Authorization": f"Bearer {os.environ['MEMOSPROUT_API_KEY']}"}

requests.post(f"{BASE}/correct", headers=HEAD, json={
    "wrong": "Refund takes 3 business days",
    "correct": "Refund takes 5 business days",
})

ctx = requests.post(f"{BASE}/context", headers=HEAD,
                    json={"query": "how long is a refund?"}).json()`}</CodeBlock>
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
            and need approval. LLM-extracted corrections also wait for approval by default,
            because model confidence is not source validation, and prompts treat user text as
            data rather than instructions. Only an explicit <code>approvalRequired: false</code>{" "}
            enables confidence-based auto-activation; reserve that for a trusted input channel.
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

        <footer className="mt-12 border-t border-slate-200 py-8 text-center">
          <p className="text-xs text-slate-400">
            Deeper reference lives in the repository: <code>docs/PROVIDERS.md</code> (every LLM
            provider), <code>docs/ARCHITECTURE.md</code> (internals),{" "}
            <code>docs/INTEGRATION_EXAMPLES.md</code> (frameworks and other languages).
          </p>
          <div className="mt-4 flex justify-center">
            <GitHubLink />
          </div>
        </footer>
      </main>
    </>
  );
}
