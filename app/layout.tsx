import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MemoSprout — Correct once. Improve every agent.",
  description:
    "MemoSprout turns agent outcomes and human corrections into verified, portable knowledge that improves future AI-agent runs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
