import Link from "next/link";

import { GitHubLink } from "@/components/GitHubLink";

const links = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
];

export function SiteNav() {
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold lowercase tracking-tight"
          aria-label="MemoSprout home"
        >
          <SproutMark />
          memo<span className="text-teal-700">sprout</span>
        </Link>
        <div className="flex items-center gap-5 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-600 transition-colors hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
          <GitHubLink compact />
        </div>
      </div>
    </nav>
  );
}

/** The "m" of memosprout drawn as two sprouting stems, with a seed above. */
export function SproutMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#134E4A" />
      <path
        d="M18 46V33c0-4.4 3.1-7.6 7-7.6s7 3.2 7 7.6v13"
        stroke="#5EEAD4"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M32 46V33c0-4.4 3.1-7.6 7-7.6s7 3.2 7 7.6v13"
        stroke="#5EEAD4"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="39" cy="17" r="3.6" fill="#FBBF24" />
    </svg>
  );
}
