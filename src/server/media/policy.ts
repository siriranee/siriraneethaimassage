import {
  cmsMediaScopes as CMS_MEDIA_SCOPES,
  type CmsMediaScope,
} from "@/domain/cms/types";

export { CMS_MEDIA_SCOPES, type CmsMediaScope };

export const CMS_MEDIA_ALLOWED_CONTENT_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type CmsMediaContentType =
  (typeof CMS_MEDIA_ALLOWED_CONTENT_TYPES)[number];

export const CMS_MEDIA_ALLOWED_FORMATS = [
  "avif",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;
export type CmsMediaFormat = (typeof CMS_MEDIA_ALLOWED_FORMATS)[number];

export const CMS_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const CMS_MEDIA_MAX_EDGE_PIXELS = 4_096;
export const CMS_MEDIA_MAX_TOTAL_PIXELS = 16_000_000;
export const CMS_MEDIA_UPLOAD_TOKEN_TTL_SECONDS = 5 * 60;
export const CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS = 30 * 60;
export const CMS_MEDIA_PROVIDER_SIGNATURE_RETENTION_SECONDS = 65 * 60;

export class CmsMediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsMediaValidationError";
  }
}

export function parseCmsMediaScope(value: unknown): CmsMediaScope {
  if (
    typeof value !== "string" ||
    !CMS_MEDIA_SCOPES.some((scope) => scope === value)
  ) {
    throw new CmsMediaValidationError("Choose a supported image destination.");
  }

  return value as CmsMediaScope;
}

export function parseMediaSubmissionId(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";

  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(result)) {
    throw new CmsMediaValidationError("The image submission ID is invalid.");
  }

  return result;
}

export function parseCmsMediaContentType(value: unknown): CmsMediaContentType {
  if (
    typeof value !== "string" ||
    !CMS_MEDIA_ALLOWED_CONTENT_TYPES.some((type) => type === value)
  ) {
    throw new CmsMediaValidationError(
      "Use an AVIF, JPEG, PNG or WebP image.",
    );
  }

  return value as CmsMediaContentType;
}

export function parseCmsMediaDeclaredBytes(value: unknown) {
  const bytes = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(bytes) || bytes < 1 || bytes > CMS_MEDIA_MAX_BYTES) {
    throw new CmsMediaValidationError(
      "Images must be no larger than 5 MB after compression.",
    );
  }

  return bytes;
}

export function parseCmsMediaFileName(value: unknown) {
  const fileName = typeof value === "string" ? value.trim() : "";

  if (
    fileName.length < 1 ||
    fileName.length > 180 ||
    /[\u0000-\u001f\u007f/\\]/.test(fileName)
  ) {
    throw new CmsMediaValidationError("The image filename is invalid.");
  }

  return fileName;
}

export function validateCmsMediaDimensions(
  widthValue: unknown,
  heightValue: unknown,
) {
  const width = typeof widthValue === "number" ? widthValue : Number(widthValue);
  const height =
    typeof heightValue === "number" ? heightValue : Number(heightValue);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > CMS_MEDIA_MAX_EDGE_PIXELS ||
    height > CMS_MEDIA_MAX_EDGE_PIXELS ||
    width * height > CMS_MEDIA_MAX_TOTAL_PIXELS
  ) {
    throw new CmsMediaValidationError(
      "The compressed image dimensions are outside the allowed range.",
    );
  }

  return { width, height } as const;
}

export function parseCmsMediaFormat(value: unknown): CmsMediaFormat {
  const format = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!CMS_MEDIA_ALLOWED_FORMATS.some((allowed) => allowed === format)) {
    throw new CmsMediaValidationError("The uploaded image format is not allowed.");
  }

  return format as CmsMediaFormat;
}
