import "server-only";

import { compareCmsTeamMembersByName } from "@/domain/cms/team";
import { isApprovedPublicImageUrl } from "@/lib/media/cloudinary-delivery";
import { getPublishedCmsContent } from "@/server/cms/content-service";

export async function getPublicBookingPlannerData() {
  const content = await getPublishedCmsContent();

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
  const therapists = [...content.team]
    .filter(
      (member) =>
        member.publicProfile &&
        member.operationalActive &&
        !member.archived &&
        member.serviceIds.some((serviceId) => activeServiceIds.has(serviceId)),
    )
    .sort(compareCmsTeamMembersByName)
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
