const hostedBuild =
  process.env.VERCEL === "1" ||
  process.env.NETLIFY === "true" ||
  process.env.CI === "true";

if (!hostedBuild) {
  console.log(
    "Production origin and CMS provider checks skipped for local build.",
  );
  process.exit(0);
}

const explicitOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const vercelProductionHost =
  process.env.VERCEL === "1"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    : undefined;
const configuredOrigin =
  explicitOrigin ||
  (vercelProductionHost ? `https://${vercelProductionHost}` : undefined);

if (!configuredOrigin) {
  console.error(
    "Hosted build blocked: set NEXT_PUBLIC_SITE_URL to the owner-confirmed production origin. Vercel builds may use VERCEL_PROJECT_PRODUCTION_URL for the initial deployment.",
  );
  process.exit(1);
}

let origin;

try {
  const url = new URL(configuredOrigin);

  if (url.protocol !== "https:") {
    throw new Error("The production origin must use HTTPS.");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "The production origin must not include a path, query string or fragment.",
    );
  }

  origin = url.origin;
} catch (error) {
  console.error(
    `Hosted build blocked: invalid NEXT_PUBLIC_SITE_URL. ${
      error instanceof Error ? error.message : error
    }`,
  );
  process.exit(1);
}

const configuredMode = process.env.CMS_MODE?.trim().toLowerCase();
const cmsMode =
  configuredMode || (process.env.MONGODB_URI?.trim() ? "mongodb" : "disabled");

if (!["disabled", "mongodb"].includes(cmsMode)) {
  console.error(
    "Hosted build blocked: CMS_MODE must be disabled or mongodb. Mock mode is local-only.",
  );
  process.exit(1);
}

if (cmsMode === "mongodb") {
  const required = ["MONGODB_URI", "MONGODB_DB", "CMS_ORIGIN"];
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length) {
    console.error(
      `Hosted build blocked: missing CMS configuration: ${missing.join(", ")}.`,
    );
    process.exit(1);
  }

  try {
    const cmsOrigin = new URL(process.env.CMS_ORIGIN).origin;
    if (cmsOrigin !== origin) {
      throw new Error("CMS_ORIGIN must match NEXT_PUBLIC_SITE_URL.");
    }
  } catch (error) {
    console.error(
      `Hosted build blocked: invalid CMS_ORIGIN. ${
        error instanceof Error ? error.message : error
      }`,
    );
    process.exit(1);
  }

  if (process.env.CMS_COOKIE_SECURE?.trim().toLowerCase() === "false") {
    console.error(
      "Hosted build blocked: CMS_COOKIE_SECURE cannot be false in production.",
    );
    process.exit(1);
  }
}

const mediaReadyValue =
  process.env.CMS_MEDIA_UPLOAD_READY?.trim().toLowerCase() ?? "";
if (mediaReadyValue && !["true", "false"].includes(mediaReadyValue)) {
  console.error(
    "Hosted build blocked: CMS_MEDIA_UPLOAD_READY must be true or false.",
  );
  process.exit(1);
}

const mediaEnvironmentNames = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_UPLOAD_PRESET",
  "CLOUDINARY_FOLDER",
  "CMS_MEDIA_TOKEN_SECRET",
];
const mediaEnvironment = Object.fromEntries(
  mediaEnvironmentNames.map((name) => [name, process.env[name]?.trim() ?? ""]),
);
const configuredMediaNames = mediaEnvironmentNames.filter(
  (name) => mediaEnvironment[name],
);

if (
  configuredMediaNames.length > 0 &&
  configuredMediaNames.length < mediaEnvironmentNames.length
) {
  const missing = mediaEnvironmentNames.filter(
    (name) => !mediaEnvironment[name],
  );
  console.error(
    `Hosted build blocked: incomplete Cloudinary configuration. Missing: ${missing.join(", ")}.`,
  );
  process.exit(1);
}

