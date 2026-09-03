import "server-only";

import {
  CmsServiceGalleryValidationError,
  parseCmsServiceGalleryImages,
  type CmsServiceGalleryImage,
} from "@/domain/cms/service-gallery";
import {
  CmsServiceHeroValidationError,
  parseCmsServiceHero,
  type CmsServiceHero,
} from "@/domain/cms/service-hero";
import {
  type CmsBookingSettings,
  type CmsPromotionRecord,
  type CmsServicePrice,
  type CmsServiceRecord,
  type CmsSiteSettings,
  type CmsTeamRecord,
  type CmsVoucherRecord,
} from "@/domain/cms/types";

export const RESERVED_LEGACY_SERVICE_SLUGS = [
  "back-neck-shoulder-massage",
  "full-body-massage",
  "couples-massage",
  "head-massage",
  "foot-massage-reflexology",
  "cupping-therapy",
  "sports-massage",
] as const;

const reservedLegacyServiceSlugs = new Set<string>(
  RESERVED_LEGACY_SERVICE_SLUGS,
);
export class CmsValidationError extends Error {
  constructor(
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CmsValidationError";
  }
}

function text(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length < minimum || result.length > maximum) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: `Use between ${minimum} and ${maximum} characters.`,
    });
  }

  return result;
}

function optionalText(value: unknown, maximum: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > maximum) {
    throw new CmsValidationError(`Text cannot exceed ${maximum} characters.`);
  }
  return result;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: `Use a whole number from ${minimum} to ${maximum}.`,
    });
  }

  return parsed;
}

function validUrl(value: unknown, field: string, optional = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result && optional) return "";

  try {
    const url = new URL(result);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: "Enter a valid http or https URL.",
    });
  }
}

function validTime(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: "Use 24-hour time in HH:mm format.",
    });
  }
  return result;
}

function safeSlug(value: unknown, field = "slug") {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (
    result.length < 2 ||
    result.length > 100 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)
  ) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: "Use 2–100 lowercase letters, numbers and single hyphens.",
    });
  }

  if (reservedLegacyServiceSlugs.has(result)) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]:
        "This URL is reserved so an existing website redirect keeps working.",
    });
  }

  return result;
}

function optionalDate(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: "Use a valid date.",
    });
  }
  return result;
}

function stringList(
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
) {
  if (!Array.isArray(value)) return [];

  const items = value.map((item, index) => {
    if (typeof item !== "string") {
      throw new CmsValidationError("Please check the highlighted fields.", {
        [`${field}.${index}`]: "Use text for each list item.",
      });
    }

    const result = item.trim();
    if (result.length > maximumLength) {
      throw new CmsValidationError("Please check the highlighted fields.", {
        [`${field}.${index}`]:
          `Keep each item to ${maximumLength} characters or fewer.`,
      });
    }

    return result;
  }).filter(Boolean);

  if (items.length > maximumItems) {
    throw new CmsValidationError("Please check the highlighted fields.", {
      [field]: `Use no more than ${maximumItems} items.`,
    });
  }

  return items;
}

function prices(value: unknown, serviceId: string): readonly CmsServicePrice[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new CmsValidationError("Add between one and eight duration prices.", {
      prices: "At least one duration and price is required.",
    });
  }

  const options = value.map((item, index) => {
    const source =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const durationMinutes = integer(
      source.durationMinutes,
      `prices.${index}.durationMinutes`,
      15,
      240,
    );
    const priceCents = integer(
      source.priceCents,
      `prices.${index}.priceCents`,
      100,
      100000,
    );

    if (durationMinutes % 5 !== 0) {
      throw new CmsValidationError("Durations must use five-minute increments.");
    }

    const suppliedId =
      typeof source.id === "string" ? source.id.trim() : "";
    if (suppliedId.length > 120) {
      throw new CmsValidationError("Please check the highlighted fields.", {
        [`prices.${index}.id`]:
          "Duration option IDs cannot exceed 120 characters.",
      });
    }

    return {
      id: suppliedId || `${serviceId}-${durationMinutes}`,
      durationMinutes,
      priceCents,
      active: source.active !== false,
    };
  });

  if (new Set(options.map((option) => option.durationMinutes)).size !== options.length) {
    throw new CmsValidationError("Each service duration must be unique.");
  }
  if (
    new Set(options.map((option) => option.id.toLocaleLowerCase("en-IE"))).size !==
    options.length
  ) {
    throw new CmsValidationError("Each duration option ID must be unique.", {
      prices: "Remove or rename duplicate duration option IDs.",
    });
  }

  return options.sort(
    (first, second) => first.durationMinutes - second.durationMinutes,
  );
}

function serviceHero(value: unknown): CmsServiceHero {
  try {
    return parseCmsServiceHero(value);
  } catch (error) {
    if (error instanceof CmsServiceHeroValidationError) {
      throw new CmsValidationError(error.message, error.fields);
    }

    throw error;
  }
}

function serviceGalleryImages(
  value: unknown,
  current: readonly CmsServiceGalleryImage[] | undefined,
) {
  if (value === undefined) return current ?? [];

  try {
    return parseCmsServiceGalleryImages(value);
  } catch (error) {
    if (error instanceof CmsServiceGalleryValidationError) {
      throw new CmsValidationError(error.message, error.fields);
    }

    throw error;
  }
}

