export const weekDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type WeekDay = (typeof weekDays)[number];

export type OpeningHoursEntry = {
  readonly day: WeekDay;
  readonly opens: `${number}:${number}`;
  readonly closes: `${number}:${number}`;
};

export const openingHours = [
  { day: "Monday", opens: "10:00", closes: "20:00" },
  { day: "Tuesday", opens: "10:00", closes: "20:00" },
  { day: "Wednesday", opens: "10:00", closes: "20:00" },
  { day: "Thursday", opens: "10:00", closes: "21:00" },
  { day: "Friday", opens: "10:00", closes: "20:00" },
  { day: "Saturday", opens: "09:00", closes: "20:00" },
  { day: "Sunday", opens: "12:00", closes: "19:00" },
] as const satisfies readonly OpeningHoursEntry[];

export const openingHoursGroups = [
  { label: "Monday–Wednesday", hours: "10:00–20:00" },
  { label: "Thursday", hours: "10:00–21:00" },
  { label: "Friday", hours: "10:00–20:00" },
  { label: "Saturday", hours: "09:00–20:00" },
  { label: "Sunday", hours: "12:00–19:00" },
] as const;

export const serviceAreas = [
  "Howth",
  "Sutton",
  "Malahide",
  "Portmarnock",
  "Clontarf",
  "Raheny",
  "Dublin",
] as const;

function publicUrl(value: string | undefined, fallback: string) {
  const candidate = value?.trim() || fallback;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return fallback;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function optionalPublicUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function optionalEmail(value: string | undefined) {
  const candidate = value?.trim();
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : null;
}

const vercelProductionHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const automaticVercelUrl = vercelProductionHost
  ? `https://${vercelProductionHost}`
  : undefined;
const canonicalUrl = publicUrl(
  process.env.NEXT_PUBLIC_SITE_URL || automaticVercelUrl,
  "http://localhost:3000",
).replace(/\/+$/, "");

const bookingUrl = optionalPublicUrl(process.env.NEXT_PUBLIC_BOOKING_URL);

const emailAddress = optionalEmail(process.env.NEXT_PUBLIC_CONTACT_EMAIL);
const instagramUrl = optionalPublicUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL);
const booksyUrl = optionalPublicUrl(process.env.NEXT_PUBLIC_BOOKSY_URL);
const googleReviewUrl = optionalPublicUrl(
  process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL,
);
const formattedAddress =
  "Floor 3, Harbour House, Harbour Road, Howth, Dublin, Ireland";
export const confirmedContactPhone = {
  display: "089 948 4585",
  internationalDisplay: "+353 89 948 4585",
  e164: "+353899484585",
  href: "tel:+353899484585",
} as const;
export const googleMapsDirectionsUrl =
  "https://maps.app.goo.gl/CFWPtF1oM92TTj7P6?g_st=al";
export const googleMapsEmbedUrl =
  "https://www.google.com/maps?q=Siriranee%20Thai%20Massage%2C%20Harbour%20House%2C%20Harbour%20Road%2C%20Howth%2C%20Dublin%2C%20D13%20E9H9&output=embed";
const whatsappNumber =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") ||
  confirmedContactPhone.e164.replace(/\D/g, "");
const whatsappUrl = whatsappNumber
  ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
      "Hello Siriranee, I have a question about booking a massage.",
    )}`
  : null;
const instagramHandle = instagramUrl
  ? `@${new URL(instagramUrl).pathname.split("/").filter(Boolean)[0] ?? "Instagram"}`
  : null;

export const siteConfig = {
  name: "Siriranee Thai Massage",
  alternateName: "Siriranee",
  shortName: "Siriranee",
  canonicalUrl,
  url: canonicalUrl,
  language: "en-IE",
  locale: "en_IE",
  timeZone: "Europe/Dublin",
  currency: "EUR",
  address: {
    streetAddress: "Floor 3, Harbour House, Harbour Road",
    locality: "Howth",
    region: "Dublin",
    postalCode: null,
    countryCode: "IE",
    countryName: "Ireland",
    formatted: formattedAddress,
    directionsUrl: googleMapsDirectionsUrl,
    mapsEmbedUrl: googleMapsEmbedUrl,
  },
  serviceAreas,
  arrival: {
    floor: "Floor 3",
    guidance:
      "Siriranee is located on Floor 3 of Harbour House on Harbour Road.",
    assistance:
      "Check the current contact options before your first visit if you would like help finding the entrance or need building-access information.",
  },
  contact: {
    phone: confirmedContactPhone,
    email: emailAddress
      ? {
          address: emailAddress,
          href: `mailto:${emailAddress}`,
        }
      : null,
    whatsapp: {
      number: whatsappNumber || null,
      url: whatsappUrl,
      enabled: whatsappUrl !== null,
    },
  },
  openingHours,
  openingHoursGroups,
  openingHoursConfirmed: false,
  booking: {
    primaryUrl: bookingUrl,
    acuityUrl: bookingUrl,
    enabled: bookingUrl !== null,
    booksyUrl,
    reviewUrl: googleReviewUrl,
  },
  social: {
    instagram:
      instagramUrl && instagramHandle
        ? {
            handle: instagramHandle,
            url: instagramUrl,
          }
        : null,
    booksy: booksyUrl ? { url: booksyUrl } : null,
  },
  reviews: {
    googleUrl: googleReviewUrl,
  },
  seo: {
    homeTitle: "Thai Massage in Howth, Dublin | Siriranee",
    homeDescription:
      "Traditional Thai, hot oil, deep tissue and hot stone massage at Siriranee Thai Massage in Howth, Dublin. View prices and book your appointment.",
    defaultTitle: "Siriranee Thai Massage | Howth, Dublin",
    defaultDescription:
      "Explore massage treatments, clear prices and appointment booking at Siriranee Thai Massage in Howth, Dublin.",
  },
} as const;

export type SiteConfig = typeof siteConfig;
