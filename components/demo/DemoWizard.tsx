"use client";

import { useState } from "react";

import {
  CandidateScreen,
  EvalScreen,
  PublishedScreen,
  RunScreen,
} from "@/components/demo/screens";
import { LiveExtractor } from "@/components/demo/LiveExtractor";
import {
  demoEval,
  demoFinalCard,
  demoFreshRun,
  demoRun,
  demoSteps,
} from "@/lib/demo/seeded-flow";
import type { CandidateSprout } from "@/lib/domain/schemas";

const ctaByStep = ["Grow a Sprout", "Generate protection", "Publish Validated Sprout", "Restart"];

export function DemoWizard({ candidate }: { candidate: CandidateSprout }) {
  const [step, setStep] = useState(0);

  const next = () => setStep((current) => (current + 1) % demoSteps.length);
  const back = () => setStep((current) => (current - 1 + demoSteps.length) % demoSteps.length);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">MemoSprout</h1>
        <p className="mt-1 text-slate-500">Correct once. Improve every agent.</p>
      </header>

      <ol className="mb-8 flex items-center justify-center gap-2 text-sm">
        {demoSteps.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                index === step
                  ? "rounded-full bg-slate-900 px-3 py-1 font-medium text-white"
                  : index < step
                    ? "rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700"
                    : "rounded-full bg-slate-100 px-3 py-1 text-slate-500"
              }
            >
              {label}
            </span>
            {index < demoSteps.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        ))}
      </ol>

      <main>
        {step === 0 && <RunScreen run={demoRun} />}
        {step === 1 && (
          <>
            <CandidateScreen candidate={candidate} />
            <LiveExtractor />
          </>
        )}
        {step === 2 && <EvalScreen evaluation={demoEval} />}
        {step === 3 && <PublishedScreen freshRun={demoFreshRun} finalCard={demoFinalCard} />}
      </main>

      <footer className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          Back
        </button>
        <span className="text-xs text-slate-400">Judge mode · seeded evidence</span>
        <button
          type="button"
          onClick={next}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {ctaByStep[step]}
        </button>
      </footer>
    </div>
  );
}
