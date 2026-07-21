import Link from "next/link";

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
        </div>
      </div>
    </nav>
  );
}

/**
 * One correction, growing. The amber dot is the captured correction (the
 * memo); the single stroke rising from it into a leaf is the sprout.
 * Two elements only, so the silhouette holds at favicon size.
 */
export function SproutMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#134E4A" />
      <path
        d="M28 48V33c0-9 7-15 18-16 1 12-7 18-18 18"
        fill="none"
        stroke="#5EEAD4"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="48" r="3.2" fill="#FBBF24" />
    </svg>
  );
}
