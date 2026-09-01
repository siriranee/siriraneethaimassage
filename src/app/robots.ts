import type { MetadataRoute } from "next";

import { siteConfig } from "@/content/site";

function isVercelPreviewDeployment() {
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";
}

export default function robots(): MetadataRoute.Robots {
  if (isVercelPreviewDeployment()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

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
