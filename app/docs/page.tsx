import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Docs — MemoSprout",
  description:
    "Complete guide: installation, core API, customer support mode, LLM providers, storage, CLI, and framework examples.",
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

const nav = [
  { id: "how-it-works", label: "How it works" },
  { id: "installation", label: "Installation" },
  { id: "quickstart", label: "Quick start" },
  { id: "core-api", label: "Core API" },
  { id: "customer-support", label: "Customer support mode" },
  { id: "confidence", label: "Confidence & approval" },
  { id: "staleness", label: "Staleness protection" },
  { id: "llm-config", label: "LLM configuration" },
  { id: "providers", label: "Supported providers" },
  { id: "storage", label: "Storage format" },
  { id: "cli", label: "CLI" },
  { id: "rest-api", label: "REST API" },
  { id: "frameworks", label: "Framework examples" },
  { id: "adapters", label: "Domain adapters" },
  { id: "faq", label: "FAQ" },
];

export default function DocsPage() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto flex max-w-5xl gap-8 px-4 py-10">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-8 space-y-1 text-sm">
            <p className="mb-3 font-semibold text-slate-400 uppercase tracking-wide text-xs">
              Documentation
            </p>
            {nav.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded px-2 py-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 space-y-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
            <p className="mt-2 text-slate-600">
              MemoSprout captures corrections to AI outputs, validates them, and delivers them
              to every future interaction. Fix a mistake once — every future answer improves.
            </p>
          </div>

          {/* How it works */}
          <Section id="how-it-works" title="How it works">
            <p>
              Every AI system makes mistakes. Humans fix them. But the fix usually lives and
              dies in one session — the same mistake happens again tomorrow.
            </p>
            <p>MemoSprout closes this loop in four steps:</p>
            <ol className="list-inside list-decimal space-y-2">
              <li>
                <span className="font-medium">Capture</span> — when AI gets it wrong and a human
                fixes it, MemoSprout records what was wrong and what is right. Detection and
                extraction are done by an LLM (any provider), so it works in any language.
              </li>
              <li>
                <span className="font-medium">Validate</span> — corrections are checked before
                going live. High-confidence corrections from trusted sources (agents, admins)
                activate automatically. Low-confidence or customer-sourced corrections wait for
                approval. Conflicting corrections are quarantined.
              </li>
              <li>
                <span className="font-medium">Store</span> — validated corrections are saved as
                Markdown files with YAML frontmatter. Human-readable, git-versionable, portable.
                No database, no vendor lock-in.
              </li>
              <li>
                <span className="font-medium">Deliver</span> — when a similar query appears,
                relevant corrections are injected into the AI&apos;s context. Known-wrong answers
                are blocked before reaching the user.
              </li>
            </ol>
            <p>
              Corrections are <span className="font-medium">general knowledge</span>, not
              per-user data. A correction about refund policy applies to all future queries about
              refunds — no customer data is shared between sessions.
            </p>
          </Section>

          {/* Installation */}
          <Section id="installation" title="Installation">
            <Code>{`npm install memosprout
# or
pnpm add memosprout`}</Code>
            <p>
              Requirements: Node.js 20+. TypeScript recommended but not required. No API key
              needed for the core library — only for LLM-powered correction detection.
            </p>
          </Section>

          {/* Quick start */}
          <Section id="quickstart" title="Quick start">
            <p>
              Configure once with your LLM provider. MemoSprout handles correction detection,
              extraction, and saving automatically:
            </p>
            <Code>{`import { MemoSprout } from "memosprout";

const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
});

async function handleChat(userMessage: string, previousAIAnswer: string) {
  // 1. Auto-detect + extract corrections (LLM-powered, any language)
  //    User: "No, annual leave is 15 days since 2026, check SK-045"
  //    → LLM extracts: wrong, correct, source, keywords, confidence
  //    → High confidence → correction goes live automatically
  const result = await ms.processMessage(userMessage, previousAIAnswer);

  // 2. Get relevant corrections for the AI's context
  const { context } = await ms.context(userMessage);

  // 3. Call your AI with \`context\` injected into the system prompt
  const answer = await callYourAI(userMessage, context);

  // 4. Check the answer before sending
  const check = await ms.check(answer);
  if (!check.ok) return check.corrections[0].correct;
  return answer;
}`}</Code>
            <p>
              Agents and admins can also add corrections manually via{" "}
              <code>ms.correct()</code> — see Core API below.
            </p>
          </Section>

          {/* Core API */}
          <Section id="core-api" title="Core API">
            <h3 className="font-semibold">
              <code>new MemoSprout(directory?, options?)</code>
            </h3>
            <p>
              Create an instance. Corrections are stored as Markdown files in{" "}
              <code>directory</code> (default: <code>&quot;./corrections&quot;</code>).
            </p>
            <Code>{`const ms = new MemoSprout("./corrections", {
  llm: { provider: "deepseek", apiKey: "sk-..." },
  approvalRequired: false,       // default: smart confidence routing
  autoActivateThreshold: 0.5,    // default: 0.5
});`}</Code>

            <h3 className="font-semibold">
              <code>ms.correct(options)</code>
            </h3>
            <p>Capture a correction. Returns the CorrectionRecord.</p>
            <Code>{`await ms.correct({
  wrong: "the wrong answer",        // required
  correct: "the correct answer",    // required
  domain: "support",                // optional, default "general"
  keywords: ["refund", "policy"],   // optional trigger keywords
  source: "Policy Doc v3",          // optional source reference
  sourceHash: "sha256:abc...",      // optional hash for staleness detection
  expiresAt: "2026-12-31T00:00:00Z", // optional TTL
  role: "agent",                    // "agent"|"admin" = trusted, "customer" = untrusted
  by: "agent-sarah",                // optional submitter ID
});`}</Code>
            <p>
              <span className="font-medium">Role-based trust:</span> corrections from{" "}
              <code>agent</code> or <code>admin</code> roles activate automatically. Corrections
              from <code>customer</code> role are saved as <code>suggested</code> and require
              approval via <code>ms.approve(id)</code>.
            </p>

            <h3 className="font-semibold">
              <code>ms.context(query, domain?)</code>
            </h3>
            <p>
              Find active corrections relevant to a query. Returns{" "}
              <code>{"{ corrections, context, staleSkipped }"}</code>. Inject{" "}
              <code>context</code> into your AI&apos;s system prompt or RAG pipeline.
            </p>

            <h3 className="font-semibold">
              <code>ms.check(answer, domain?)</code>
            </h3>
            <p>
              Check an AI-generated answer against known-wrong patterns. Returns{" "}
              <code>{"{ ok, corrections }"}</code>. If <code>ok</code> is false, use{" "}
              <code>corrections[0].correct</code> to fix the answer.
            </p>

            <h3 className="font-semibold">
              <code>ms.processMessage(userMessage, previousAIAnswer, domain?)</code>
            </h3>
            <p>
              All-in-one: uses the configured LLM to detect if the user message is a correction,
              extracts the structured fields, saves it, and returns context for the next AI call.
              Requires LLM configuration.
            </p>
            <Code>{`const result = await ms.processMessage(
  "No, it should be 15 days, check SK-045",  // user message
  "Annual leave is 12 days",                  // previous AI answer
);
// {
//   isCorrection: true,
//   confidence: 0.95,
//   correctionSaved: { ... },
//   correctionStatus: "active",
//   context: "Important corrections: ...",
//   staleSkipped: 0,
// }`}</Code>

            <h3 className="font-semibold">
              <code>ms.approve(correctionId)</code>
            </h3>
            <p>
              Approve a <code>suggested</code> or <code>quarantined</code> correction. Sets
              status to <code>active</code>.
            </p>

            <h3 className="font-semibold">
              <code>ms.list(filter?) / ms.get(id) / ms.remove(id)</code>
            </h3>
            <p>
              List corrections (filter by status, domain, keyword), get one by ID, or deprecate
              (soft delete).
            </p>
          </Section>

          {/* Customer support mode */}
          <Section id="customer-support" title="Customer support mode">
            <p>
              In customer support, customers often give wrong information, make assumptions, or
              describe their specific case (not a general policy issue). MemoSprout handles this
              with a two-tier system:
            </p>
            <h3 className="font-semibold">Tier 1: Customer feedback (signals, not corrections)</h3>
            <Code>{`// Customer complains — this is a SIGNAL, not a correction
await ms.feedback({
  topic: "refund amount",
  message: "My refund should be $200 not $150!",
  by: "customer-12345",
  role: "customer",
  domain: "support",
});

// Check for patterns: are many customers reporting the same issue?
const summary = await ms.feedbackSummary("support");
// [{ topic: "refund amount", count: 7, latestMessage: "...", ... }]
// 7 customers reported the same issue → flag to support team`}</Code>
            <h3 className="font-semibold">Tier 2: Agent correction (trusted source)</h3>
            <Code>{`// Support agent confirms and provides the real correction
await ms.correct({
  wrong: "Refund is partial (50%)",
  correct: "Refund is full amount since March 2026",
  role: "agent",           // trusted → auto-active
  source: "Refund Policy v4.1",
  domain: "support",
  keywords: ["refund", "amount"],
});`}</Code>
            <p>
              <span className="font-medium">Key rules:</span>
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                Customer feedback is stored as a <code>signal</code>, never as a correction. It
                does not affect AI answers.
              </li>
              <li>
                When multiple customers report the same issue, the summary flags it for the
                support team.
              </li>
              <li>
                Only agents/admins can create corrections that affect AI answers.
              </li>
              <li>
                Corrections are <span className="font-medium">general knowledge</span> — they
                apply to all future queries on the same topic. No customer-specific data is
                shared between sessions.
              </li>
            </ul>
          </Section>

          {/* Confidence & approval */}
          <Section id="confidence" title="Confidence & approval">
            <p>
              When using LLM-powered detection (<code>processMessage</code>), each correction
              gets a confidence score (0.0–1.0). The system routes based on confidence:
            </p>
            <Code>{`// Smart default (no bottleneck):
// confidence >= 0.5 → auto-active
// confidence <  0.5 → saved as "suggested", needs approval

// Strict mode:
const ms = new MemoSprout("./corrections", {
  llm: { ... },
  autoActivateThreshold: 0.8,  // only very confident corrections auto-activate
});

// Full approval mode (high-security):
const ms = new MemoSprout("./corrections", {
  llm: { ... },
  approvalRequired: true,  // ALL corrections need manual approval
});

// Admin approves:
await ms.approve("corr_abc123");`}</Code>
            <p>
              Regardless of confidence, all safety nets remain active: conflict detection,
              source tracking, TTL, and admin deprecation.
            </p>
          </Section>

          {/* Staleness protection */}
          <Section id="staleness" title="Staleness protection">
            <p>
              Company documents change. A correction that was true yesterday may be wrong today.
              MemoSprout protects against stale corrections with three mechanisms:
            </p>
            <ul className="list-inside list-disc space-y-2">
              <li>
                <span className="font-medium">Source hash tracking</span> — record the hash of
                the source document when the correction is created. If the document changes, the
                correction is quarantined automatically.
              </li>
              <li>
                <span className="font-medium">Conflict detection</span> — if a new correction
                contradicts an active one, the old correction is quarantined.
              </li>
              <li>
                <span className="font-medium">TTL (time-to-live)</span> — corrections can have an
                expiry date. After expiry, they are quarantined for re-validation.
              </li>
            </ul>
            <Code>{`// Source tracking
await ms.correct({
  wrong: "12 days", correct: "15 days",
  source: "HR-Policy.pdf",
  sourceHash: "sha256:abc...",
  expiresAt: "2026-12-31T00:00:00Z",
});

// Provide a hash checker for automatic staleness detection
ms.setSourceHashProvider({
  async getCurrentHash(sourceRef) {
    return hashFile(sourceRef);  // your implementation
  },
});

// Periodic staleness check
const { checked, stale } = await ms.refreshStaleness();
// { checked: 42, stale: 3 }`}</Code>
          </Section>

          {/* LLM configuration */}
          <Section id="llm-config" title="LLM configuration">
            <p>
              MemoSprout uses your LLM provider for correction detection and extraction. You
              configure it once — MemoSprout does not have its own model.
            </p>
            <Code>{`const ms = new MemoSprout("./corrections", {
  llm: {
    provider: "deepseek",     // known provider name
    apiKey: "sk-...",         // your API key
    // model: "deepseek-chat",  // optional override
    // baseUrl: "https://...",  // optional custom endpoint
  },
});`}</Code>
            <p>
              For custom or self-hosted models, provide <code>baseUrl</code> and{" "}
              <code>model</code> directly. Any OpenAI-compatible API works.
            </p>
          </Section>

          {/* Providers */}
          <Section id="providers" title="Supported providers">
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
                    ["openai", "gpt-4o-mini", "Best price/performance. Reliable JSON output."],
                    ["anthropic", "claude-3-5-haiku-20241022", "Cheapest Claude. Fast and reliable."],
                    ["deepseek", "deepseek-chat", "Extremely cheap. Good structured extraction."],
                    ["qwen", "qwen-turbo", "Cheapest tier. Strong multilingual support."],
                    ["kimi", "moonshot-v1-8k", "8k context sufficient for extraction."],
                    ["minimax", "MiniMax-Text-01", "Single model, competitive pricing."],
                    ["groq", "llama-3.1-8b-instant", "Fastest and cheapest on Groq. Free tier."],
                    ["together", "Llama-3.1-8B-Instruct-Turbo", "Cheap and fast for extraction."],
                    ["openrouter", "deepseek/deepseek-chat-v3-0324", "Access hundreds of models."],
                    ["ollama", "llama3.2", "Free, local, no API key needed."],
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
            <p>
              All providers use OpenAI-compatible API format except{" "}
              <code>anthropic</code> (native Messages API). Custom providers work with any
              OpenAI-compatible endpoint via <code>baseUrl</code>.
            </p>
          </Section>

          {/* Storage */}
          <Section id="storage" title="Storage format">
            <p>
              Corrections are plain Markdown files with YAML frontmatter. No database. No cloud.
              No vendor lock-in.
            </p>
            <Code>{`corrections/
├── corr_a1b2c3d4.md     # correction files
├── corr_e5f6g7h8.md
└── feedback/            # customer feedback signals
    ├── fb_i9j0k1l2.json
    └── fb_m3n4o5p6.json`}</Code>
            <p>
              You can <code>git diff</code> your corrections, edit them in any text editor, or
              copy them between projects. They are yours.
            </p>
          </Section>

          {/* CLI */}
          <Section id="cli" title="CLI">
            <Code>{`npx memosprout init
npx memosprout add --domain support --wrong "3 day refund" --correct "5 day refund"
npx memosprout list --status active
npx memosprout validate corr_abc123
npx memosprout activate corr_abc123
npx memosprout check "refund policy" "Refund takes 3 days"
npx memosprout match "How long does refund take?"`}</Code>
          </Section>

          {/* REST API */}
          <Section id="rest-api" title="REST API">
            <p>
              Start the REST API server to use MemoSprout from any language (Python, PHP, Go,
              etc.):
            </p>
            <Code>{`pnpm api   # starts at http://localhost:3456`}</Code>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Endpoint</th>
                    <th className="px-2 py-2 font-medium">Method</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ["/correct", "POST", "Capture a correction"],
                    ["/context", "POST", "Get corrections for a query"],
                    ["/check", "POST", "Check an answer"],
                    ["/corrections", "GET", "List corrections"],
                    ["/corrections/:id", "GET", "Get one correction"],
                    ["/corrections/:id", "DELETE", "Deprecate a correction"],
                    ["/health", "GET", "Health check"],
                  ].map(([endpoint, method, desc]) => (
                    <tr key={`${method}-${endpoint}`}>
                      <td className="px-2 py-1.5 font-mono">{endpoint}</td>
                      <td className="px-2 py-1.5 font-mono font-medium">{method}</td>
                      <td className="px-2 py-1.5 text-slate-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Framework examples */}
          <Section id="frameworks" title="Framework examples">
            <p>
              See{" "}
              <a
                href="https://github.com/Fikrifrds/memosprout/blob/main/docs/INTEGRATION_EXAMPLES.md"
                className="text-emerald-700 underline"
              >
                docs/INTEGRATION_EXAMPLES.md
              </a>{" "}
              for complete, copy-paste-ready examples with OpenAI, Claude, LangChain, Vercel AI
              SDK, Express, React, Python, PHP, and cURL.
            </p>
          </Section>

          {/* Domain adapters */}
          <Section id="adapters" title="Domain adapters">
            <p>
              The core engine is domain-agnostic. For advanced use cases, implement a domain
              adapter to customize capture, validation, delivery, and protection:
            </p>
            <Code>{`import type { DomainAdapter } from "memosprout";

class MyAdapter implements DomainAdapter {
  readonly domain = "my-domain";
  async captureCorrection(input: unknown) { ... }
  createOracle(correction: CorrectionRecord) { ... }
  buildContext(corrections: CorrectionRecord[]) { ... }
  checkOutput(output: unknown) { ... }
}`}</Code>
            <p>
              Built-in: <code>CodingAdapter</code> (validates against test suites, blocks edits
              to guarded files). Community adapters can be added for any domain.
            </p>
          </Section>

          {/* FAQ */}
          <Section id="faq" title="FAQ">
            <h3 className="font-semibold">Does MemoSprout store customer data?</h3>
            <p>
              No. Corrections are general knowledge (e.g., &quot;refund takes 5 days&quot;), not
              per-customer data. No chat logs, personal information, or session data is stored.
            </p>

            <h3 className="font-semibold">Do corrections from one customer affect another?</h3>
            <p>
              Corrections (from agents/admins) apply to all future queries on the same topic —
              that is the point. Customer feedback (signals) does not affect AI answers and is
              only visible to the support team via <code>feedbackSummary()</code>.
            </p>

            <h3 className="font-semibold">What if a correction becomes outdated?</h3>
            <p>
              Three safety nets: source hash tracking (detects document changes), conflict
              detection (new correction contradicts old one), and TTL (corrections expire). All
              stale corrections are quarantined automatically.
            </p>

            <h3 className="font-semibold">Can customers poison the knowledge base?</h3>
            <p>
              No. Customer input is stored as feedback signals, never as corrections. Only
              agents/admins can create corrections that affect AI answers. Even then, conflict
              detection and staleness protection provide additional safety.
            </p>

            <h3 className="font-semibold">Does MemoSprout require an LLM?</h3>
            <p>
              No. The core library (correct, context, check) works without any LLM. An LLM is
              only needed for automatic correction detection via{" "}
              <code>processMessage()</code>. You can capture corrections manually via{" "}
              <code>correct()</code> or the CLI.
            </p>

            <h3 className="font-semibold">Where does data live?</h3>
            <p>
              Entirely on your infrastructure. Corrections are Markdown files in a directory you
              specify. No cloud, no external API calls (except to your own LLM provider for
              detection). Open source — audit the code yourself.
            </p>
          </Section>

          <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
            memosprout — correct once. Improve every interaction. Open source, local-first, MIT
            license.
          </footer>
        </main>
      </div>
    </>
  );
}
