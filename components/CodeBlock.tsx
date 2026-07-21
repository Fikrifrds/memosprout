"use client";

import { useState } from "react";

/**
 * Code block with a copy button. Falls back to a select-all hint if the
 * clipboard API is unavailable (non-secure origins, older browsers).
 */
export function CodeBlock({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className={`group relative ${className}`}>
      <pre className="overflow-x-auto rounded-lg bg-teal-950 p-4 pr-12 text-sm leading-relaxed text-teal-50">
        <code>{children}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={state === "copied" ? "Copied" : "Copy to clipboard"}
        className="absolute right-2 top-2 rounded-md border border-white/15 bg-white/5 p-1.5 text-teal-200 opacity-0 transition hover:bg-white/15 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-60"
      >
        {state === "copied" ? (
          <CheckIcon />
        ) : state === "failed" ? (
          <span className="px-1 text-[10px] font-medium">select all</span>
        ) : (
          <CopyIcon />
        )}
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