if (configuredMediaNames.length === mediaEnvironmentNames.length) {
  const invalid = [];
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(mediaEnvironment.CLOUDINARY_CLOUD_NAME)) {
    invalid.push("CLOUDINARY_CLOUD_NAME");
  }
  if (!/^[a-z0-9_-]{4,128}$/i.test(mediaEnvironment.CLOUDINARY_API_KEY)) {
    invalid.push("CLOUDINARY_API_KEY");
  }
  if (Buffer.byteLength(mediaEnvironment.CLOUDINARY_API_SECRET, "utf8") < 16) {
    invalid.push("CLOUDINARY_API_SECRET");
  }
  if (!/^[a-z0-9_-]{1,255}$/i.test(mediaEnvironment.CLOUDINARY_UPLOAD_PRESET)) {
    invalid.push("CLOUDINARY_UPLOAD_PRESET");
  }
  if (
    mediaEnvironment.CLOUDINARY_FOLDER.length > 120 ||
    !/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)+$/i.test(
      mediaEnvironment.CLOUDINARY_FOLDER,
    )
  ) {
    invalid.push("CLOUDINARY_FOLDER");
  }
  if (Buffer.byteLength(mediaEnvironment.CMS_MEDIA_TOKEN_SECRET, "utf8") < 32) {
    invalid.push("CMS_MEDIA_TOKEN_SECRET");
  }
  if (
    mediaEnvironment.CMS_MEDIA_TOKEN_SECRET ===
      mediaEnvironment.CLOUDINARY_API_SECRET ||
    (process.env.CMS_PII_ENCRYPTION_KEY?.trim() &&
      mediaEnvironment.CMS_MEDIA_TOKEN_SECRET ===
        process.env.CMS_PII_ENCRYPTION_KEY.trim())
  ) {
    invalid.push("CMS_MEDIA_TOKEN_SECRET must be a separate secret");
  }

  if (invalid.length) {
    console.error(
      `Hosted build blocked: invalid Cloudinary configuration: ${invalid.join(", ")}.`,
    );
    process.exit(1);
  }
}

if (mediaReadyValue === "true") {
  if (cmsMode !== "mongodb") {
    console.error(
      "Hosted build blocked: Cloudinary CMS uploads require CMS_MODE=mongodb.",
    );
    process.exit(1);
  }
  if (configuredMediaNames.length !== mediaEnvironmentNames.length) {
    console.error(
      "Hosted build blocked: Cloudinary CMS uploads require complete media configuration.",
    );
    process.exit(1);
  }
}

const readyValue = process.env.CMS_PUBLIC_BOOKING_READY?.trim().toLowerCase() ?? "";
if (readyValue && !["true", "false"].includes(readyValue)) {
  console.error(
    "Hosted build blocked: CMS_PUBLIC_BOOKING_READY must be true or false.",
  );
  process.exit(1);
}

const privacyApproved =
  process.env.CMS_PRIVACY_NOTICE_APPROVED?.trim().toLowerCase() ?? "";
const notificationReady =
  process.env.CMS_BOOKING_NOTIFICATION_READY?.trim().toLowerCase() ?? "";
const monitoringReady =
  process.env.CMS_MONITORING_READY?.trim().toLowerCase() ?? "";
const recoveryVerified =
  process.env.CMS_RECOVERY_DRILL_VERIFIED?.trim().toLowerCase() ?? "";

for (const [name, value] of [
  ["CMS_PRIVACY_NOTICE_APPROVED", privacyApproved],
  ["CMS_BOOKING_NOTIFICATION_READY", notificationReady],
  ["CMS_MONITORING_READY", monitoringReady],
  ["CMS_RECOVERY_DRILL_VERIFIED", recoveryVerified],
]) {
  if (value && !["true", "false"].includes(value)) {
    console.error(`Hosted build blocked: ${name} must be true or false.`);
    process.exit(1);
  }
}

if (readyValue === "true") {
  if (cmsMode !== "mongodb") {
    console.error(
      "Hosted build blocked: live public booking requires CMS_MODE=mongodb.",
    );
    process.exit(1);
  }

  if (privacyApproved !== "true") {
    console.error(
      "Hosted build blocked: live public booking requires CMS_PRIVACY_NOTICE_APPROVED=true.",
    );
    process.exit(1);
  }

  if (notificationReady !== "true") {
    console.error(
      "Hosted build blocked: live public booking requires CMS_BOOKING_NOTIFICATION_READY=true.",
    );
    process.exit(1);
  }

  if (monitoringReady !== "true") {
    console.error(
      "Hosted build blocked: live public booking requires CMS_MONITORING_READY=true.",
    );
    process.exit(1);
  }

  if (recoveryVerified !== "true") {
    console.error(
      "Hosted build blocked: live public booking requires CMS_RECOVERY_DRILL_VERIFIED=true.",
    );
    process.exit(1);
  }

  const configuredKey = process.env.CMS_PII_ENCRYPTION_KEY?.trim() ?? "";
  let bookingKey;

  try {
    bookingKey = /^[a-f\d]{64}$/i.test(configuredKey)
      ? Buffer.from(configuredKey, "hex")
      : Buffer.from(configuredKey, "base64url");
  } catch {
    bookingKey = Buffer.alloc(0);
  }

  if (bookingKey.length !== 32) {
    console.error(
      "Hosted build blocked: live public booking requires a CMS_PII_ENCRYPTION_KEY that decodes to exactly 32 bytes.",
    );
    process.exit(1);
  }
}

console.log(
  `Production origin configured: ${origin}; CMS mode: ${cmsMode}; media uploads: ${
    mediaReadyValue === "true" ? "ready gate enabled" : "disabled"
  }; public booking: ${
    readyValue === "true" ? "ready gate enabled" : "disabled"
  }.`,
);
