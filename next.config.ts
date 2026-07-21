import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The site is entirely static (/, /docs) — export to HTML so nginx can
  // serve it directly, with no Node process to keep alive.
  output: "export",
};

export default nextConfig;
