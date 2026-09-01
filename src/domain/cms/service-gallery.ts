export const CMS_CONTENT_SCHEMA_VERSION = 4 as const;
export const MAX_SERVICE_GALLERY_IMAGES = 10;
export const DEFAULT_SERVICE_GALLERY_FOCAL_POSITION = 50;

export type CmsServiceGalleryImage = {
  readonly id: string;
  readonly imageUrl: string;
  readonly altText: string;
  readonly caption: string;
  readonly focalX: number;
  readonly focalY: number;
};

export class CmsServiceGalleryValidationError extends Error {
  constructor(
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CmsServiceGalleryValidationError";
  }
}

function galleryField(index: number, field: keyof CmsServiceGalleryImage) {
  return `galleryImages.${index}.${field}`;
}

function galleryText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length < minimum || result.length > maximum) {
    throw new CmsServiceGalleryValidationError(
      "Please check the treatment gallery fields.",
      { [field]: `Use between ${minimum} and ${maximum} characters.` },
    );
  }

  return result;
}

function galleryInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CmsServiceGalleryValidationError(
      "Please check the treatment gallery fields.",
      { [field]: `Use a whole number from ${minimum} to ${maximum}.` },
    );
  }

  return parsed;
}

export function parseServiceGalleryImageUrl(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length > 2_048) {
    throw new CmsServiceGalleryValidationError(
      "Please check the treatment gallery fields.",
      { [field]: "Image URLs cannot exceed 2,048 characters." },
    );
  }

  const safeLocalImage =
    /^\/images\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

  if (safeLocalImage.test(result)) {
    return result;
  }

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
    throw new CmsServiceGalleryValidationError(
      "Please check the treatment gallery fields.",
      {
        [field]:
          "Use a project image path under /images or an approved HTTPS URL.",
      },
    );
  }
}

export function parseCmsServiceGalleryImages(
  value: unknown,
): readonly CmsServiceGalleryImage[] {
  if (!Array.isArray(value)) {
    throw new CmsServiceGalleryValidationError(
      "Treatment gallery images must be provided as a list.",
      { galleryImages: "Provide an ordered image list." },
    );
  }

  if (value.length > MAX_SERVICE_GALLERY_IMAGES) {
    throw new CmsServiceGalleryValidationError(
      `A treatment gallery can contain up to ${MAX_SERVICE_GALLERY_IMAGES} images.`,
      {
        galleryImages: `Remove images until no more than ${MAX_SERVICE_GALLERY_IMAGES} remain.`,
      },
    );
  }

  const images = value.map((item, index) => {
    const source =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const id = galleryText(source.id, galleryField(index, "id"), 1, 120);

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
      throw new CmsServiceGalleryValidationError(
        "Please check the treatment gallery fields.",
        {
          [galleryField(index, "id")]:
            "Use letters, numbers, hyphens and underscores only.",
        },
      );
    }

    return {
      id,
      imageUrl: parseServiceGalleryImageUrl(
        source.imageUrl,
        galleryField(index, "imageUrl"),
      ),
      altText: galleryText(
        source.altText,
        galleryField(index, "altText"),
        8,
        180,
      ),
      caption: galleryText(
        source.caption,
        galleryField(index, "caption"),
        2,
        240,
      ),
      focalX: galleryInteger(
        source.focalX,
        galleryField(index, "focalX"),
        0,
        100,
      ),
      focalY: galleryInteger(
        source.focalY,
        galleryField(index, "focalY"),
        0,
        100,
      ),
    } satisfies CmsServiceGalleryImage;
  });

  const ids = images.map((image) => image.id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    throw new CmsServiceGalleryValidationError(
      "Each treatment gallery image needs a unique ID.",
      { galleryImages: "Remove or rename duplicate image records." },
    );
  }

  const urls = images.map((image) => image.imageUrl);
  if (new Set(urls).size !== urls.length) {
    throw new CmsServiceGalleryValidationError(
      "Each treatment gallery image must use a unique image path or URL.",
      { galleryImages: "Remove duplicate gallery images." },
    );
  }

  return images;
}

export function normaliseStoredServiceGalleryImages(
  value: unknown,
  fallback: readonly CmsServiceGalleryImage[],
): readonly CmsServiceGalleryImage[] {
  if (value === undefined) {
    return fallback.map((image) => ({ ...image }));
  }

  try {
    return parseCmsServiceGalleryImages(value).map((image) => ({ ...image }));
  } catch {
    return fallback.map((image) => ({ ...image }));
  }
}
