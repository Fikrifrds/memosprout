import Link from "next/link";

import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "MemoSprout — Correct once. Improve every interaction.",
  description:
    "MemoSprout captures corrections to AI outputs, validates them, and delivers them to every " +
    "future interaction — so a mistake fixed once never happens again.",
};

const steps = [
  {
    title: "Capture the correction",
    body: "When AI gets it wrong and a human fixes it — in a chatbot, a code review, a report — MemoSprout records what was wrong and what is right.",
  },
  {
    title: "Validate it",
    body: "Not every correction is correct. The Validation Engine checks each one against a domain-specific oracle before it is trusted. Bad corrections are quarantined, not deployed.",
  },
  {
    title: "Store it as portable knowledge",
    body: "Validated corrections are stored as Markdown with structured metadata — human-readable, git-versionable, and portable across any AI platform.",
  },
  {
    title: "Deliver it just-in-time",
    body: "When a similar question or task appears, the relevant correction is injected into the AI's context — and known-wrong answers are blocked before they reach the user, including paraphrased and translated ones.",
  },
];

const capabilities = [
  {
    title: "Catches rewording, not just exact matches",
    body: "Blocking works on normalized, word-boundary matching plus token overlap — so reordered and repunctuated wrong answers are caught. Turn on semantic checking and paraphrases and translations are caught too, while already-corrected answers are never blocked by mistake.",
  },
  {
    title: "Eleven LLM providers, one interface",
    body: "OpenAI, Anthropic, DeepSeek, Qwen, Kimi, Xiaomi MiMo, MiniMax, Groq, Together AI, OpenRouter, and local Ollama — plus any OpenAI- or Anthropic-compatible endpoint. Every provider returns the same shape and the same actionable errors.",
  },
  {
    title: "Safe by default",
    body: "Customer corrections wait for approval. LLM-extracted corrections need high confidence to go live. Prompts treat user text as data, not instructions. Conflicting corrections are quarantined automatically.",
  },
  {
    title: "Works from any language",
    body: "A built-in REST API brings the full feature set to Python, PHP, Go, or anything that speaks HTTP — authenticated, rate limited, and bound to localhost unless you say otherwise.",
  },
];

const domains = [
  {
    name: "Enterprise chat & RAG",
    example:
      "User asks about leave policy, chatbot answers with outdated numbers. User corrects it once. Every future answer is right.",
  },
  {
    name: "Coding agents",
    example:
      "An agent edits a generated file directly. A reviewer corrects it. The agent never makes that mistake again — on any model.",
  },
  {
    name: "Finance & compliance",
    example:
      "An analyst catches a wrong tax rate in an AI-generated report. The correction is validated against current regulation and applied to all future reports.",
  },
  {
    name: "Customer support",
    example:
      "A supervisor corrects a refund timeline. The correction is verified against the latest SOP and delivered to every agent's suggested responses.",
  },
];

const principles = [
  {
    title: "Corrections are verified, not blindly trusted",
    body: "A user correction could be wrong or malicious. MemoSprout validates every correction against a domain-specific oracle — source documents, test suites, regulations — before it goes live.",
  },
  {
    title: "Your data never leaves your infrastructure",
    body: "MemoSprout runs locally. Corrections are stored as Markdown files on your server. No documents, chat logs, or sensitive data are sent anywhere. Open source — audit the code yourself.",
  },
  {
    title: "Domain-agnostic core, pluggable adapters",
    body: "The correction engine works the same way in every domain. What changes is the adapter: how corrections are captured, what validates them, and how they are delivered.",
  },
  {
    title: "Portable and open",
    body: "Corrections are Markdown files with YAML frontmatter — not locked in a database or a platform. Version them with git, move them between tools, use them with any AI system.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4">
        <section className="py-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-600">
            Open-source correction intelligence
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Correct once. Improve every interaction.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            AI makes mistakes. Humans fix them. But the fix lives and dies in one session —
            tomorrow, the same mistake happens again. MemoSprout captures corrections, validates
            them, and delivers them to every future interaction. Across any domain, any model,
            any platform.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/docs"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
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
            Your chatbot tells an employee that annual leave is 12 days. It has been 15 days
            since January. The employee corrects it — and the correction vanishes. Next week,
            another employee asks the same question and gets the same wrong answer.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            This happens everywhere: chatbots with stale knowledge, coding agents that repeat
            the same error, AI reports with outdated figures. The fix is always the same — a
            human corrects it — and the fix is always lost.
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
          <h2 className="text-center text-2xl font-bold tracking-tight">
            What you get
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <div
                key={capability.title}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-semibold">{capability.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{capability.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Any domain where AI meets human judgment
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {domains.map((domain) => (
              <div key={domain.name} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold">{domain.name}</h3>
                <p className="mt-2 text-sm text-slate-600">{domain.example}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-500">
            The core engine is domain-agnostic. Each domain plugs in an adapter that defines how
            corrections are captured, validated, and delivered. Build your own adapter for any
            domain.
          </p>
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">Principles</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {principles.map((principle) => (
              <div
                key={principle.title}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-semibold">{principle.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{principle.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Open source, local-first</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            MemoSprout is MIT-licensed and runs entirely on your infrastructure. Corrections are
            stored as Markdown files — human-readable, git-versionable, and portable. No data
            leaves your server. No vendor lock-in. Audit the code yourself.
          </p>
          <div className="mx-auto mt-6 max-w-md rounded-xl bg-slate-900 p-4 text-left">
            <code className="text-sm text-emerald-400">
              npm install memosprout
            </code>
          </div>
        </section>

        <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
          <span className="lowercase">memosprout</span> — correct once. Improve every
          interaction.
        </footer>
      </main>
    </>
  );
}
