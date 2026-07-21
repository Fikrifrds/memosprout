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
          <span>
            memo<span className="text-teal-700">sprout</span>
          </span>
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

/**
 * A sprout: a curved stem carrying two asymmetric leaves, seed at the tip.
 * The asymmetry keeps the silhouette legible at favicon size, where a
 * symmetric mark collapses into a blob.
 */
export function SproutMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#134E4A" />
      <path
        d="M31 50V34c0-5.5 1.6-9.8 4-13"
        stroke="#99F6E4"
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M31 38c-1.4-6.4-6.6-11.4-12-11.6-2.6-.1-3.6 2-2.3 4.4C19.4 35.6 25.6 38.6 31 38Z"
        fill="#2DD4BF"
      />
      <path
        d="M33 34c1-7.8 7.2-14 13.4-14.2 3-.1 4.2 2.4 2.7 5.2C45.9 31.4 39.2 35 33 34Z"
        fill="#5EEAD4"
      />
      <circle cx="36.5" cy="18.5" r="3.1" fill="#FBBF24" />
    </svg>
  );
}
