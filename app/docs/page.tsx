import type { Metadata } from "next";

import { CodeBlock } from "@/components/CodeBlock";
import { GitHubLink } from "@/components/GitHubLink";
import { ProviderTable } from "@/components/ProviderTable";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

const description =
  "Install MemoSprout, connect an LLM, and start capturing corrections to your " +
  "AI's answers. Covers retrieval, the output gate, semantic retrieval, LLM " +
  "providers, the REST API, and framework integrations.";

export const metadata: Metadata = {
  // The layout template appends " — MemoSprout".
  title: "Docs",
  description,
  alternates: { canonical: "/docs" },
  openGraph: {
    type: "article",
    title: "Docs — MemoSprout",
    description,
    url: "/docs",
  },
  twitter: {
    card: "summary_large_image",
    title: "Docs — MemoSprout",
    description,
  },
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
            That&apos;s the whole loop: corrections are captured, gated, and retrieved for
            later turns that match them.
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
          <p>
            The mirror image on the read side is <code>semanticRetrieval: true</code>. Retrieval
            is lexical by default, so a correction filed under &quot;uniform allowance&quot; is
            not found by a question about &quot;workwear&quot;. With it on, a query that lexical
            cannot answer — or answers only weakly — falls back to embedding similarity. On a
            24-correction corpus, overall accuracy goes from <strong>33% to 93%</strong>, and
            wrong corrections served drop from 4 to 1:
          </p>
          <CodeBlock>{`const ms = new MemoSprout("./corrections", {
  llm: { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
  semanticRetrieval: true,
});

await ms.context("How much can I claim for workwear?"); // -> match`}</CodeBlock>
          <p>
            Lexical runs first, and a confident hit is kept as-is, so queries that already worked
            cost nothing. Correction vectors are embedded once and cached on disk. With OpenAI{" "}
            <code>text-embedding-3-small</code> at $0.02 per 1M tokens, a million lexical misses
            costs roughly <strong>$0.60</strong>.
          </p>
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

        {/* CLI */}
        <Section id="cli" title="5. Review the queue from the terminal">
          <p>
            Corrections from customers, and those an LLM extracted from a conversation, are
            stored as <code>suggested</code> and are <strong>not served</strong> until a human
            approves them. The CLI is how you work that queue without writing code:
          </p>
          <CodeBlock>{`npx memosprout report                    # how big is the queue, and how old?
npx memosprout list --status suggested   # see what is waiting
npx memosprout approve corr_a1b2c3d4     # clear one`}</CodeBlock>
          <p>
            <code>report</code> leads with the queue whenever anything is waiting, and stays
            quiet when it is empty:
          </p>
          <CodeBlock>{`2 correction(s) waiting for approval
  oldest: 34 day(s) ago
  corr_e11982a8776fe177
  approve with: memosprout approve <id>`}</CodeBlock>
          <p>
            <code>approve</code> is the human sign-off path. <code>activate</code> is a different
            thing — the last step of the oracle path, which only accepts an already-
            <code>validated</code> correction. Nothing notifies you that the queue is filling up,
            so if you accept corrections from untrusted sources, check it on a schedule.
          </p>
        </Section>

        {/* REST API */}
        <Section id="rest-api" title="6. Call it from Python, PHP, Go — optional">
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
            <li>
              <span className="font-medium">Retrieval</span> is lexical by default — keywords,
              entities, and the correction&apos;s own words, with inflection and reordering.
              Turn on <code>semanticRetrieval</code> to add an embedding fallback for
              paraphrased questions.
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
            No — the default is no LLM. Capturing, storing, matching, and blocking all work
            without one. An LLM adds four conveniences: detecting corrections inside ordinary
            messages (<code>processMessage()</code>), semantic answer checking (
            <code>semanticCheck</code>), generating synonym triggers so a paraphrased
            question still finds its correction (<code>generateAliases</code>), and embedding-based
            retrieval for paraphrased questions (<code>semanticRetrieval</code>). The last one
            needs an <em>embedding</em> model rather than a chat model, configured separately —
            point it at a local Ollama instance and that path stays free and offline too.
          </p>

          <h3 className="font-semibold">
            A source document gets updated — what happens to a correction based on the old
            version?
          </h3>
          <p>
            It stops being served. Give a correction a fingerprint of its source (
            <code>sourceHash</code>) when you capture it, and tell MemoSprout how to fetch the
            current fingerprint with <code>setSourceHashProvider</code>. On every{" "}
            <code>context()</code> and <code>check()</code> the hash is recomputed; if the
            document changed, the correction is <em>quarantined</em> — dropped from retrieval,
            not deleted — because once its basis shifts it may have become right, wrong, or
            redundant, and serving it anyway would be worse than serving nothing. A correction
            also stops on an <code>expiresAt</code> date, when a newer correction supersedes it,
            or when you <code>remove()</code> it. Without a <code>sourceHash</code>, the
            source-change check has nothing to compare against and does not run.
          </p>

          <h3 className="font-semibold">
            I already have agent memory — MEMORY.md, CLAUDE.md, Cursor rules, a system prompt.
            How does MemoSprout fit with it?
          </h3>
          <p>
            They do different jobs and compose in one prompt. A memory file is static,
            whole-file, always-on context with no relevance, no gate, and no staleness — every
            line is loaded every turn and nothing checks whether it is still true. MemoSprout is
            the opposite on each axis: it holds <em>corrections</em>, retrieves only the ones
            relevant to the question, gates them before serving, and quarantines them when their
            source changes. Keep durable, always-true context in the memory file; put facts that
            get corrected, change over time, or need verification in MemoSprout. Because{" "}
            <code>context()</code> returns a string, you inject it alongside the memory file:{" "}
            <code>[memory, context].filter(Boolean).join(&quot;\n\n&quot;)</code>. The one thing
            to avoid is writing the same fact into both — if they ever disagree, the model sees
            two authoritative answers with no way to choose.
          </p>

          <h3 className="font-semibold">How do I know it&apos;s working?</h3>
          <p>
            <code>report()</code> shows corrections being served and blocked, and — the honest
            part — the two ways MemoSprout fails <em>silently</em>, without raising an error.
          </p>
          <p>
            <strong>Questions that found nothing.</strong>{" "}
            <code>queriesWithoutMatch</code> with <code>unmatchedQueries</code>: questions that
            found no correction although the domain had some. A high count usually means your
            trigger keywords do not match how users phrase things. Add the words from that list,
            enable <code>generateAliases</code>, or — if those queries are paraphrases rather
            than missing vocabulary — turn on <code>semanticRetrieval</code>.
          </p>
          <p>
            <strong>Corrections nobody approved.</strong> <code>pendingApprovals</code> counts
            corrections waiting on a human. One that is never approved is never served, so a
            climbing number means knowledge is being captured and then dropped.{" "}
            <code>oldestPendingApprovalAt</code> is the sharper signal: three corrections filed
            this morning is a queue, three filed last quarter is an abandoned one. Nothing
            notifies you — poll it, or run <code>memosprout report</code>.
          </p>

          <h3 className="font-semibold">Is the REST API secured?</h3>
          <p>
            Yes. The API server binds to localhost by default and refuses to expose itself
            without <code>MEMOSPROUT_API_KEY</code> set. Requests authenticate via{" "}
            <code>Authorization: Bearer</code> or <code>x-api-key</code>.
          </p>

          <h3 className="font-semibold">
            My users ask questions in their own words and nothing is found. What do I do?
          </h3>
          <p>
            That is lexical retrieval&apos;s known limit: it matches trigger keywords, entities,
            and the words of the correction, so it handles inflection and reordering but cannot
            relate two different words for the same thing. Turn on{" "}
            <code>semanticRetrieval: true</code>. Lexical still runs first — free, instant, and
            precise on exact terms — and embeddings are consulted when it finds nothing, or finds
            only a weak match. On a 24-correction corpus with{" "}
            <code>text-embedding-3-small</code>, paraphrase recall went from{" "}
            <strong>8% to 83%</strong> and overall accuracy from <strong>33% to 93%</strong>.
          </p>
          <p>
            Precision improves as well — wrong corrections served fall from 4 of 30 to 1 — and
            that hinges on the word <em>weak</em>. Retrieval keeps a lexical answer only when it
            is confident: a phrase keyword, or a keyword with corroborating content. A bare
            single-keyword match is treated as a guess and re-checked against the embeddings,
            which is what stops &quot;what time does the office open?&quot; from returning a
            home-office allowance. An earlier version trusted any lexical hit and scored 83% —
            worse than using embeddings alone. Run <code>pnpm semantic:eval</code>; it prints the
            queries it got wrong, so you can tune <code>semanticRetrievalThreshold</code> against
            a corpus resembling yours. If the embedding provider is unreachable,{" "}
            <code>context()</code> logs a warning and falls back to the lexical result.
          </p>

          <h3 className="font-semibold">What does semantic retrieval cost?</h3>
          <p>
            Very little, because the expensive half is cached. Each correction is embedded once
            and stored in <code>embeddings.json</code>, keyed by a hash of its text, so editing a
            correction re-embeds it and nothing else does. Only the query is embedded per call,
            and only for queries lexical did not already answer. At OpenAI&apos;s $0.02 per 1M
            tokens for <code>text-embedding-3-small</code> and ~30 tokens a query, one million
            lexical misses costs about <strong>$0.60</strong>; indexing 1,000 corrections costs
            well under a cent. Next to the chat model that consumes the context, it is a rounding
            error.
          </p>

          <h3 className="font-semibold">Where does data live?</h3>
          <p>
            On your server. Markdown files in a directory, no cloud, no telemetry.
          </p>
          <p>
            Worth being precise here, because it is easy to assume otherwise: storing
            corrections, retrieving them, and blocking wrong answers involve{" "}
            <strong>no LLM and no network calls at all</strong>. That is the default — no API
            key required. An LLM only enters when you switch on one of the optional features (
            <code>processMessage()</code>, <code>semanticCheck</code>,{" "}
            <code>generateAliases</code>, <code>semanticRetrieval</code>), and then the only
            outbound calls go to the endpoint you configured.
          </p>
          <p>
            Of those, <code>semanticRetrieval</code> is the one that uploads correction content —
            comparing a query to a correction means embedding both. If corrections must not leave
            your infrastructure, point <code>embedding.baseUrl</code> at a local Ollama instance,
            or leave the feature off.
          </p>
        </Section>

        <SiteFooter
          extra={
            <>
              <p className="text-xs text-slate-400">
                Deeper reference lives in the repository: <code>docs/PROVIDERS.md</code> (every
                LLM provider), <code>docs/ARCHITECTURE.md</code> (internals),{" "}
                <code>docs/INTEGRATION_EXAMPLES.md</code> (frameworks and other languages).
              </p>
              <div className="mt-4 mb-6 flex justify-center">
                <GitHubLink />
              </div>
            </>
          }
        />
      </main>
    </>
  );
}
