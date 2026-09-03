import "server-only";

import { cache } from "react";

import {
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  siteConfig,
} from "@/content/site";
import type { CmsServiceHero } from "@/domain/cms/service-hero";
import type {
  PublicOpeningHours,
  PublicOpeningHoursGroup,
  PublicSiteData,
  PublicTeamMember,
  PublicVoucher,
} from "@/domain/public-site";
import type { Service } from "@/domain/service";
import { isApprovedPublicImageUrl } from "@/lib/media/cloudinary-delivery";
import { isLivePublicBookingReady } from "@/server/booking/readiness";
import { getPublishedCmsContent } from "@/server/cms/content-service";

const getPublicContent = cache(getPublishedCmsContent);

export type PublicService = Service & {
  readonly hero: CmsServiceHero;
};

function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isPublicProjectImage(value: string) {
  return isApprovedPublicImageUrl(value);
}

function formatAddress(parts: readonly string[]) {
  return parts
    .map((part) => part.trim())
    .filter((part, index, values) => part && values.indexOf(part) === index)
    .join(", ");
}

function makeHoursGroups(
  hours: readonly PublicOpeningHours[],
): readonly PublicOpeningHoursGroup[] {
  const groups: { first: string; last: string; hours: string }[] = [];

  for (const entry of hours) {
    const label = entry.open ? `${entry.opens}–${entry.closes}` : "Closed";
    const previous = groups.at(-1);
    if (previous?.hours === label) {
      previous.last = entry.day;
    } else {
      groups.push({ first: entry.day, last: entry.day, hours: label });
    }
  }

  return groups.map((group) => ({
    label: group.first === group.last ? group.first : `${group.first}–${group.last}`,
    hours: group.hours,
  }));
}

function mapPublishedService(
  record: Awaited<ReturnType<typeof getPublicContent>>["services"][number],
): PublicService | null {
  const pricing = record.prices
    .filter((price) => price.active)
    .sort((first, second) => first.durationMinutes - second.durationMinutes)
    .map((price) => ({
      durationMinutes: price.durationMinutes,
      priceEur: price.priceCents / 100,
      label: `${price.durationMinutes} minutes — €${(price.priceCents / 100).toFixed(0)}`,
    }));
  if (!pricing.length) return null;

  if (!isPublicProjectImage(record.imageUrl)) return null;
  const imageSource = record.imageUrl;
  const heroImageSource = isPublicProjectImage(record.hero.imageUrl)
    ? record.hero.imageUrl
    : imageSource;

  return {
    slug: record.slug,
    name: record.name,
    shortDescription: record.shortDescription,
    longDescription: record.longDescription,
    image: {
      src: imageSource,
      alt: record.imageAlt || record.name,
    },
    hero: {
      imageUrl: heroImageSource,
      altText:
        record.hero.altText ||
        record.imageAlt ||
        record.name,
    },
    gallery: record.galleryImages
      .filter((image) => isPublicProjectImage(image.imageUrl))
      .map((image) => ({
        src: image.imageUrl,
        alt: image.altText,
        caption: image.caption,
      })),
    durations: pricing.map((price) => `${price.durationMinutes} minutes`),
    pricing,
    idealFor: record.idealFor,
    highlights: record.highlights,
    priceNote: record.priceNote || undefined,
    bookingUrl: `/book?service=${record.slug}&duration=${pricing[0].durationMinutes}`,
    seo: {
      title: record.seoTitle,
      description: record.seoDescription,
    },
  };
}

export const getPublicServicesSnapshot = cache(async () => {
  const content = await getPublicContent();
  const mapped = content.services
    .map(mapPublishedService)
    .filter((service): service is PublicService => service !== null);

  return {
    services: mapped,
    lastModified: content.updatedAt,
  };
});

export async function getPublicServices() {
  return (await getPublicServicesSnapshot()).services;
}

export const getPublicTeam = cache(
  async (): Promise<readonly PublicTeamMember[]> => {
    const content = await getPublicContent();

    return [...content.team]
      .filter((member) => member.publicProfile && !member.archived)
      .sort((first, second) => first.sortOrder - second.sortOrder)
      .map((member) => ({
        slug: member.id,
        name: member.name,
        role: member.publicRole,
      }));
  },
);

