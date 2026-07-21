import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MemoSprout — Correct once. Improve every interaction.",
  description:
    "MemoSprout captures corrections to AI outputs, gates them before they count, and delivers them to every future interaction. Open source, local-first, domain-agnostic.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
