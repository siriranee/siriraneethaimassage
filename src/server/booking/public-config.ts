import "server-only";

import { getPublishedCmsContent } from "@/server/cms/content-service";

export async function getPublicBookingPlannerServices() {
  const content = await getPublishedCmsContent();

  return content.services
    .filter(
      (service) =>
        service.status === "published" &&
        service.prices.some((price) => price.active),
    )
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      shortDescription: service.shortDescription,
      bookingNotice: service.bookingNotice,
      pricing: service.prices
        .filter((price) => price.active)
        .sort(
          (first, second) =>
            first.durationMinutes - second.durationMinutes,
        )
        .map((price) => ({
          durationMinutes: price.durationMinutes,
          priceEur: price.priceCents / 100,
        })),
    }));
}
