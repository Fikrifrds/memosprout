import type { Metadata } from "next";

import "./globals.css";

/**
 * Canonical origin for absolute URLs. `metadataBase` lets each page declare a
 * relative canonical and Open Graph path; Next resolves them against this.
 */
export const siteUrl = "https://memosprout.com";

const description =
  "Corrections to AI answers, stored as files — approved before use, and dropped " +
  "when their source changes. Open source, runs on your own infrastructure.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MemoSprout — Correct once. Improve every interaction.",
    // Child pages render as "Docs — MemoSprout" without repeating the tagline.
    template: "%s — MemoSprout",
  },
  description,
  applicationName: "MemoSprout",
  authors: [{ name: "Mlola", url: "https://mlola.com" }],
  creator: "Mlola",
  publisher: "Mlola",
  keywords: [
    "AI corrections",
    "LLM hallucination",
    "RAG",
    "agent memory",
    "knowledge base",
    "AI guardrails",
    "chatbot accuracy",
    "correction engine",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "MemoSprout",
    title: "MemoSprout — Correct once. Improve every interaction.",
    description,
    url: siteUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MemoSprout — Correct once. Improve every interaction.",
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "technology",
};

/**
 * Structured data. The free price is stated explicitly because a missing
 * offer reads as unknown rather than free.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MemoSprout",
  description,
  url: siteUrl,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Node.js 20+",
  license: "https://opensource.org/licenses/MIT",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: {
    "@type": "Organization",
    name: "Mlola",
    url: "https://mlola.com",
    email: "hello@mlola.com",
  },
  softwareHelp: `${siteUrl}/docs`,
  codeRepository: "https://github.com/Fikrifrds/memosprout",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          // Serialized from a literal defined above — no user input reaches it.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