export function parseServiceUpdate(
  value: unknown,
  current: CmsServiceRecord,
): CmsServiceRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();

  return {
    ...current,
    name: text(source.name, "name", 2, 100),
    shortDescription: text(
      source.shortDescription,
      "shortDescription",
      20,
      300,
    ),
    longDescription: text(
      source.longDescription,
      "longDescription",
      40,
      2000,
    ),
    imageUrl:
      typeof source.imageUrl === "string" &&
      source.imageUrl.trim().startsWith("/")
        ? source.imageUrl.trim()
        : validUrl(source.imageUrl, "imageUrl", false),
    imageAlt: text(source.imageAlt, "imageAlt", 8, 180),
    hero: serviceHero(source.hero),
    galleryImages: serviceGalleryImages(
      source.galleryImages,
      current.galleryImages,
    ),
    prices: prices(source.prices, current.id),
    idealFor: stringList(source.idealFor, "idealFor", 8, 160),
    highlights: stringList(source.highlights, "highlights", 8, 160),
    priceNote: optionalText(source.priceNote, 300),
    seoTitle: text(source.seoTitle, "seoTitle", 10, 70),
    seoDescription: text(source.seoDescription, "seoDescription", 40, 170),
    version: current.version + 1,
    updatedAt: now,
  };
}

export function parseServiceCreate(
  value: unknown,
  id: string,
): CmsServiceRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();
  const initial: CmsServiceRecord = {
    id,
    slug: safeSlug(source.slug),
    name: "",
    shortDescription: "",
    longDescription: "",
    imageUrl: "",
    imageAlt: "",
    hero: {
      imageUrl: "",
      altText: "",
    },
    galleryImages: [],
    prices: [],
    idealFor: [],
    highlights: [],
    priceNote: "",
    seoTitle: "",
    seoDescription: "",
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  return parseServiceUpdate(value, initial);
}

