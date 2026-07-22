import type { MetadataRoute } from "next";

import { siteUrl } from "./layout";

/**
 * Static export writes this to /sitemap.xml at build time.
 *
 * The site is two pages, so the list is maintained by hand rather than
 * crawled — a generated sitemap would be more machinery than the content
 * justifies, and a wrong entry is worse than a short one.
 */
// Required by `output: export` — the route must be statically generated,
// since there is no server to build it per request.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: siteUrl, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/docs`, lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}
