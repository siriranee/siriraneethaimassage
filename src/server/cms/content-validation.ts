import "server-only";

import type {
  CmsBookingSettings,
  CmsGalleryRecord,
  CmsPageRecord,
  CmsPromotionRecord,
  CmsServicePrice,
  CmsServiceRecord,
  CmsSiteSettings,
  CmsTeamRecord,
  CmsVoucherRecord,
} from "@/domain/cms/types";

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

function stringList(value: unknown, maximumItems: number, maximumLength: number) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maximumItems)
    .map((item) => item.slice(0, maximumLength));
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

    return {
      id:
        typeof source.id === "string" && source.id.trim()
          ? source.id.trim().slice(0, 120)
          : `${serviceId}-${durationMinutes}`,
      durationMinutes,
      priceCents,
      active: source.active !== false,
    };
  });

  if (new Set(options.map((option) => option.durationMinutes)).size !== options.length) {
    throw new CmsValidationError("Each service duration must be unique.");
  }

  return options.sort(
    (first, second) => first.durationMinutes - second.durationMinutes,
  );
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
    category: text(source.category, "category", 2, 80),
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
    prices: prices(source.prices, current.id),
    idealFor: stringList(source.idealFor, 8, 160),
    highlights: stringList(source.highlights, 8, 160),
    bookingNotice: optionalText(source.bookingNotice, 500),
    seoTitle: text(source.seoTitle, "seoTitle", 10, 70),
    seoDescription: text(source.seoDescription, "seoDescription", 40, 170),
    status: ["draft", "published", "archived"].includes(String(source.status))
      ? (String(source.status) as CmsServiceRecord["status"])
      : current.status,
    sortOrder: integer(source.sortOrder, "sortOrder", 0, 1000),
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
    category: "thai-massage",
    shortDescription: "",
    longDescription: "",
    imageUrl: "",
    imageAlt: "",
    prices: [],
    idealFor: [],
    highlights: [],
    bookingNotice: "",
    seoTitle: "",
    seoDescription: "",
    status: "draft",
    sortOrder: 0,
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

  return {
    ...current,
    name: text(source.name, "name", 2, 100),
    alternateName: text(source.alternateName, "alternateName", 2, 80),
    streetAddress: text(source.streetAddress, "streetAddress", 5, 180),
    locality: text(source.locality, "locality", 2, 80),
    region: text(source.region, "region", 2, 80),
    postalCode: optionalText(source.postalCode, 20),
    country: text(source.country, "country", 2, 80),
    phoneDisplay: text(source.phoneDisplay, "phoneDisplay", 5, 40),
    phoneE164: text(source.phoneE164, "phoneE164", 8, 25),
    email: optionalText(source.email, 254),
    whatsappNumber: optionalText(source.whatsappNumber, 25).replace(/\D/g, ""),
    instagramUrl: validUrl(source.instagramUrl, "instagramUrl"),
    booksyUrl: validUrl(source.booksyUrl, "booksyUrl"),
    googleReviewUrl: validUrl(source.googleReviewUrl, "googleReviewUrl"),
    serviceAreas: stringList(source.serviceAreas, 20, 80),
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

export function parseGalleryUpdate(
  value: unknown,
  current: CmsGalleryRecord,
): CmsGalleryRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const imageValue = typeof source.imageUrl === "string" ? source.imageUrl.trim() : "";
  const imageUrl = imageValue.startsWith("/") && !imageValue.startsWith("//")
    ? imageValue
    : validUrl(imageValue, "imageUrl", false);

  return {
    ...current,
    imageUrl,
    altText: text(source.altText, "altText", 8, 180),
    caption: text(source.caption, "caption", 2, 240),
    published: source.published === true,
    sortOrder: integer(source.sortOrder, "sortOrder", 0, 1000),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function parseGalleryCreate(
  value: unknown,
  id: string,
): CmsGalleryRecord {
  const initial: CmsGalleryRecord = {
    id,
    imageUrl: "",
    altText: "",
    caption: "",
    published: false,
    sortOrder: 0,
    version: 0,
    updatedAt: new Date().toISOString(),
  };
  return parseGalleryUpdate(value, initial);
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
    description: text(source.description, "description", 10, 500),
    amountCents: integer(source.amountCents, "amountCents", 100, 100_000),
    badge: optionalText(source.badge, 40),
    terms: text(source.terms, "terms", 10, 500),
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
    description: "",
    amountCents: 0,
    badge: "",
    terms: "",
    status: "draft",
    sortOrder: 0,
    version: 0,
    updatedAt: new Date().toISOString(),
  };
  return parseVoucherUpdate(value, initial);
}

export function parsePageUpdate(
  value: unknown,
  current: CmsPageRecord,
): CmsPageRecord {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    ...current,
    eyebrow: text(source.eyebrow, "eyebrow", 2, 100),
    title: text(source.title, "title", 4, 120),
    description: text(source.description, "description", 20, 400),
    seoTitle: text(source.seoTitle, "seoTitle", 10, 70),
    seoDescription: text(source.seoDescription, "seoDescription", 40, 170),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}
