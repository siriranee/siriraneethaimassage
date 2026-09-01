import type { MetadataRoute } from "next";

import { siteConfig } from "@/content/site";
import {
  getPublicPromotions,
  getPublicServicesSnapshot,
} from "@/server/cms/public-adapter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/services", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/book", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/gallery", priority: 0.65, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/visit", priority: 0.82, changeFrequency: "monthly" as const },
  { path: "/privacy", priority: 0.25, changeFrequency: "yearly" as const },
];

const promotionsRoute = {
  path: "/promotions",
  priority: 0.65,
  changeFrequency: "weekly" as const,
};

function validLastModified(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ services, lastModified }, promotions] = await Promise.all([
    getPublicServicesSnapshot(),
    getPublicPromotions(),
  ]);
  const publishedAt = validLastModified(lastModified);
  const indexedStaticRoutes =
    promotions.length > 0
      ? [...staticRoutes, promotionsRoute]
      : staticRoutes;
  const staticEntries: MetadataRoute.Sitemap = indexedStaticRoutes.map(
    (route) => ({
      url: new URL(route.path, `${siteConfig.canonicalUrl}/`).toString(),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      ...(publishedAt ? { lastModified: publishedAt } : {}),
    }),
  );
  const serviceEntries: MetadataRoute.Sitemap = services.map((service) => ({
    url: new URL(`/services/${service.slug}`, `${siteConfig.canonicalUrl}/`).toString(),
    changeFrequency: "monthly",
    priority: 0.78,
    ...(publishedAt ? { lastModified: publishedAt } : {}),
  }));

  return [...staticEntries, ...serviceEntries];
}
