export type CmsServiceHero = {
  readonly imageUrl: string;
  readonly altText: string;
};

export class CmsServiceHeroValidationError extends Error {
  constructor(
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CmsServiceHeroValidationError";
  }
}

function heroText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length < minimum || result.length > maximum) {
    throw new CmsServiceHeroValidationError(
      "Please check the treatment hero fields.",
      { [field]: `Use between ${minimum} and ${maximum} characters.` },
    );
  }

  return result;
}

function heroImageUrl(value: unknown) {
  const field = "hero.imageUrl";
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length > 2_048) {
    throw new CmsServiceHeroValidationError(
      "Please check the treatment hero fields.",
      { [field]: "Image URLs cannot exceed 2,048 characters." },
    );
  }

  if (
    result.startsWith("/images/") &&
    !result.startsWith("//") &&
    !result.includes("//") &&
    !result.includes("\\") &&
    !result.includes("?") &&
    !result.includes("#") &&
    /\.(?:avif|gif|jpe?g|png|webp)$/i.test(result)
  ) {
    try {
      const unsafeSegment = result
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .some(
          (segment) =>
            segment === ".." ||
            segment.includes("/") ||
            segment.includes("\\"),
        );

      if (!unsafeSegment) return result;
    } catch {
      // Continue to the common validation error below.
    }
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
    throw new CmsServiceHeroValidationError(
      "Please check the treatment hero fields.",
      {
        [field]:
          "Use a project image path under /images or an approved HTTPS URL.",
      },
    );
  }
}

export function parseCmsServiceHero(value: unknown): CmsServiceHero {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  if (!source) {
    throw new CmsServiceHeroValidationError(
      "A treatment hero image is required.",
      { hero: "Add a treatment hero image." },
    );
  }

  return {
    imageUrl: heroImageUrl(source.imageUrl),
    altText: heroText(source.altText, "hero.altText", 8, 180),
  };
}

export function normaliseStoredServiceHero(
  value: unknown,
  fallback: CmsServiceHero,
): CmsServiceHero {
  try {
    return parseCmsServiceHero(value);
  } catch {
    return { ...fallback };
  }
}
