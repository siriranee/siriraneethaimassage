import type {
  CmsContentState,
  CmsMediaScope,
} from "@/domain/cms/types";
import { isProjectImagePath } from "@/lib/media/cloudinary-delivery";
import {
  CmsMediaValidationError,
  parseCmsMediaFormat,
} from "@/server/media/policy";

type ParsedCloudinaryUrl = {
  readonly cloudName: string;
  readonly publicId: string;
  readonly format: string;
  readonly version: number;
};

function parseCloudinaryUrl(
  value: string,
  requireUntransformedUpload: boolean,
): ParsedCloudinaryUrl | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes("%") ||
      url.pathname.includes("\\")
    ) {
      return null;
    }

    const segments = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);
    if (
      segments.length < 6 ||
      segments[1] !== "image" ||
      segments[2] !== "upload"
    ) {
      return null;
    }

    const versionIndex = segments.findIndex(
      (segment, index) => index >= 3 && /^v[1-9]\d*$/.test(segment),
    );
    if (
      versionIndex < 3 ||
      (requireUntransformedUpload && versionIndex !== 3)
    ) {
      return null;
    }

    const assetSegments = segments.slice(versionIndex + 1);
    const fileName = assetSegments.at(-1) ?? "";
    const extensionIndex = fileName.lastIndexOf(".");
    if (extensionIndex < 1) return null;

    const format = fileName.slice(extensionIndex + 1).toLowerCase();
    const publicId = [
      ...assetSegments.slice(0, -1),
      fileName.slice(0, extensionIndex),
    ].join("/");

    return {
      cloudName: segments[0],
      publicId,
      format,
      version: Number(segments[versionIndex].slice(1)),
    };
  } catch {
    return null;
  }
}

export function isCloudinaryImageUrl(value: string) {
  return parseCloudinaryUrl(value, false) !== null;
}

export function parseCmsCloudinarySecureUrl(
  value: unknown,
  expected: {
    readonly cloudName: string;
    readonly folder: string;
    readonly publicId: string;
    readonly format: string;
    readonly version: number;
  },
) {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new CmsMediaValidationError("The uploaded image URL is invalid.");
  }

  const parsed = parseCloudinaryUrl(value, true);
  const expectedFormat = parseCmsMediaFormat(expected.format);
  const ownedPrefix = `${expected.folder}/assets/`;

  if (
    !parsed ||
    parsed.cloudName !== expected.cloudName ||
    parsed.publicId !== expected.publicId ||
    parsed.format !== expectedFormat ||
    parsed.version !== expected.version ||
    !parsed.publicId.startsWith(ownedPrefix)
  ) {
    throw new CmsMediaValidationError("The uploaded image URL is invalid.");
  }

  return value;
}

export function isOwnedCloudinaryPublicId(
  publicId: string,
  folder: string,
) {
  return (
    publicId.startsWith(`${folder}/assets/`) &&
    /^[a-z0-9][a-z0-9_/-]{1,240}$/i.test(publicId) &&
    !publicId.includes("..") &&
    !publicId.includes("//")
  );
}

export function isOwnedCmsCloudinaryImageUrl(
  value: string,
  ownership: { readonly cloudName: string; readonly folder: string },
) {
  const parsed = parseCloudinaryUrl(value, true);
  return Boolean(
    parsed &&
      parsed.cloudName === ownership.cloudName &&
      isOwnedCloudinaryPublicId(parsed.publicId, ownership.folder) &&
      ["avif", "jpg", "jpeg", "png", "webp"].includes(parsed.format),
  );
}

export type CmsScopedMediaReference = {
  readonly scope: CmsMediaScope;
  readonly secureUrl: string;
};

export function collectCmsScopedMediaReferences(
  content: CmsContentState,
): readonly CmsScopedMediaReference[] {
  const references: CmsScopedMediaReference[] = [];

  for (const service of content.services ?? []) {
    if (typeof service.imageUrl === "string" && service.imageUrl) {
      references.push({ scope: "service-cover", secureUrl: service.imageUrl });
    }
    if (
      typeof service.hero?.imageUrl === "string" &&
      service.hero.imageUrl &&
      service.hero.imageUrl !== service.imageUrl
    ) {
      references.push({
        scope: "service-cover",
        secureUrl: service.hero.imageUrl,
      });
    }
    for (const image of service.galleryImages ?? []) {
      if (typeof image.imageUrl === "string" && image.imageUrl) {
        references.push({
          scope: "service-gallery",
          secureUrl: image.imageUrl,
        });
      }
    }
  }

  for (const item of content.gallery ?? []) {
    if (typeof item.imageUrl === "string" && item.imageUrl) {
      references.push({ scope: "site-gallery", secureUrl: item.imageUrl });
    }
  }

  for (const page of content.pages ?? []) {
    for (const slide of page.heroSlides ?? []) {
      if (typeof slide.imageUrl === "string" && slide.imageUrl) {
        references.push({ scope: "home-hero", secureUrl: slide.imageUrl });
      }
    }
  }

  return references;
}

function scopedReferenceKey(reference: CmsScopedMediaReference) {
  return `${reference.scope}\u0000${reference.secureUrl}`;
}

export function collectNewCmsScopedMediaReferences(
  current: CmsContentState,
  next: CmsContentState,
) {
  const currentReferences = new Set(
    collectCmsScopedMediaReferences(current).map(scopedReferenceKey),
  );
  return collectCmsScopedMediaReferences(next).filter(
    (reference) => !currentReferences.has(scopedReferenceKey(reference)),
  );
}

export function assertCmsContentImageReferencesApproved(
  content: CmsContentState,
  ownership: {
    readonly cloudName: string;
    readonly folder: string;
  } | null,
) {
  for (const reference of collectCmsScopedMediaReferences(content)) {
    if (isProjectImagePath(reference.secureUrl)) continue;
    if (
      ownership &&
      isOwnedCmsCloudinaryImageUrl(reference.secureUrl, ownership)
    ) {
      continue;
    }
    throw new CmsMediaValidationError(
      "CMS images must use a project image or an uploaded Siriranee Cloudinary image.",
    );
  }
}

export function collectCmsContentImageUrls(content: CmsContentState) {
  return new Set(
    collectCmsScopedMediaReferences(content).map(
      (reference) => reference.secureUrl,
    ),
  );
}

export function cmsContentReferencesMediaAsset(
  content: CmsContentState,
  asset: { readonly publicId: string; readonly secureUrl: string },
) {
  for (const url of collectCmsContentImageUrls(content)) {
    if (url === asset.secureUrl) return true;
    const parsed = parseCloudinaryUrl(url, false);
    if (parsed?.publicId === asset.publicId) return true;
  }

  return false;
}

function collectStrings(value: unknown, results: Set<string>) {
  if (typeof value === "string") {
    results.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, results);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectStrings(nested, results);
  }
}

export function collectSubmittedCloudinaryUrls(value: unknown) {
  const strings = new Set<string>();
  collectStrings(value, strings);
  return new Set([...strings].filter(isCloudinaryImageUrl));
}
