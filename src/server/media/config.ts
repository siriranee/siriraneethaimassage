import "server-only";

import { getCmsMode } from "@/server/cms/config";

const requiredEnvironmentVariables = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_UPLOAD_PRESET",
  "CLOUDINARY_FOLDER",
  "CMS_MEDIA_TOKEN_SECRET",
] as const;

type RequiredEnvironmentVariable =
  (typeof requiredEnvironmentVariables)[number];

export type CloudinaryMediaConfig = {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly uploadPreset: string;
  readonly folder: string;
  readonly tokenSecret: string;
};

export class CmsMediaConfigurationError extends Error {
  constructor() {
    super("Image uploads are not configured yet.");
    this.name = "CmsMediaConfigurationError";
  }
}

function clean(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function configuredValues() {
  return {
    CLOUDINARY_CLOUD_NAME: clean(process.env.CLOUDINARY_CLOUD_NAME),
    CLOUDINARY_API_KEY: clean(process.env.CLOUDINARY_API_KEY),
    CLOUDINARY_API_SECRET: clean(process.env.CLOUDINARY_API_SECRET),
    CLOUDINARY_UPLOAD_PRESET: clean(process.env.CLOUDINARY_UPLOAD_PRESET),
    CLOUDINARY_FOLDER: clean(process.env.CLOUDINARY_FOLDER),
    CMS_MEDIA_TOKEN_SECRET: clean(process.env.CMS_MEDIA_TOKEN_SECRET),
  } satisfies Record<RequiredEnvironmentVariable, string>;
}

function invalidConfiguredValues(
  values: ReturnType<typeof configuredValues>,
) {
  const invalid: RequiredEnvironmentVariable[] = [];

  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(values.CLOUDINARY_CLOUD_NAME)) {
    invalid.push("CLOUDINARY_CLOUD_NAME");
  }
  if (!/^[a-z0-9_-]{4,128}$/i.test(values.CLOUDINARY_API_KEY)) {
    invalid.push("CLOUDINARY_API_KEY");
  }
  if (Buffer.byteLength(values.CLOUDINARY_API_SECRET, "utf8") < 16) {
    invalid.push("CLOUDINARY_API_SECRET");
  }
  if (!/^[a-z0-9_-]{1,255}$/i.test(values.CLOUDINARY_UPLOAD_PRESET)) {
    invalid.push("CLOUDINARY_UPLOAD_PRESET");
  }
  if (
    !/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)+$/i.test(
      values.CLOUDINARY_FOLDER,
    ) ||
    values.CLOUDINARY_FOLDER.length > 120
  ) {
    invalid.push("CLOUDINARY_FOLDER");
  }
  if (Buffer.byteLength(values.CMS_MEDIA_TOKEN_SECRET, "utf8") < 32) {
    invalid.push("CMS_MEDIA_TOKEN_SECRET");
  }
  const piiSecret = clean(process.env.CMS_PII_ENCRYPTION_KEY);
  if (
    values.CMS_MEDIA_TOKEN_SECRET &&
    (values.CMS_MEDIA_TOKEN_SECRET === values.CLOUDINARY_API_SECRET ||
      (piiSecret && values.CMS_MEDIA_TOKEN_SECRET === piiSecret)) &&
    !invalid.includes("CMS_MEDIA_TOKEN_SECRET")
  ) {
    invalid.push("CMS_MEDIA_TOKEN_SECRET");
  }

  return invalid;
}

export function getCloudinaryMediaReadiness() {
  const values = configuredValues();
  const missing = requiredEnvironmentVariables.filter((name) => !values[name]);
  const invalid = invalidConfiguredValues(values).filter(
    (name) => !missing.includes(name),
  );
  let cmsMode = "unavailable";

  try {
    cmsMode = getCmsMode();
  } catch {
    cmsMode = "invalid";
  }

  const approved =
    clean(process.env.CMS_MEDIA_UPLOAD_READY).toLowerCase() === "true";
  const ready =
    cmsMode === "mongodb" && approved && !missing.length && !invalid.length;

  return {
    ready,
    cmsMode,
    approved,
    missing,
    invalid,
  } as const;
}

export function getCloudinaryMediaOwnershipConfig() {
  const values = configuredValues();
  if (
    !/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(values.CLOUDINARY_CLOUD_NAME) ||
    !/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)+$/i.test(
      values.CLOUDINARY_FOLDER,
    ) ||
    values.CLOUDINARY_FOLDER.length > 120
  ) {
    return null;
  }

  return {
    cloudName: values.CLOUDINARY_CLOUD_NAME,
    folder: values.CLOUDINARY_FOLDER,
  } as const;
}

export function getCloudinaryMediaConfig(): CloudinaryMediaConfig {
  const readiness = getCloudinaryMediaReadiness();
  if (!readiness.ready) throw new CmsMediaConfigurationError();

  const values = configuredValues();
  return {
    cloudName: values.CLOUDINARY_CLOUD_NAME,
    apiKey: values.CLOUDINARY_API_KEY,
    apiSecret: values.CLOUDINARY_API_SECRET,
    uploadPreset: values.CLOUDINARY_UPLOAD_PRESET,
    folder: values.CLOUDINARY_FOLDER,
    tokenSecret: values.CMS_MEDIA_TOKEN_SECRET,
  };
}
