import "server-only";

export const cmsModes = ["disabled", "mock", "mongodb"] as const;
export type CmsMode = (typeof cmsModes)[number];

function clean(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function isProductionEnvironment() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.NETLIFY === "true" ||
    process.env.CI === "true"
  );
}

export function getCmsMode(): CmsMode {
  const configured = clean(process.env.CMS_MODE).toLowerCase();

  if (configured) {
    if (!cmsModes.some((mode) => mode === configured)) {
      throw new Error("CMS_MODE must be disabled, mock or mongodb.");
    }

    if (configured === "mock" && isProductionEnvironment()) {
      throw new Error(
        "CMS mock mode is local-development only and cannot run in production, hosted builds or CI.",
      );
    }

    return configured as CmsMode;
  }

  if (clean(process.env.MONGODB_URI)) {
    return "mongodb";
  }

  return isProductionEnvironment() ? "disabled" : "mock";
}

export function getMongoDatabaseName() {
  return clean(process.env.MONGODB_DB) || "siriranee";
}

export function getCmsOrigin() {
  const configured = clean(process.env.CMS_ORIGIN);
  if (!configured) return null;

  try {
    return new URL(configured).origin;
  } catch {
    throw new Error("CMS_ORIGIN must be a valid absolute URL.");
  }
}

export function isCmsMockMode() {
  return getCmsMode() === "mock";
}

export function assertCmsWriteMode() {
  const mode = getCmsMode();

  if (mode === "disabled") {
    throw new Error("CMS writes are disabled until a persistence provider is configured.");
  }

  return mode;
}
