import Image from "next/image";
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
          className="flex items-center gap-2.5"
          aria-label="MemoSprout home"
        >
          <Image
            src="/logo.png"
            alt="MemoSprout logo"
            width={30}
            height={30}
            className="h-[30px] w-[30px]"
          />
          <span className="text-base font-semibold lowercase tracking-tight">
            memosprout
          </span>
        </Link>
        <div className="flex gap-5 text-sm">
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