export function parseSiteSettingsUpdate(
  value: unknown,
  current: CmsSiteSettings,
): CmsSiteSettings {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const weeklyHours = Array.isArray(source.weeklyHours)
    ? source.weeklyHours.map((entry, index) => {
        const row =
          entry && typeof entry === "object"
            ? (entry as Record<string, unknown>)
            : {};
        const previous = current.weeklyHours[index];

        if (!previous) {
          throw new CmsValidationError("Opening-hours rows are invalid.");
        }

        const open = row.open !== false;
        const opens = validTime(row.opens, `weeklyHours.${index}.opens`);
        const closes = validTime(row.closes, `weeklyHours.${index}.closes`);

        if (open && opens >= closes) {
          throw new CmsValidationError("Opening time must be before closing time.");
        }

        return { ...previous, open, opens, closes };
      })
    : current.weeklyHours;

  if (weeklyHours.length !== current.weeklyHours.length) {
    throw new CmsValidationError("All seven opening-hours rows are required.");
  }

  const phoneDisplay = optionalText(source.phoneDisplay, 40);
  const phoneE164Input = optionalText(source.phoneE164, 25);
  const phoneE164 = phoneE164Input.replace(/[\s().-]/g, "");
  const phoneConfirmed =
    source.phoneConfirmed === undefined
      ? current.phoneConfirmed === true
      : source.phoneConfirmed === true;

  if (
    phoneConfirmed &&
    (phoneDisplay.length < 5 || !/^\+[1-9]\d{7,14}$/.test(phoneE164))
  ) {
    throw new CmsValidationError(
      "Enter and verify the public phone number before confirming it.",
      {
        ...(phoneDisplay.length < 5
          ? { phoneDisplay: "Enter the phone number visitors should see." }
          : {}),
        ...(!/^\+[1-9]\d{7,14}$/.test(phoneE164)
          ? { phoneE164: "Use E.164 format, for example +353123456789." }
          : {}),
      },
    );
  }

  return {
    ...current,
    name: text(source.name, "name", 2, 100),
    alternateName: text(source.alternateName, "alternateName", 2, 80),
    streetAddress: text(source.streetAddress, "streetAddress", 5, 180),
    locality: text(source.locality, "locality", 2, 80),
    region: text(source.region, "region", 2, 80),
    postalCode: optionalText(source.postalCode, 20),
    country: text(source.country, "country", 2, 80),
    phoneDisplay,
    phoneE164,
    phoneConfirmed,
    email: optionalText(source.email, 254),
    whatsappNumber: optionalText(source.whatsappNumber, 25).replace(/\D/g, ""),
    instagramUrl: validUrl(source.instagramUrl, "instagramUrl"),
    booksyUrl: validUrl(source.booksyUrl, "booksyUrl"),
    googleReviewUrl: validUrl(source.googleReviewUrl, "googleReviewUrl"),
    serviceAreas: stringList(source.serviceAreas, "serviceAreas", 20, 80),
    arrivalGuidance: text(source.arrivalGuidance, "arrivalGuidance", 20, 500),
    arrivalAssistance: text(source.arrivalAssistance, "arrivalAssistance", 20, 500),
    weeklyHours,
    openingHoursConfirmed: source.openingHoursConfirmed === true,
    seoTitle: text(source.seoTitle, "seoTitle", 10, 70),
    seoDescription: text(source.seoDescription, "seoDescription", 40, 170),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function parseBookingSettingsUpdate(
  value: unknown,
  current: CmsBookingSettings,
  openingHoursConfirmed: boolean,
) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const rulesConfirmed = source.rulesConfirmed === true;
  const publicBookingEnabled = source.publicBookingEnabled === true;

  if (
    publicBookingEnabled &&
    (!rulesConfirmed || !openingHoursConfirmed)
  ) {
    throw new CmsValidationError(
      "Confirm the booking rules and opening hours before enabling public date and time booking.",
    );
  }

  return {
    ...current,
    publicBookingEnabled,
    rulesConfirmed,
    slotIntervalMinutes: integer(
      source.slotIntervalMinutes,
      "slotIntervalMinutes",
      5,
      120,
    ),
    maxConcurrentBookings: integer(
      source.maxConcurrentBookings,
      "maxConcurrentBookings",
      1,
      20,
    ),
    minimumNoticeMinutes: integer(
      source.minimumNoticeMinutes,
      "minimumNoticeMinutes",
      0,
      10080,
    ),
    bookingHorizonDays: integer(
      source.bookingHorizonDays,
      "bookingHorizonDays",
      1,
      365,
    ),
    bufferBeforeMinutes: integer(
      source.bufferBeforeMinutes,
      "bufferBeforeMinutes",
      0,
      120,
    ),
    bufferAfterMinutes: integer(
      source.bufferAfterMinutes,
      "bufferAfterMinutes",
      0,
      120,
    ),
    holdMinutes: integer(source.holdMinutes, "holdMinutes", 2, 30),
    cancellationCutoffMinutes: integer(
      source.cancellationCutoffMinutes,
      "cancellationCutoffMinutes",
      0,
      10080,
    ),
    provisionalNotice: optionalText(source.provisionalNotice, 500),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  } satisfies CmsBookingSettings;
}

export function parseTeamUpdate(
  value: unknown,
  current: CmsTeamRecord,
): CmsTeamRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const archived = source.archived === true;
  return {
    ...current,
    name: text(source.name, "name", 2, 80),
    fullName: text(source.fullName, "fullName", 2, 120),
    publicRole: text(source.publicRole, "publicRole", 2, 120),
    publicProfile: archived ? false : source.publicProfile !== false,
    operationalActive: archived ? false : source.operationalActive === true,
    archived,
    sortOrder: integer(source.sortOrder, "sortOrder", 0, 1000),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function parseTeamCreate(
  value: unknown,
  id: string,
): CmsTeamRecord {
  const now = new Date().toISOString();
  const initial: CmsTeamRecord = {
    id,
    name: "",
    fullName: "",
    publicRole: "Massage therapist",
    publicProfile: false,
    operationalActive: false,
    sortOrder: 0,
    version: 0,
    updatedAt: now,
  };

  return parseTeamUpdate(value, initial);
}

export function parsePromotionUpdate(
  value: unknown,
  current: CmsPromotionRecord,
): CmsPromotionRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const startsOn = optionalDate(source.startsOn, "startsOn");
  const endsOn = optionalDate(source.endsOn, "endsOn");
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new CmsValidationError("The promotion end date must be on or after its start date.");
  }
  const status = ["draft", "published", "archived"].includes(String(source.status))
    ? (String(source.status) as CmsPromotionRecord["status"])
    : current.status;

  return {
    ...current,
    title: text(source.title, "title", 2, 120),
    description: text(source.description, "description", 10, 1000),
    status,
    startsOn,
    endsOn,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function parsePromotionCreate(
  value: unknown,
  id: string,
): CmsPromotionRecord {
  const initial: CmsPromotionRecord = {
    id,
    title: "",
    description: "",
    status: "draft",
    startsOn: "",
    endsOn: "",
    version: 0,
    updatedAt: new Date().toISOString(),
  };
  return parsePromotionUpdate(value, initial);
}

export function parseVoucherUpdate(
  value: unknown,
  current: CmsVoucherRecord,
): CmsVoucherRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const status = ["draft", "published", "archived"].includes(String(source.status))
    ? (String(source.status) as CmsVoucherRecord["status"])
    : current.status;

  return {
    ...current,
    title: text(source.title, "title", 2, 120),
    imageUrl: validUrl(source.imageUrl, "imageUrl", false),
    imageAlt: text(source.imageAlt, "imageAlt", 4, 180),
    status,
    sortOrder: integer(source.sortOrder, "sortOrder", 0, 9_999),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function parseVoucherCreate(
  value: unknown,
  id: string,
): CmsVoucherRecord {
  const initial: CmsVoucherRecord = {
    id,
    title: "",
    imageUrl: "",
    imageAlt: "",
    status: "draft",
    sortOrder: 0,
    version: 0,
    updatedAt: new Date().toISOString(),
  };
  return parseVoucherUpdate(value, initial);
}
