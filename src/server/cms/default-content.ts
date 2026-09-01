import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CmsBooking,
  CmsBookingSettings,
  CmsContentState,
  CmsPageRecord,
  CmsServiceRecord,
  CmsSiteSettings,
  CmsTeamRecord,
  CmsUser,
  CmsVoucherRecord,
} from "@/domain/cms/types";
import { defaultHomeHeroSlides } from "@/content/home-hero";
import { getServiceGalleryImages } from "@/content/service-galleries";
import { services } from "@/content/services";
import { openingHours, siteConfig } from "@/content/site";
import { teamMembers } from "@/content/team";
import { CMS_CONTENT_SCHEMA_VERSION } from "@/domain/cms/service-gallery";

const seededAt = "2026-08-27T00:00:00.000Z";

function mapService(
  service: (typeof services)[number],
  index: number,
): CmsServiceRecord {
  return {
    id: service.slug,
    slug: service.slug,
    name: service.name,
    category: service.category,
    shortDescription: service.shortDescription,
    longDescription: service.longDescription,
    imageUrl: service.image.src,
    imageAlt: service.image.alt,
    galleryImages: getServiceGalleryImages(service).map((image, imageIndex) => ({
      id: `${service.slug}-gallery-${String(imageIndex + 1).padStart(2, "0")}`,
      imageUrl: image.src,
      altText: image.alt,
      caption: image.caption,
      focalX: image.focalX,
      focalY: image.focalY,
    })),
    prices: service.pricing.map((price) => ({
      id: `${service.slug}-${price.durationMinutes}`,
      durationMinutes: price.durationMinutes,
      priceCents: price.priceEur * 100,
      active: true,
    })),
    idealFor: [...service.idealFor],
    highlights: [...service.highlights],
    bookingNotice: service.bookingNotice ?? "",
    seoTitle: service.seo.title,
    seoDescription: service.seo.description,
    status: "published",
    sortOrder: index,
    version: 1,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
}

const siteSettings: CmsSiteSettings = {
  name: siteConfig.name,
  alternateName: siteConfig.alternateName,
  streetAddress: siteConfig.address.streetAddress,
  locality: siteConfig.address.locality,
  region: siteConfig.address.region,
  postalCode: siteConfig.address.postalCode ?? "",
  country: siteConfig.address.countryName,
  phoneDisplay: siteConfig.contact.phone.display,
  phoneE164: siteConfig.contact.phone.e164,
  phoneConfirmed: true,
  email: siteConfig.contact.email?.address ?? "",
  whatsappNumber: siteConfig.contact.whatsapp.number ?? "",
  instagramUrl: siteConfig.social.instagram?.url ?? "",
  booksyUrl: siteConfig.booking.booksyUrl ?? "",
  googleReviewUrl: siteConfig.booking.reviewUrl ?? "",
  serviceAreas: [...siteConfig.serviceAreas],
  arrivalGuidance: siteConfig.arrival.guidance,
  arrivalAssistance: siteConfig.arrival.assistance,
  weeklyHours: openingHours.map((entry) => ({
    day: entry.day,
    open: true,
    opens: entry.opens,
    closes: entry.closes,
  })),
  openingHoursConfirmed: false,
  seoTitle: siteConfig.seo.defaultTitle,
  seoDescription: siteConfig.seo.defaultDescription,
  version: 1,
  updatedAt: seededAt,
};

const bookingSettings: CmsBookingSettings = {
  timezone: "Europe/Dublin",
  currency: "EUR",
  publicBookingEnabled: false,
  rulesConfirmed: false,
  slotIntervalMinutes: 30,
  maxConcurrentBookings: 1,
  minimumNoticeMinutes: 120,
  bookingHorizonDays: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  holdMinutes: 10,
  cancellationCutoffMinutes: 1440,
  provisionalNotice:
    "These booking rules are mock values and must be confirmed by the owner before public date and time booking is enabled.",
  version: 1,
  updatedAt: seededAt,
};

const team: readonly CmsTeamRecord[] = teamMembers.map((member, index) => ({
  id: member.slug,
  name: member.name,
  fullName: member.fullName ?? member.name,
  publicRole: member.role === "Owner" ? "Owner & massage therapist" : "Massage therapist",
  publicProfile: true,
  operationalActive: false,
  sortOrder: index,
  version: 1,
  updatedAt: seededAt,
}));

const vouchers: readonly CmsVoucherRecord[] = [
  {
    id: "voucher-focused-massage",
    title: "Focused massage voucher",
    description:
      "A thoughtful 30-minute massage gift for the neck, shoulders and upper back.",
    amountCents: 4000,
    badge: "30 minutes",
    terms:
      "Arrange and redeem this voucher directly with the Siriranee team. Appointment availability and final voucher details are confirmed by the team.",
    status: "published",
    sortOrder: 0,
    version: 1,
    updatedAt: seededAt,
  },
  {
    id: "voucher-one-hour-massage",
    title: "One-hour massage voucher",
    description:
      "Give someone a full hour to slow down with a massage selected from our one-hour treatments.",
    amountCents: 6500,
    badge: "Most popular",
    terms:
      "Arrange and redeem this voucher directly with the Siriranee team. Treatment choice, appointment availability and final voucher details are confirmed by the team.",
    status: "published",
    sortOrder: 1,
    version: 1,
    updatedAt: seededAt,
  },
  {
    id: "voucher-extended-massage",
    title: "Extended massage voucher",
    description:
      "A generous 90-minute massage gift for an unhurried Siriranee treatment experience.",
    amountCents: 9500,
    badge: "90 minutes",
    terms:
      "Arrange and redeem this voucher directly with the Siriranee team. Treatment choice, appointment availability and final voucher details are confirmed by the team.",
    status: "published",
    sortOrder: 2,
    version: 1,
    updatedAt: seededAt,
  },
];

const pages: readonly CmsPageRecord[] = [
  { id: "home", eyebrow: "Welcome to Siriranee", title: "Thai Massage in Howth, Dublin", description: "Ease tension, restore balance and leave feeling renewed.", seoTitle: siteConfig.seo.homeTitle, seoDescription: siteConfig.seo.homeDescription, heroSlides: defaultHomeHeroSlides, version: 2, updatedAt: seededAt },
  { id: "services", eyebrow: "Treatments & prices", title: "Massage in Howth, Dublin", description: "Clear options for every schedule and preference.", seoTitle: "Massage Treatments in Howth, Dublin", seoDescription: "Explore traditional Thai, hot oil, deep tissue, hot stone and focused upper-body massage at Siriranee Thai Massage in Howth, Dublin.", version: 1, updatedAt: seededAt },
  { id: "book", eyebrow: "Massage appointments in Howth", title: "Book Your Massage", description: "Choose a treatment, date and time.", seoTitle: "Book a Massage in Howth, Dublin", seoDescription: "Book a massage at Siriranee Thai Massage in Howth, Dublin. Choose a treatment, duration and preferred date and time, then send your appointment request.", version: 1, updatedAt: seededAt },
  { id: "about", eyebrow: "Our approach", title: "Thai Massage with Thoughtful Care", description: "A calm, welcoming treatment space in Howth, Dublin.", seoTitle: "About Siriranee Thai Massage | Howth, Dublin", seoDescription: "Learn about Siriranee Thai Massage, a calm destination for Thai massage and spa treatments in Howth, Dublin.", version: 2, updatedAt: seededAt },
  { id: "contact", eyebrow: "Find or message us", title: "Contact Siriranee in Howth", description: "Find us at Harbour House or view the currently available contact options.", seoTitle: "Contact Siriranee Thai Massage | Howth, Dublin", seoDescription: "Find Siriranee Thai Massage at Harbour House in Howth, Dublin. View the confirmed address, Google Maps directions and current contact options.", version: 3, updatedAt: seededAt },
  { id: "visit", eyebrow: "Plan your journey", title: "Find Us in Howth", description: "View our confirmed address, directions and arrival guidance.", seoTitle: "Visit Siriranee Thai Massage in Howth, Dublin", seoDescription: "Find Siriranee Thai Massage on Floor 3 of Harbour House, Harbour Road, Howth, with Google Maps directions and nearby Dublin areas served.", version: 3, updatedAt: seededAt },
  { id: "privacy", eyebrow: "Your information", title: "Privacy Notice", description: "How we use and protect information from website visits and appointment requests.", seoTitle: "Privacy Notice", seoDescription: "How Siriranee Thai Massage handles website visits, appointment requests and external services.", version: 2, updatedAt: seededAt },
  { id: "promotions", eyebrow: "Treat someone", title: "Massage Gifts & Offers", description: "See confirmed gift and offer information when available.", seoTitle: "Massage Gift Ideas & Offers in Howth, Dublin", seoDescription: "Explore confirmed massage gift information and current offers from Siriranee Thai Massage in Howth, Dublin.", version: 3, updatedAt: seededAt },
  { id: "gallery", eyebrow: "Gallery", title: "A Look Inside Siriranee", description: "A visual preview of our treatments and calm Howth setting.", seoTitle: "Siriranee Thai Massage Gallery | Howth, Dublin", seoDescription: "Preview the calm visual direction for Siriranee Thai Massage in Howth, Dublin, with illustrative treatment and spa imagery.", version: 2, updatedAt: seededAt },
  { id: "therapists", eyebrow: "Your comfort comes first", title: "The Siriranee Team", description: "Friendly, thoughtful care from the moment you arrive.", seoTitle: "Siriranee Thai Massage Team | Howth, Dublin", seoDescription: "Learn about the Siriranee Thai Massage team and our comfort-led approach to massage treatments in Howth, Dublin.", version: 1, updatedAt: seededAt },
];

export function createDefaultContentState(): CmsContentState {
  return {
    id: "siriranee-content",
    schemaVersion: CMS_CONTENT_SCHEMA_VERSION,
    revision: 1,
    services: services.map(mapService),
    site: siteSettings,
    bookingSettings,
    team,
    promotions: [],
    vouchers,
    gallery: [],
    pages,
    updatedAt: seededAt,
    updatedBy: "system-seed",
  };
}

/**
 * Public content used before production persistence and a first publication
 * exist. It retains the owner-confirmed address and contact number while
 * excluding every unconfirmed schedule, profile and offer.
 */
export function createSafePublicContentState(): CmsContentState {
  const content = createDefaultContentState();

  return {
    ...content,
    site: {
      ...content.site,
      openingHoursConfirmed: false,
    },
    bookingSettings: {
      ...content.bookingSettings,
      publicBookingEnabled: false,
      rulesConfirmed: false,
    },
    team: [],
    promotions: [],
    vouchers: [],
    gallery: [],
    updatedBy: "safe-public-fallback",
  };
}

export function createMockAdministrator(): CmsUser {
  return {
    id: "mock-administrator",
    email: "demo@siriranee.local",
    displayName: "Siriranee Demo Administrator",
    passwordHash: "",
    role: "administrator",
    active: true,
    authVersion: 1,
    failedLoginCount: 0,
    lockedUntil: "",
    lastLoginAt: "",
    passwordChangedAt: "",
    createdAt: seededAt,
    updatedAt: seededAt,
  };
}

export function createMockBookings(): readonly CmsBooking[] {
  const base = [
    {
      reference: "DEMO-001",
      service: services[0],
      durationMinutes: 60,
      priceCents: 6500,
      localDate: "2026-09-01",
      localTime: "10:00",
      status: "confirmed" as const,
    },
    {
      reference: "DEMO-002",
      service: services[2],
      durationMinutes: 30,
      priceCents: 4000,
      localDate: "2026-09-01",
      localTime: "12:00",
      status: "pending" as const,
    },
    {
      reference: "DEMO-003",
      service: services[4],
      durationMinutes: 90,
      priceCents: 9500,
      localDate: "2026-09-02",
      localTime: "15:00",
      status: "confirmed" as const,
    },
  ];

  return base.map((item, index) => {
    const startsAt = new Date(`${item.localDate}T${item.localTime}:00.000Z`);
    const endsAt = new Date(
      startsAt.getTime() + item.durationMinutes * 60_000,
    );

    return {
      id: `mock-booking-${index + 1}`,
      reference: item.reference,
      customer: {
        name: `Demo guest ${String.fromCharCode(65 + index)}`,
        phone: "+353000000000",
        email: "",
        notes: "",
      },
      serviceId: item.service.slug,
      serviceSlug: item.service.slug,
      serviceName: item.service.name,
      durationMinutes: item.durationMinutes,
      priceCents: item.priceCents,
      currency: "EUR",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      localDate: item.localDate,
      localTime: item.localTime,
      timezone: "Europe/Dublin",
      status: item.status,
      source: "administrator",
      capacityExpiresAt: "",
      assignedStaffId: "",
      internalNotes: "Fictional local mock booking.",
      privacyAcceptedAt: "",
      privacyNoticeVersion: "mock",
      holdTokenHash: "",
      idempotencyKeyHash: randomUUID(),
      requestFingerprintHash: "",
      demo: true,
      version: 1,
      createdAt: seededAt,
      updatedAt: seededAt,
      updatedBy: "system-seed",
    };
  });
}
