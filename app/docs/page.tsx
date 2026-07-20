import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Docs — MemoSprout",
  description: "How to use MemoSprout: the demo UI, the MCP server, and core concepts.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-700">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-2 text-slate-600">
          MemoSprout turns agent outcomes and human corrections into verified, portable knowledge
          that improves future AI-agent runs. This guide shows how to use it.
        </p>

        <Section title="Quick start">
          <p>Install dependencies, then start the demo UI:</p>
          <Code>{`pnpm install
pnpm dev`}</Code>
          <p>
            Open <span className="font-mono">http://localhost:3000</span>. The home page explains
            the product; the <span className="font-medium">Demo</span> walks the full loop; the{" "}
            <span className="font-medium">Dashboard</span> shows scenarios, sprouts, outcomes, and
            routing.
          </p>
        </Section>

        <Section title="The demo">
          <p>
            The demo is a four-step walkthrough: a failed run, the Candidate Sprout compiled from
            the correction, the baseline-versus-protected evaluation, and a fresh run that improves.
            It runs on seeded evidence by default (no API key required).
          </p>
          <p>
            On the Candidate step, the live extractor compiles a sprout from a correction using
            GPT-5.6. This requires an <span className="font-mono">OPENAI_API_KEY</span> in your
            environment or <span className="font-mono">.env</span>.
          </p>
        </Section>

        <Section title="MCP server">
          <p>
            MemoSprout serves validated knowledge to any agent over the Model Context Protocol.
            Start the stdio server:
          </p>
          <Code>{`pnpm mcp:serve`}</Code>
          <p>It exposes two tools:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="font-mono">get_task_context</span> — returns the validated guidance
              relevant to the files a task touches (<span className="font-mono">filePaths</span>)
              and/or context attributes (<span className="font-mono">context</span>).
            </li>
            <li>
              <span className="font-mono">check_tool_call</span> — the reflex gate: returns
              allow/block/warn for a planned edit, so an agent cannot tamper with guarded files.
            </li>
          </ul>
          <p>
            Connect it from any MCP-capable client. For Claude Code, add it to your MCP settings
            pointing at <span className="font-mono">pnpm mcp:serve</span>. The server loads its
            sprouts from a file-backed store (
            <span className="font-mono">.memosprout-local/sprout-store.json</span> by default;
            override with <span className="font-mono">MEMOSPROUT_SPROUT_STORE</span>), seeding the
            demo sprouts on first run.
          </p>
        </Section>

        <Section title="Core concepts">
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="font-medium">Sprout</span> — a narrow, validated unit of knowledge:
              trigger, procedure, prohibited actions, and scope.
            </li>
            <li>
              <span className="font-medium">Scenario</span> — a deterministic task with a held-out
              oracle. Four coding scenarios ship today: idempotency, soft-delete, tenant-isolation,
              and secret-handling.
            </li>
            <li>
              <span className="font-medium">Oracle</span> — the independent judge of correctness
              (an acceptance test suite for code; a structured-check or rubric-judge oracle for
              other domains).
            </li>
            <li>
              <span className="font-medium">Outcome Ledger</span> — records outcomes per scenario
              and measures the lift a sprout provides.
            </li>
          </ul>
        </Section>

        <Section title="Commands">
          <Code>{`pnpm dev                      # demo UI + landing + dashboard + docs
pnpm mcp:serve                # MCP stdio server (get_task_context, check_tool_call)
pnpm test                     # full test suite
pnpm lint && pnpm typecheck   # quality gates
pnpm convergence:design:verify # verify the convergence experiment design`}</Code>
        </Section>
      </main>
    </>
  );
}
