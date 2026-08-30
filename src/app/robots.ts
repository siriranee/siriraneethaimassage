import type { MetadataRoute } from "next";

import { siteConfig } from "@/content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin-preview", "/cms", "/cms/"],
    },
    sitemap: `${siteConfig.canonicalUrl}/sitemap.xml`,
    host: siteConfig.canonicalUrl,
  };
}
