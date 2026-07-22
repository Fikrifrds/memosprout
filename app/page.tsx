import Link from "next/link";

import { CodeBlock } from "@/components/CodeBlock";
import { FlowAnimation } from "@/components/FlowAnimation";
import { GitHubLink } from "@/components/GitHubLink";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { SproutMark } from "@/components/SproutMark";

export const metadata = {
  title: "MemoSprout — Correct once. Improve every interaction.",
  description:
    "MemoSprout stores corrections to AI answers as files — approved before use, and " +
    "dropped when the source they came from changes. Open source, runs on your infrastructure.",
};

const steps = [
  {
    title: "Capture the correction",
    body: "When AI gets it wrong and a human fixes it — in a chatbot, a code review, a report — MemoSprout records what was wrong and what is right. One call detects the correction in a message and extracts the fields.",
  },
  {
    title: "Gate it before it counts",
    body: "Not every correction is correct. Corrections from customers wait for approval, and extracted ones need high confidence to go live. A correction that contradicts an active one quarantines the old record. You can also validate against a domain oracle — source documents, test suites, regulations.",
  },
  {
    title: "Store it as portable knowledge",
    body: "Active corrections are stored as Markdown with structured metadata — human-readable, git-versionable, and portable across any AI platform. No database, no lock-in.",
  },
  {
    title: "Deliver it just-in-time",
    body: "When a similar question appears, the relevant correction is injected into the AI's context — and known-wrong answers are blocked before they reach the user, including reworded and translated ones.",
  },
];

const capabilities = [
  {
    title: "Catches rewording, not just exact matches",
    body: "Blocking uses normalized, word-boundary matching plus token overlap, so reordered and repunctuated wrong answers are caught without an LLM. Enable semantic checking and paraphrases and translations are caught too. Numbers must match exactly, so an already-corrected answer is not blocked by mistake.",
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
      "A chatbot answers a leave-policy question with outdated numbers. Someone corrects it once, and that correction is injected into every future answer on the topic.",
  },
  {
    name: "Coding agents",
    example:
      "An agent edits a generated file directly. A reviewer corrects it, and the correction travels with the codebase — not with one model or one session.",
  },
  {
    name: "Finance & compliance",
    example:
      "An analyst catches a wrong tax rate in an AI-generated report. The correction records the regulation it came from, and later reports are checked against it.",
  },
  {
    name: "Customer support",
    example:
      "A supervisor corrects a refund timeline, citing the current SOP. Agents' suggested responses carry the corrected answer from then on.",
  },
];

const principles = [
  {
    title: "Corrections are verified, not blindly trusted",
    body: "A user correction could be wrong or malicious. Customer corrections wait for approval, extracted ones need high confidence, and contradictions are quarantined — plus you can validate against a domain oracle: source documents, test suites, regulations.",
  },
  {
    title: "Runs on your infrastructure",
    body: "Corrections are Markdown files on your server. No MemoSprout cloud, no telemetry, and by default no network calls at all — storing corrections, retrieving them, and blocking wrong answers need no LLM and no API key. Outbound calls happen only when you switch on an optional LLM feature, and then only to the endpoint you configured. One of those, semantic retrieval, sends correction text to your embedding provider; point it at a local model, or leave it off.",
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
          <div className="mb-5 flex justify-center">
            <SproutMark className="h-16 w-16" animate />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-teal-700">
            Correction memory for AI systems
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Correct once. Improve every interaction.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            AI makes mistakes. Humans fix them. But the fix lives and dies in one session —
            tomorrow, the same mistake comes back. MemoSprout captures those corrections, gates
            them before they count, and retrieves the relevant ones for later questions. Plain
            files, any model, no database.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs"
              className="rounded-lg bg-teal-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800"
            >
              Read the docs
            </Link>
            <GitHubLink />
          </div>
          <div className="mx-auto mt-6 max-w-xs">
            <CodeBlock>{`npm install memosprout`}</CodeBlock>
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
          <h2 className="text-center text-2xl font-bold tracking-tight">
            One correction, end to end
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-600">
            Follow a single mistake from the moment it is corrected to the moment it stops
            reaching users.
          </p>
          <FlowAnimation />
        </section>

        <section className="border-t border-slate-200 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <p className="text-sm font-semibold text-teal-700">Step {index + 1}</p>
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
            stored as Markdown files — human-readable, git-versionable, and portable. No
            MemoSprout cloud, no telemetry, no vendor lock-in. Audit the code yourself.
          </p>
          <div className="mx-auto mt-6 max-w-md text-left">
            <CodeBlock>{`npm install memosprout`}</CodeBlock>
          </div>
          <div className="mt-5 flex justify-center">
            <GitHubLink />
          </div>
        </section>

        <SiteFooter />
      </main>
    </>
  );
}
