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
import { services } from "@/content/services";
import { openingHours, siteConfig } from "@/content/site";
import { teamMembers } from "@/content/team";

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
  { id: "home", eyebrow: "Welcome to Siriranee", title: "Authentic Thai Massage in Howth, Dublin", description: "Ease tension, restore balance and leave feeling renewed.", seoTitle: siteConfig.seo.homeTitle, seoDescription: siteConfig.seo.homeDescription, version: 1, updatedAt: seededAt },
  { id: "about", eyebrow: "Our approach", title: "A Warm Welcome at Siriranee", description: "Discover a massage and spa setting in Howth shaped around thoughtful care, calm surroundings and time that feels entirely your own.", seoTitle: "About Siriranee Thai Massage | Howth, Dublin", seoDescription: "Learn about Siriranee Thai Massage, a calm destination for Thai massage and spa treatments in Howth, Dublin.", version: 1, updatedAt: seededAt },
  { id: "contact", eyebrow: "Contact & location", title: "Contact Siriranee Thai Massage", description: "Find us on Floor 3 of Harbour House in Howth, call the team or continue an appointment request with your chosen massage preferences.", seoTitle: "Contact Siriranee Thai Massage | Howth, Dublin", seoDescription: "Contact Siriranee Thai Massage in Howth, Dublin. Find our Harbour House address, phone number, provisional hours, directions and booking page.", version: 1, updatedAt: seededAt },
  { id: "visit", eyebrow: "Visit Siriranee", title: "Visit Siriranee in Howth", description: "Find Siriranee Thai Massage on Floor 3 of Harbour House, Harbour Road, Howth, Dublin. Check the practical details below before your appointment.", seoTitle: "Visit Siriranee Thai Massage in Howth, Dublin", seoDescription: "Visit Siriranee Thai Massage on Floor 3 of Harbour House, Harbour Road, Howth. View hours, directions and nearby Dublin areas served.", version: 1, updatedAt: seededAt },
  { id: "privacy", eyebrow: "Website information", title: "Privacy notice", description: "How appointment and technical information is used when you visit the website or request a massage.", seoTitle: "Privacy Notice", seoDescription: "How Siriranee Thai Massage handles website visits, appointment requests and external services.", version: 1, updatedAt: seededAt },
  { id: "promotions", eyebrow: "Something thoughtful", title: "Gift ideas & current offers", description: "Arrange a thoughtful massage gift, explore longer appointments, or ask the Siriranee team about confirmed seasonal news.", seoTitle: "Massage Gift Ideas & Offers in Howth, Dublin", seoDescription: "Explore massage gift ideas and current appointment options from Siriranee Thai Massage in Howth, Dublin.", version: 1, updatedAt: seededAt },
  { id: "gallery", eyebrow: "A closer look", title: "The Siriranee Gallery", description: "Explore the warm tones and unhurried atmosphere shaping Siriranee's visual direction in Howth.", seoTitle: "Siriranee Thai Massage Gallery | Howth, Dublin", seoDescription: "Preview the calm visual direction for Siriranee Thai Massage in Howth, Dublin, with illustrative treatment and spa imagery.", version: 1, updatedAt: seededAt },
];

export function createDefaultContentState(): CmsContentState {
  return {
    id: "siriranee-content",
    schemaVersion: 1,
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
