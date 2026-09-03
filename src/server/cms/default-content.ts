import "server-only";

import {
  CMS_CONTENT_SCHEMA_VERSION,
  type CmsBooking,
  type CmsBookingSettings,
  type CmsContentState,
  type CmsSiteSettings,
  type CmsTeamRecord,
  type CmsUser,
  type CmsVoucherRecord,
} from "@/domain/cms/types";
import { openingHours, siteConfig } from "@/content/site";
import { teamMembers } from "@/content/team";

const seededAt = "2026-08-27T00:00:00.000Z";

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

const vouchers: readonly CmsVoucherRecord[] = [];

export function createDefaultContentState(): CmsContentState {
  return {
    id: "siriranee-content",
    schemaVersion: CMS_CONTENT_SCHEMA_VERSION,
    revision: 1,
    services: [],
    site: siteSettings,
    bookingSettings,
    team,
    promotions: [],
    vouchers,
    updatedAt: seededAt,
    updatedBy: "system-seed",
  };
}

/**
 * Public content used before production persistence and a first publication
 * exist. It retains the owner-confirmed address and contact number while
 * excluding treatments and every unconfirmed schedule, profile and offer.
 */
export function createSafePublicContentState(): CmsContentState {
  const content = createDefaultContentState();

  return {
    ...content,
    services: [],
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
    updatedBy: "safe-public-fallback",
  };
}

export function createMockAdministrator(): CmsUser {
  return {
    id: "mock-administrator",
    username: "demoadmin",
    displayName: "Siriranee Demo Administrator",
    passwordHash: "",
    role: "administrator",
    active: true,
    authVersion: 1,
    version: 1,
    lastLoginAt: "",
    passwordChangedAt: "",
    createdAt: seededAt,
    updatedAt: seededAt,
  };
}

export function createMockBookings(): readonly CmsBooking[] {
  return [];
}
