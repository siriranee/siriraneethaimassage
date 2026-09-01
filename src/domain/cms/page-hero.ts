export const MAX_HOME_HERO_SLIDES = 8;
export const DEFAULT_HOME_HERO_FOCAL_POSITION = 50;

export type CmsPageHeroSlide = {
  readonly id: string;
  readonly imageUrl: string;
  readonly altText: string;
  readonly title: string;
  readonly focalX: number;
  readonly focalY: number;
};

export class CmsPageHeroValidationError extends Error {
  constructor(
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CmsPageHeroValidationError";
  }
}

function slideField(index: number, field: keyof CmsPageHeroSlide) {
  return `heroSlides.${index}.${field}`;
}

function slideText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length < minimum || result.length > maximum) {
    throw new CmsPageHeroValidationError(
      "Please check the home hero slide fields.",
      { [field]: `Use between ${minimum} and ${maximum} characters.` },
    );
  }

  return result;
}

function slideInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CmsPageHeroValidationError(
      "Please check the home hero slide fields.",
      { [field]: `Use a whole number from ${minimum} to ${maximum}.` },
    );
  }

  return parsed;
}

export function parsePageHeroImageUrl(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length > 2_048) {
    throw new CmsPageHeroValidationError(
      "Please check the home hero slide fields.",
      { [field]: "Image URLs cannot exceed 2,048 characters." },
    );
  }

  const safeLocalImage =
    /^\/images\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

  if (safeLocalImage.test(result)) return result;

  try {
    const url = new URL(result);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("Unsafe image URL.");
    }
    return url.toString();
  } catch {
    throw new CmsPageHeroValidationError(
      "Please check the home hero slide fields.",
      {
        [field]:
          "Use a project image path under /images or an approved HTTPS URL.",
      },
    );
  }
}

export function parseCmsPageHeroSlides(
  value: unknown,
): readonly CmsPageHeroSlide[] {
  if (!Array.isArray(value)) {
    throw new CmsPageHeroValidationError(
      "Home hero slides must be provided as a list.",
      { heroSlides: "Provide an ordered slide list." },
    );
  }

  if (value.length < 1 || value.length > MAX_HOME_HERO_SLIDES) {
    throw new CmsPageHeroValidationError(
      `The home hero needs between one and ${MAX_HOME_HERO_SLIDES} slides.`,
      {
        heroSlides: `Keep between one and ${MAX_HOME_HERO_SLIDES} slides.`,
      },
    );
  }

  const slides = value.map((item, index) => {
    const source =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const id = slideText(source.id, slideField(index, "id"), 1, 120);

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
      throw new CmsPageHeroValidationError(
        "Please check the home hero slide fields.",
        {
          [slideField(index, "id")]:
            "Use letters, numbers, hyphens and underscores only.",
        },
      );
    }

    return {
      id,
      imageUrl: parsePageHeroImageUrl(
        source.imageUrl,
        slideField(index, "imageUrl"),
      ),
      altText: slideText(
        source.altText,
        slideField(index, "altText"),
        8,
        180,
      ),
      title: slideText(source.title, slideField(index, "title"), 2, 100),
      focalX: slideInteger(
        source.focalX,
        slideField(index, "focalX"),
        0,
        100,
      ),
      focalY: slideInteger(
        source.focalY,
        slideField(index, "focalY"),
        0,
        100,
      ),
    } satisfies CmsPageHeroSlide;
  });

  const ids = slides.map((slide) => slide.id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    throw new CmsPageHeroValidationError(
      "Each home hero slide needs a unique ID.",
      { heroSlides: "Remove or rename duplicate slide records." },
    );
  }

  const urls = slides.map((slide) => slide.imageUrl);
  if (new Set(urls).size !== urls.length) {
    throw new CmsPageHeroValidationError(
      "Each home hero slide must use a unique image path or URL.",
      { heroSlides: "Remove duplicate slide images." },
    );
  }

  return slides;
}

export function normaliseStoredPageHeroSlides(
  value: unknown,
  fallback: readonly CmsPageHeroSlide[],
): readonly CmsPageHeroSlide[] {
  if (value === undefined) return fallback.map((slide) => ({ ...slide }));

  try {
    return parseCmsPageHeroSlides(value).map((slide) => ({ ...slide }));
  } catch {
    return fallback.map((slide) => ({ ...slide }));
  }
}
