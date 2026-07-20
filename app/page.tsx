import Link from "next/link";

import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "MemoSprout — Correct once. Improve every agent.",
  description:
    "MemoSprout turns human corrections into verified, portable knowledge that makes every " +
    "agent run better — and makes what a run costs far more predictable.",
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
    title: "Deliver it just-in-time",
    body: "One MCP tool, get_task_context, deterministically selects the few sprouts relevant to the task at hand — and a reflex gate blocks edits that break guarded rules.",
  },
];

const economics = [
  {
    title: "Fewer wasted attempts",
    body: "Across 16 measured runs on a multi-file repository, agents given the sprout succeeded on the first attempt every time. Without it, one run in eight got lost exploring and had to start over.",
  },
  {
    title: "Knowledge replaces re-exploration",
    body: "A convention discovered once is delivered as a few sentences — not rediscovered by re-reading dozens of files every new session.",
  },
  {
    title: "Cheaper models, routed safely",
    body: "When a sprout makes a cheap model reliable on a task class, the Cost–Intelligence Router can send that task to a cheaper model instead of always reaching for the frontier.",
  },
];

const capabilities = [
  { name: "Validation Engine", detail: "Scenario-agnostic oracle, isolation, and false-block controls." },
  { name: "Experience Compiler", detail: "Correction to Candidate Sprout, exported as Open Knowledge Format." },
  { name: "Artifact Compiler", detail: "Sprout to enforcement artifact specification with an integrity-checked manifest." },
  { name: "MCP Delivery", detail: "get_task_context and a reflex gate, served over a stdio MCP server." },
  {
    name: "Outcome Ledger",
    detail: "Measures sprout impact on quality (success lift) and on cost (tokens-to-success, baseline versus protected).",
  },
  {
    name: "Cost–Intelligence Router",
    detail: "Routes each task to the cheapest model that stays reliable — sprouts expand what a cheap model can do.",
  },
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
            MemoSprout turns human corrections into verified, portable knowledge. Fix a mistake
            once and every future run improves — across models and tools — without the agent
            rediscovering your project from scratch every session.
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
            The same mistake, every session
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            The agent gets it wrong, you correct it, it runs again. Tomorrow a fresh session
            rediscovers the same project conventions by re-reading the same files — and can
            make the same mistake again, because your correction lived and died in one chat.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            The root cause is not model intelligence. The smartest model still cannot guess your
            project&apos;s local facts — that users are soft-deleted, that every query must be
            tenant-scoped, that the API client is generated from a schema. Local knowledge must
            be supplied. MemoSprout supplies it, validated, exactly when it is needed.
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

        <section className="border-t border-slate-200 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">The proof</h2>
          <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-8">
            <div>
              <p className="text-5xl font-bold tabular-nums text-slate-400">0/3</p>
              <p className="mt-1 text-sm text-slate-500">cheap model, no sprout</p>
            </div>
            <p className="text-3xl text-slate-300">→</p>
            <div>
              <p className="text-5xl font-bold tabular-nums text-emerald-600">3/3</p>
              <p className="mt-1 text-sm text-slate-500">same model, one validated sprout</p>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-slate-600">
            In a live scored experiment, a single validated sprout took a cheap model from 0/3
            to 3/3 on a knowledge-dependent task. The model did not get smarter — it got the
            knowledge it was missing. A frontier model scored 0/3 on the same task without the
            sprout, which is the point: this is a knowledge gap, not an intelligence gap.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-500">
            Three trials per condition on one scenario. A clean result on a small sample —
            enough to demonstrate the mechanism, not enough to generalize from.
          </p>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Predictable runs, not just cheaper ones
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            We measured tokens-to-success — every token from task start until the work passes
            its oracle, retries included — across 16 live runs on a multi-file repository whose
            conventions are spread across a dozen files.
          </p>
          <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-3xl font-bold tabular-nums">−11%</p>
              <p className="mt-1 text-sm font-medium">median tokens to finish</p>
              <p className="mt-2 text-sm text-slate-600">
                A real saving, but a modest one — this alone will not change your bill.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-3xl font-bold tabular-nums text-emerald-600">−81%</p>
              <p className="mt-1 text-sm font-medium">spread between runs</p>
              <p className="mt-2 text-sm text-slate-600">
                The bigger effect: run-to-run variation collapsed from ±4,865 tokens to ±911.
              </p>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-slate-600">
            What burns a monthly quota is not the average run — it is the run that gets lost.
            Without guidance, one run in eight exhausted its turn budget exploring and had to
            start over, costing nearly twice the median. Every run given the sprout finished on
            the first attempt.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {economics.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-500">
            Measured on gpt-5.4-mini, 8 runs per condition, one scenario. A sample this size
            shows a direction, not a guarantee — the raw per-run evidence ships with the
            repository so you can check it, and larger runs across more scenarios are the next
            step.
          </p>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            The model is not your advantage
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            You will switch models again in a few months — everyone does. Vendor-locked memory
            dies with every migration. Sprouts are portable knowledge (Open Knowledge Format):
            they survive every model switch, and every correction you have ever made keeps
            paying off on whatever model comes next.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            A bigger context window gives an agent a larger memory. MemoSprout gives it the right
            knowledge — validated, portable, and delivered exactly when it is needed. The
            difference between remembering everything and knowing what is true.
          </p>
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
          <span className="lowercase">memosprout</span> — verified, portable knowledge for AI
          agents.
        </footer>
      </main>
    </>
  );
}
