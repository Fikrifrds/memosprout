import Link from "next/link";

import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "MemoSprout — Correct once. Improve every agent.",
  description:
    "MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs.",
};

const steps = [
  {
    title: "Capture the correction",
    body: "When an agent gets it wrong and a human fixes it, MemoSprout records the failed run and the correction as evidence.",
  },
  {
    title: "Compile a sprout",
    body: "The Experience Compiler distills the correction into a narrow Candidate Sprout: trigger, procedure, prohibited actions, and scope.",
  },
  {
    title: "Validate it",
    body: "The Validation Engine tests the sprout against a held-out oracle, comparing runs with and without it before anything is trusted.",
  },
  {
    title: "Deliver it everywhere",
    body: "Validated sprouts are served to any agent through MCP (get_task_context) and rendered to AGENTS.md or CLAUDE.md.",
  },
];

const capabilities = [
  { name: "Validation Engine", detail: "Scenario-agnostic oracle, isolation, and false-block controls." },
  { name: "Experience Compiler", detail: "Correction to Candidate Sprout, exported as Open Knowledge Format." },
  { name: "Artifact Compiler", detail: "Sprout to enforcement artifact specification with an integrity-checked manifest." },
  { name: "MCP Delivery", detail: "get_task_context and a reflex gate, served over a stdio MCP server." },
  { name: "Outcome Ledger", detail: "Domain outcome metrics and sprout-impact measurement." },
  { name: "Cost–Intelligence Router", detail: "Route tasks to the cheapest model that stays reliable." },
  { name: "Team Control Plane", detail: "Sprout lifecycle: validate, release, canary, rollback, audit." },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4">
        <section className="py-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-600">
            Agent-learning infrastructure
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Correct once. Improve every agent.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            MemoSprout turns agent outcomes and human corrections into verified, portable
            knowledge — so a fix made once improves every future run, across models and tools.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/demo"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Try the demo
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              View dashboard
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Read the docs
            </Link>
          </div>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            The model is not your advantage
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            AI models are becoming interchangeable — today&apos;s frontier is tomorrow&apos;s
            commodity. The durable advantage is not which model you run. It is the verified
            knowledge your organization accumulates and delivers to its agents.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            A bigger context window gives an agent a larger memory. MemoSprout gives it the right
            knowledge — validated, portable, and delivered exactly when it is needed. The
            difference between remembering everything and knowing what is true.
          </p>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">The problem</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            AI agents repeat the same project-specific mistakes because human corrections are
            trapped in a single session. Memory stores a note; MemoSprout attaches evidence,
            validates it, and delivers it exactly when an agent needs it.
          </p>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <p className="text-sm font-semibold text-emerald-600">Step {index + 1}</p>
                <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">Capabilities</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <div key={capability.name} className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">{capability.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{capability.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
          MemoSprout — verified, portable knowledge for AI agents.
        </footer>
      </main>
    </>
  );
}
