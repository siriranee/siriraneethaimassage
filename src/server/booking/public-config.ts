import "server-only";

import type { CmsContentState } from "@/domain/cms/types";
import { isApprovedPublicImageUrl } from "@/lib/media/cloudinary-delivery";
import { getPublishedCmsContent } from "@/server/cms/content-service";

// Legacy profiles have no creation timestamp. Keep their owner-confirmed order.
const establishedTherapistOrder = new Map<string, number>([
  ["siriranee", 0],
  ["mon-ubon", 1],
]);

export async function getPublicBookingPlannerData() {
  const content = await getPublishedCmsContent();
  return buildPublicBookingPlannerData(content);
}

export function buildPublicBookingPlannerData(content: CmsContentState) {
  const services = content.services
    .filter(
      (service) =>
        service.prices.some((price) => price.active),
    )
    .map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      shortDescription: service.shortDescription,
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

  const activeServiceIds = new Set(services.map((service) => service.id));
  // Stable sorting preserves added order for future profiles, even after edits.
  const therapists = content.team
    .filter(
      (member) =>
        member.publicProfile &&
        member.operationalActive &&
        !member.archived &&
        member.serviceIds.some((serviceId) => activeServiceIds.has(serviceId)),
    )
    .sort((first, second) =>
      (establishedTherapistOrder.get(first.slug) ?? establishedTherapistOrder.size) -
      (establishedTherapistOrder.get(second.slug) ?? establishedTherapistOrder.size),
    )
    .map((member) => ({
      id: member.id,
      slug: member.slug,
      name: member.name,
      role: member.publicRole,
      shortBio: member.shortBio,
      imageUrl:
        member.imageUrl && isApprovedPublicImageUrl(member.imageUrl)
          ? member.imageUrl
          : "",
      imageAlt: member.imageAlt,
      serviceIds: member.serviceIds.filter((serviceId) =>
        activeServiceIds.has(serviceId),
      ),
    }));

  return { services, therapists } as const;
}

export async function getPublicBookingPlannerServices() {
  return (await getPublicBookingPlannerData()).services;
}
