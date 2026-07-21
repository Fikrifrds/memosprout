"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Animated walkthrough of one correction's life: a wrong answer is
 * corrected, gated, stored, and then blocks the same mistake later.
 *
 * Plays on a loop once scrolled into view, pauses when off screen, and
 * collapses to a static diagram under prefers-reduced-motion.
 */

const STAGES = [
  {
    label: "1 · Wrong answer",
    caption: "The AI answers from stale knowledge.",
  },
  {
    label: "2 · Human corrects",
    caption: "A person supplies the right answer.",
  },
  {
    label: "3 · Gated",
    caption: "Confidence and role decide: live, or waiting for approval.",
  },
  {
    label: "4 · Stored",
    caption: "One Markdown file. Git-versionable, portable.",
  },
  {
    label: "5 · Blocked next time",
    caption:
      "The same mistake is caught even when reworded. Paraphrases and translations too, if you enable semantic checking.",
  },
];

const STAGE_MS = 2600;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function FlowAnimation() {
  const [stage, setStage] = useState(0);
  const [active, setActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const reduced = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false, // server render: assume motion is fine, corrected on hydrate
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || reduced) return;
    const timer = window.setInterval(
      () => setStage((s) => (s + 1) % STAGES.length),
      STAGE_MS,
    );
    return () => window.clearInterval(timer);
  }, [active, reduced]);

  // Reduced motion: show the end state, no cycling.
  const shown = reduced ? STAGES.length - 1 : stage;

  return (
    <div ref={containerRef} className="mt-8">
      {/* Progress rail */}
      <ol className="flex items-center gap-1.5" aria-label="How MemoSprout works">
        {STAGES.map((s, i) => (
          <li key={s.label} className="flex-1">
            <button
              type="button"
              onClick={() => setStage(i)}
              aria-current={i === shown ? "step" : undefined}
              className="group block w-full text-left"
            >
              <span
                className={`block h-1 rounded-full transition-colors duration-500 ${
                  i <= shown ? "bg-teal-600" : "bg-slate-200 group-hover:bg-slate-300"
                }`}
              />
              <span
                className={`mt-2 hidden text-[11px] font-medium transition-colors duration-500 sm:block ${
                  i === shown ? "text-teal-800" : "text-slate-400"
                }`}
              >
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* Stage viewport */}
      <div className="relative mt-5 h-[248px] overflow-hidden rounded-xl border border-slate-200 bg-white sm:h-[224px]">
        {STAGES.map((_, i) => (
          <div
            key={i}
            className={`absolute inset-0 p-5 transition-all duration-700 ease-out ${
              i === shown
                ? "translate-y-0 opacity-100"
                : `pointer-events-none opacity-0 ${i < shown ? "-translate-y-3" : "translate-y-3"}`
            }`}
            aria-hidden={i !== shown}
          >
            <StageArt index={i} playing={i === shown} />
          </div>
        ))}
      </div>

      <p className="mt-3 min-h-[2.5rem] text-center text-sm text-slate-600">
        <span className="font-medium text-slate-900 sm:hidden">
          {STAGES[shown].label}
          {" — "}
        </span>
        {STAGES[shown].caption}
      </p>
    </div>
  );
}

function Bubble({
  side,
  tone,
  children,
  delay = 0,
  playing,
}: {
  side: "left" | "right";
  tone: "wrong" | "right" | "neutral";
  children: React.ReactNode;
  delay?: number;
  playing: boolean;
}) {
  const tones = {
    wrong: "border-rose-200 bg-rose-50 text-rose-900",
    right: "border-teal-200 bg-teal-50 text-teal-900",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <div
      className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}
      style={{
        opacity: playing ? 1 : 0,
        transform: playing ? "translateY(0)" : "translateY(6px)",
        transition: `opacity 500ms ease-out ${delay}ms, transform 500ms ease-out ${delay}ms`,
      }}
    >
      <span
        className={`max-w-[85%] rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}
      >
        {children}
      </span>
    </div>
  );
}

function StageArt({ index, playing }: { index: number; playing: boolean }) {
  if (index === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <Bubble side="left" tone="neutral" playing={playing}>
          How many days of annual leave do I get?
        </Bubble>
        <Bubble side="right" tone="wrong" delay={250} playing={playing}>
          Annual leave is <strong>12 days</strong>.
          <span className="mt-1 block text-[11px] opacity-70">← outdated since January</span>
        </Bubble>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <Bubble side="left" tone="neutral" playing={playing}>
          No — it&apos;s <strong>15 days</strong> since 2026. See SK-045.
        </Bubble>
        <Bubble side="right" tone="right" delay={300} playing={playing}>
          <span className="font-mono text-[11px]">
            wrong: &quot;Annual leave is 12 days&quot;
            <br />
            correct: &quot;Annual leave is 15 days since 2026&quot;
            <br />
            source: &quot;SK-045&quot;
          </span>
        </Bubble>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="grid w-full max-w-sm gap-2">
          {[
            { label: "Role check", detail: "agent → trusted", delay: 0 },
            { label: "Confidence", detail: "0.94 ≥ 0.8", delay: 200 },
            { label: "Conflict scan", detail: "no contradiction", delay: 400 },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              style={{
                opacity: playing ? 1 : 0,
                transform: playing ? "translateX(0)" : "translateX(-8px)",
                transition: `opacity 450ms ease-out ${row.delay}ms, transform 450ms ease-out ${row.delay}ms`,
              }}
            >
              <span className="text-xs font-medium text-slate-700">{row.label}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                {row.detail}
                <span className="text-teal-700">✓</span>
              </span>
            </div>
          ))}
          <p
            className="pt-0.5 text-center text-[11px] font-medium text-teal-800"
            style={{
              opacity: playing ? 1 : 0,
              transition: "opacity 400ms ease-out 700ms",
            }}
          >
            status: active
          </p>
        </div>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="flex h-full items-center justify-center">
        <pre
          className="w-full max-w-sm overflow-hidden rounded-lg bg-slate-900 p-3 text-[10.5px] leading-relaxed text-slate-100"
          style={{
            opacity: playing ? 1 : 0,
            transform: playing ? "scale(1)" : "scale(0.97)",
            transition: "opacity 500ms ease-out, transform 500ms ease-out",
          }}
        >
          <code>
            <span className="text-slate-500">corrections/corr_a1b2c3d4.md</span>
            {"\n\n"}
            <span className="text-slate-400">---</span>
            {"\n"}
            status: <span className="text-teal-300">active</span>
            {"\n"}
            wrong_pattern: Annual leave is 12 days{"\n"}
            correct_answer: Annual leave is 15 days{"\n"}
            source_ref: SK-045{"\n"}
            <span className="text-slate-400">---</span>
          </code>
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <Bubble side="left" tone="neutral" playing={playing}>
        What&apos;s our annual leave policy?
      </Bubble>
      <Bubble side="right" tone="wrong" delay={220} playing={playing}>
        <span className="line-through opacity-60">
          Our annual leave policy is 12 days per year.
        </span>
        <span className="mt-1 block text-[11px] font-medium">✕ blocked — reworded, still caught</span>
      </Bubble>
      <Bubble side="right" tone="right" delay={520} playing={playing}>
        Annual leave is <strong>15 days</strong> since 2026.{" "}
        <span className="opacity-70">(SK-045)</span>
      </Bubble>
    </div>
  );
}
