import "server-only";

import {
  CMS_CONTENT_SCHEMA_VERSION,
  type CmsBooking,
  type CmsBookingSettings,
  type CmsContentState,
  type CmsPageRecord,
  type CmsSiteSettings,
  type CmsTeamRecord,
  type CmsUser,
  type CmsVoucherRecord,
} from "@/domain/cms/types";
import { defaultHomeHeroSlides } from "@/content/home-hero";
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
    services: [],
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
    gallery: [],
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