export const getPublicPromotions = cache(async () => {
  const content = await getPublicContent();
  const parts = new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${value.year}-${value.month}-${value.day}`;

  return content.promotions.filter(
    (promotion) =>
      promotion.status === "published" &&
      (!promotion.startsOn || promotion.startsOn <= today) &&
      (!promotion.endsOn || promotion.endsOn >= today),
  );
});

export const getPublicVouchers = cache(async (): Promise<readonly PublicVoucher[]> => {
  const content = await getPublicContent();

  return [...(content.vouchers ?? [])]
    .filter(
      (voucher) =>
        voucher.status === "published" &&
        isPublicProjectImage(voucher.imageUrl),
    )
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((voucher) => ({
      id: voucher.id,
      title: voucher.title,
      imageUrl: voucher.imageUrl,
      imageAlt: voucher.imageAlt,
    }));
});

export const getPublicSiteData = cache(async (): Promise<PublicSiteData> => {
  const [content, serviceSnapshot] = await Promise.all([
    getPublicContent(),
    getPublicServicesSnapshot(),
  ]);
  const source = content.site;
  const address = formatAddress([
    source.streetAddress,
    source.locality,
    source.region,
    source.postalCode,
    source.country,
  ]);
  const localityLabel = formatAddress([source.locality, source.region]);
  const phoneDigits = source.phoneE164.replace(/[^\d+]/g, "");
  const phone =
    source.phoneConfirmed === true &&
    source.phoneDisplay.trim().length >= 5 &&
    /^\+[1-9]\d{7,14}$/.test(phoneDigits)
      ? {
          display: source.phoneDisplay.trim(),
          internationalDisplay: phoneDigits,
          e164: phoneDigits,
          href: `tel:${phoneDigits}`,
        }
      : null;
  const emailAddress =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.email.trim())
      ? source.email.trim()
      : "";
  const whatsappNumber = source.whatsappNumber.replace(/\D/g, "");
  const whatsappUrl =
    /^\d{7,15}$/.test(whatsappNumber)
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
          `Hello ${source.alternateName}, I have a question about booking a massage.`,
        )}`
      : null;
  const instagramUrl = safePublicUrl(source.instagramUrl);
  const instagramHandle = instagramUrl
    ? `@${new URL(instagramUrl).pathname.split("/").filter(Boolean)[0] ?? "Instagram"}`
    : null;
  const openingHoursConfirmed = source.openingHoursConfirmed === true;
  const openingHours: readonly PublicOpeningHours[] = openingHoursConfirmed
    ? source.weeklyHours.map((entry) => ({
        day: entry.day,
        open: entry.open,
        opens: entry.opens,
        closes: entry.closes,
      }))
    : [];
  const liveBooking = isLivePublicBookingReady(content);

  return {
    name: source.name,
    alternateName: source.alternateName,
    shortName: source.alternateName,
    canonicalUrl: siteConfig.canonicalUrl,
    language: siteConfig.language,
    currency: "EUR",
    address: {
      streetAddress: source.streetAddress,
      locality: source.locality,
      region: source.region,
      postalCode: source.postalCode || null,
      countryCode: "IE",
      countryName: source.country,
      formatted: address,
      localityLabel,
      directionsUrl: googleMapsDirectionsUrl,
      mapsEmbedUrl: googleMapsEmbedUrl,
    },
    serviceAreas: source.serviceAreas,
    arrival: {
      floor: source.streetAddress.split(",")[0]?.trim() || source.streetAddress,
      guidance: source.arrivalGuidance,
      assistance: source.arrivalAssistance,
    },
    contact: {
      phone,
      email: emailAddress
        ? { address: emailAddress, href: `mailto:${emailAddress}` }
        : null,
      whatsapp: {
        number: whatsappUrl ? whatsappNumber : null,
        url: whatsappUrl,
      },
    },
    openingHours,
    openingHoursGroups: makeHoursGroups(openingHours),
    openingHoursConfirmed,
    booking: {
      enabled: liveBooking || siteConfig.booking.enabled,
      live: liveBooking,
      booksyUrl: safePublicUrl(source.booksyUrl),
      reviewUrl: safePublicUrl(source.googleReviewUrl),
    },
    social: {
      instagram:
        instagramUrl && instagramHandle
          ? { handle: instagramHandle, url: instagramUrl }
          : null,
    },
    seo: {
      title: source.seoTitle,
      description: source.seoDescription,
    },
    treatments: serviceSnapshot.services.map((service) => ({
      href: `/services/${service.slug}`,
      label: service.name,
    })),
    updatedAt: content.updatedAt,
  };
});
