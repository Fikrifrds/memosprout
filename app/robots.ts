import type { MetadataRoute } from "next";

import { siteUrl } from "./layout";

// Required by `output: export`, same as sitemap.ts.
export const dynamic = "force-static";

/** Static export writes this to /robots.txt at build time. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
