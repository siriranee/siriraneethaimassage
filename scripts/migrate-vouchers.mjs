import { createHash, randomUUID } from "node:crypto";
import { realpath, readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { v2 as cloudinary } from "cloudinary";
import { MongoClient } from "mongodb";

const MIGRATION_NAME = "siriranee-vouchers-v1";
const MIGRATION_ACTOR_ID = "system-voucher-migration";
const MIGRATION_ACTOR_NAME = "Voucher migration";
const MEDIA_SCOPE = "voucher-image";
const MINIMUM_CONTENT_SCHEMA_VERSION = 7;
const AUDIT_RETENTION_DAYS = 365;
const MAXIMUM_IMAGE_BYTES = 5 * 1024 * 1024;
const MAXIMUM_IMAGE_EDGE = 4_096;
const MAXIMUM_IMAGE_PIXELS = 16_000_000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const CLOUDINARY_RECONCILIATION_DELAYS_MS = [0, 250, 750, 1_500, 3_000, 5_000];
const MONGO_COMMIT_RECONCILIATION_DELAYS_MS = [
  0,
  250,
  750,
  1_500,
  3_000,
  5_000,
  10_000,
];
const STORED_CONTENT_FIELDS = [
  "_id",
  "bookingSettings",
  "promotions",
  "revision",
  "schemaVersion",
  "services",
  "site",
  "team",
  "updatedAt",
  "updatedBy",
  "vouchers",
].sort();
const PUBLICATION_SNAPSHOT_FIELDS = [
  "bookingSettings",
  "id",
  "promotions",
  "revision",
  "schemaVersion",
  "services",
  "site",
  "team",
  "updatedAt",
  "updatedBy",
  "vouchers",
].sort();

const defaultVouchers = [
  {
    imagePath:
      "C:\\Coding\\2026\\00-Files\\Siriranee Thai massage\\Design\\Drive\\gift voucher copy.jpg",
    title: "Gift Voucher",
  },
  {
    imagePath:
      "C:\\Coding\\2026\\00-Files\\Siriranee Thai massage\\Design\\Drive\\9 free 1.jpg",
    title: "9 Visits + 1 Free",
  },
];

const allowedFormats = new Set(["avif", "jpg", "jpeg", "png", "webp"]);

function usage() {
  return [
    "Usage:",
    "  node --env-file-if-exists=.env.local scripts/migrate-vouchers.mjs",
    "  node --env-file-if-exists=.env.local scripts/migrate-vouchers.mjs --apply",
    "  node --env-file-if-exists=.env.local scripts/migrate-vouchers.mjs --apply --image \"C:\\path\\first.jpg\" --title \"First title\" --image \"C:\\path\\second.jpg\" --title \"Second title\"",
    "",
    "Without --apply, the command performs read-only validation and reports its plan.",
    "Provide exactly two --image and two --title values, or omit both to use the approved defaults.",
    "Optional: provide exactly two --alt values to override generated image alt text.",
  ].join("\n");
}

function cleanEnvironmentValue(value) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function requireEnvironment(name) {
  const value = cleanEnvironmentValue(process.env[name]);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readConfiguration() {
  const configuration = {
    mongoUri: requireEnvironment("MONGODB_URI"),
    databaseName: cleanEnvironmentValue(process.env.MONGODB_DB) || "siriranee",
    cloudName: requireEnvironment("CLOUDINARY_CLOUD_NAME"),
    apiKey: requireEnvironment("CLOUDINARY_API_KEY"),
    apiSecret: requireEnvironment("CLOUDINARY_API_SECRET"),
    folder: requireEnvironment("CLOUDINARY_FOLDER"),
  };

  const configuredMode = cleanEnvironmentValue(process.env.CMS_MODE).toLowerCase();
  if (configuredMode && configuredMode !== "mongodb") {
    throw new Error("CMS_MODE must be mongodb for this migration.");
  }
  if (
    cleanEnvironmentValue(process.env.CMS_MEDIA_UPLOAD_READY).toLowerCase() !==
    "true"
  ) {
    throw new Error(
      "CMS_MEDIA_UPLOAD_READY must be true before voucher migration.",
    );
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(configuration.cloudName)) {
    throw new Error("CLOUDINARY_CLOUD_NAME is invalid.");
  }
  if (!/^[a-z0-9_-]{4,128}$/i.test(configuration.apiKey)) {
    throw new Error("CLOUDINARY_API_KEY is invalid.");
  }
  if (Buffer.byteLength(configuration.apiSecret, "utf8") < 16) {
    throw new Error("CLOUDINARY_API_SECRET is invalid.");
  }
  if (
    !/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)+$/i.test(
      configuration.folder,
    ) ||
    configuration.folder.length > 120
  ) {
    throw new Error("CLOUDINARY_FOLDER is invalid.");
  }

  return configuration;
}

export function parseArguments(argumentsToParse) {
  const images = [];
  const titles = [];
  const altTexts = [];
  let apply = false;
  let help = false;

  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--image" || argument === "--title" || argument === "--alt") {
      const value = argumentsToParse[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === "--image") images.push(value);
      if (argument === "--title") titles.push(value);
      if (argument === "--alt") altTexts.push(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (help) return { help, apply, vouchers: [] };

  const hasImageOrTitleOverrides = images.length > 0 || titles.length > 0;
  if (
    hasImageOrTitleOverrides &&
    (images.length !== 2 || titles.length !== 2)
  ) {
    throw new Error(
      "Overrides require exactly two --image values and two --title values.",
    );
  }
  if (altTexts.length !== 0 && altTexts.length !== 2) {
    throw new Error("Provide either zero or exactly two --alt values.");
  }

  const vouchers = hasImageOrTitleOverrides
    ? images.map((imagePath, index) => ({
        imagePath,
        title: titles[index],
        altText: altTexts[index],
      }))
    : defaultVouchers.map((voucher, index) => ({
        ...voucher,
        altText: altTexts[index],
      }));

  return { help, apply, vouchers };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normaliseTitle(value) {
  return value.trim().replace(/\s+/g, " ");
}

function titleKey(value) {
  return normaliseTitle(value).toLocaleLowerCase("en-IE");
}

function slug(value) {
  const result = normaliseTitle(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return result || "voucher";
}

function detectImageFormat(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis"].includes(buffer.subarray(8, 12).toString("ascii"))
  ) {
    return "avif";
  }
  return "";
}

function canonicalExtension(value) {
  const extension = extname(value).slice(1).toLowerCase();
  return extension === "jpeg" ? "jpg" : extension;
}

function assertTitle(value, index) {
  const title = typeof value === "string" ? normaliseTitle(value) : "";
  if (title.length < 2 || title.length > 120) {
    throw new Error(`Voucher ${index + 1} title must contain 2 to 120 characters.`);
  }
  return title;
}

function assertAltText(value, title, index) {
  const altText = value ? normaliseTitle(value) : `${title} artwork`;
  if (altText.length < 4 || altText.length > 180) {
    throw new Error(
      `Voucher ${index + 1} alt text must contain 4 to 180 characters.`,
    );
  }
  return altText;
}

async function prepareVoucherInputs(vouchers, folder) {
  if (vouchers.length !== 2) throw new Error("Exactly two vouchers are required.");
  const prepared = [];

  for (const [index, voucher] of vouchers.entries()) {
    const title = assertTitle(voucher.title, index);
    const altText = assertAltText(voucher.altText, title, index);
    const requestedPath = String(voucher.imagePath ?? "").trim();
    if (!requestedPath) throw new Error(`Voucher ${index + 1} image path is required.`);

    const imagePath = await realpath(requestedPath);
    const fileStat = await stat(imagePath);
    if (!fileStat.isFile()) {
      throw new Error(`Voucher ${index + 1} image path is not a file.`);
    }
    if (fileStat.size < 1 || fileStat.size > MAXIMUM_IMAGE_BYTES) {
      throw new Error(`Voucher ${index + 1} image must be no larger than 5 MB.`);
    }

    const bytes = await readFile(imagePath);
    const format = detectImageFormat(bytes);
    const extension = canonicalExtension(imagePath);
    if (!format || !allowedFormats.has(extension) || format !== extension) {
      throw new Error(
        `Voucher ${index + 1} must be an AVIF, JPEG, PNG or WebP file whose extension matches its contents.`,
      );
    }

    const sourceSha256 = sha256(bytes);
    const publicId = `${folder}/assets/${MEDIA_SCOPE}/${slug(title)}-${sourceSha256.slice(0, 20)}`;
    const candidateVoucherId = `voucher-${sha256(`${MIGRATION_NAME}|${titleKey(title)}`).slice(0, 24)}`;

    prepared.push({
      index,
      title,
      altText,
      imagePath,
      fileName: basename(imagePath),
      sourceBytes: fileStat.size,
      sourceFormat: format,
      sourceSha256,
      sourceBuffer: bytes,
      publicId,
      candidateVoucherId,
    });
  }

  if (new Set(prepared.map((voucher) => titleKey(voucher.title))).size !== 2) {
    throw new Error("Voucher titles must be distinct.");
  }
  if (new Set(prepared.map((voucher) => voucher.publicId)).size !== 2) {
    throw new Error("Voucher images must resolve to distinct Cloudinary assets.");
  }

  return prepared;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactTopLevelFields(value, expectedFields) {
  return isDeepStrictEqual(Object.keys(value ?? {}).sort(), expectedFields);
}

function assertContentDocument(content) {
  if (!content || content._id !== "siriranee-content") {
    throw new Error("The current Siriranee CMS content document was not found.");
  }
  if (!Number.isInteger(content.revision) || content.revision < 1) {
    throw new Error("The current CMS content revision is invalid.");
  }
  if (
    !Array.isArray(content.services) ||
    !isPlainObject(content.site) ||
    !isPlainObject(content.bookingSettings) ||
    !Array.isArray(content.team) ||
    !Array.isArray(content.promotions) ||
    (content.vouchers !== undefined && !Array.isArray(content.vouchers))
  ) {
    throw new Error("The current CMS content document has an unsupported shape.");
  }
  if (
    !Number.isInteger(content.schemaVersion) ||
    ![6, 7].includes(content.schemaVersion)
  ) {
    throw new Error(
      "The current CMS content must use supported schema version 6 or 7.",
    );
  }
}

function assertPlainRecordArray(value, label) {
  if (!Array.isArray(value) || value.some((record) => !isPlainObject(record))) {
    throw new Error(`The published CMS ${label} field has an unsupported shape.`);
  }
}

export function assertSupportedPublicationSnapshot(snapshot) {
  if (!isPlainObject(snapshot) || snapshot.id !== "siriranee-content") {
    throw new Error("The current CMS publication snapshot is invalid.");
  }
  if (
    !Number.isInteger(snapshot.schemaVersion) ||
    ![6, 7].includes(snapshot.schemaVersion)
  ) {
    throw new Error(
      "The current CMS publication must use supported schema version 6 or 7.",
    );
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
    throw new Error("The current CMS publication snapshot revision is invalid.");
  }

  assertPlainRecordArray(snapshot.services, "services");
  if (!isPlainObject(snapshot.site)) {
    throw new Error("The published CMS site field has an unsupported shape.");
  }
  if (!isPlainObject(snapshot.bookingSettings)) {
    throw new Error(
      "The published CMS bookingSettings field has an unsupported shape.",
    );
  }
  assertPlainRecordArray(snapshot.team, "team");
  assertPlainRecordArray(snapshot.promotions, "promotions");
  if (
    snapshot.vouchers !== undefined &&
    (!Array.isArray(snapshot.vouchers) ||
      snapshot.vouchers.some((record) => !isPlainObject(record)))
  ) {
    throw new Error("The published CMS vouchers field has an unsupported shape.");
  }
  if (
    typeof snapshot.updatedAt !== "string" ||
    typeof snapshot.updatedBy !== "string"
  ) {
    throw new Error("The current CMS publication metadata is invalid.");
  }
}

function resolveVoucherPlans(currentVouchers, preparedVouchers) {
  const plans = [];
  for (const prepared of preparedVouchers) {
    const matchingId = currentVouchers.find(
      (voucher) => voucher?.id === prepared.candidateVoucherId,
    );
    const matchingTitles = currentVouchers.filter(
      (voucher) =>
        typeof voucher?.title === "string" &&
        titleKey(voucher.title) === titleKey(prepared.title),
    );
    if (matchingTitles.length > 1) {
      throw new Error(`More than one existing voucher is titled “${prepared.title}”.`);
    }
    const matchingTitle = matchingTitles[0];
    if (matchingId && matchingTitle && matchingId.id !== matchingTitle.id) {
      throw new Error(
        `Existing voucher identity conflicts for “${prepared.title}”.`,
      );
    }
    const existing = matchingId ?? matchingTitle ?? null;
    if (existing && typeof existing.id !== "string") {
      throw new Error(`The existing voucher “${prepared.title}” has an invalid ID.`);
    }
    plans.push({
      ...prepared,
      voucherId: existing?.id ?? prepared.candidateVoucherId,
    });
  }

  if (new Set(plans.map((plan) => plan.voucherId)).size !== plans.length) {
    throw new Error("The supplied vouchers resolve to the same CMS record.");
  }
  return plans;
}

function voucherCoreMatches(voucher, desired) {
  return (
    voucher?.id === desired.id &&
    voucher?.title === desired.title &&
    voucher?.imageUrl === desired.imageUrl &&
    voucher?.imageAlt === desired.imageAlt &&
    voucher?.status === "published" &&
    voucher?.sortOrder === desired.sortOrder
  );
}

function voucherHasCanonicalShape(voucher) {
  return isDeepStrictEqual(
    Object.keys(voucher ?? {}).sort(),
    [
      "id",
      "imageAlt",
      "imageUrl",
      "sortOrder",
      "status",
      "title",
      "updatedAt",
      "version",
    ],
  );
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function voucherMetadataIsValid(voucher) {
  return (
    Number.isInteger(voucher?.version) &&
    voucher.version >= 1 &&
    isIsoTimestamp(voucher.updatedAt)
  );
}

function voucherRecordMatches(voucher, desired) {
  return (
    voucherCoreMatches(voucher, desired) &&
    voucherHasCanonicalShape(voucher) &&
    voucherMetadataIsValid(voucher) &&
    (desired.version === undefined || voucher.version === desired.version) &&
    (desired.updatedAt === undefined || voucher.updatedAt === desired.updatedAt)
  );
}

function buildVoucherRecords(currentVouchers, plans, uploadedAssets, timestamp) {
  const assetsByPublicId = new Map(
    uploadedAssets.map((asset) => [asset.publicId, asset]),
  );

  return plans.map((plan) => {
    const asset = assetsByPublicId.get(plan.publicId);
    if (!asset) throw new Error(`Cloudinary asset is missing for “${plan.title}”.`);
    const existing = currentVouchers.find((voucher) => voucher?.id === plan.voucherId);
    const existingVersion = Number.isInteger(existing?.version) && existing.version >= 1
      ? existing.version
      : 0;
    const desired = {
      id: plan.voucherId,
      title: plan.title,
      imageUrl: asset.secureUrl,
      imageAlt: plan.altText,
      status: "published",
      sortOrder: plan.index,
    };
    const unchanged = Boolean(
      existing &&
        voucherCoreMatches(existing, desired) &&
        voucherHasCanonicalShape(existing) &&
        voucherMetadataIsValid(existing),
    );
    return {
      ...desired,
      version: unchanged ? existingVersion : existingVersion + 1,
      updatedAt: unchanged && typeof existing.updatedAt === "string"
        ? existing.updatedAt
        : timestamp,
    };
  });
}

function replaceVoucherRecords(desiredVouchers) {
  return [...desiredVouchers].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
}

function providerContext(resource) {
  if (!isPlainObject(resource?.context)) return {};
  return isPlainObject(resource.context.custom)
    ? resource.context.custom
    : resource.context;
}

function isCloudinaryNotFound(error) {
  return (
    Number(error?.http_code ?? error?.error?.http_code) === 404 ||
    /not found/i.test(String(error?.message ?? ""))
  );
}

async function findCloudinaryResource(publicId) {
  try {
    return await cloudinary.api.resource(publicId, {
      resource_type: "image",
      type: "upload",
      context: true,
      tags: true,
    });
  } catch (error) {
    if (isCloudinaryNotFound(error)) return null;
    throw error;
  }
}

async function findCloudinaryResourceByAssetId(providerAssetId) {
  try {
    return await cloudinary.api.resource_by_asset_id(providerAssetId, {
      context: true,
      tags: true,
    });
  } catch (error) {
    if (isCloudinaryNotFound(error)) return null;
    throw error;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reconcileCloudinaryResource(publicId) {
  let lastLookupSucceeded = false;
  let lastError = null;
  for (const waitMilliseconds of CLOUDINARY_RECONCILIATION_DELAYS_MS) {
    if (waitMilliseconds) await delay(waitMilliseconds);
    try {
      const resource = await findCloudinaryResource(publicId);
      lastLookupSucceeded = true;
      lastError = null;
      if (resource) return { resource, confirmedAbsent: false, lastError };
    } catch (error) {
      lastLookupSucceeded = false;
      lastError = error;
    }
  }
  return {
    resource: null,
    confirmedAbsent: lastLookupSucceeded,
    lastError,
  };
}

function uploadCloudinaryBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error("Cloudinary returned an empty upload response."));
      },
    );
    stream.once("error", reject);
    stream.end(buffer);
  });
}

function validateSecureUrl(secureUrl, expected) {
  let url;
  try {
    url = new URL(secureUrl);
  } catch {
    throw new Error(`Cloudinary returned an invalid URL for “${expected.title}”.`);
  }
  const expectedPath = `/${expected.cloudName}/image/upload/v${expected.version}/${expected.publicId}.${expected.format}`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes("%") ||
    url.pathname.includes("\\") ||
    decodeURIComponent(url.pathname) !== expectedPath
  ) {
    throw new Error(`Cloudinary returned an unexpected URL for “${expected.title}”.`);
  }
}

function validateCloudinaryResource(resource, plan, configuration) {
  if (!plan) {
    throw new Error("No voucher plan matches the Cloudinary asset.");
  }
  if (!isPlainObject(resource)) {
    throw new Error(`Cloudinary asset is unavailable for “${plan.title}”.`);
  }
  const format = String(resource.format ?? "").toLowerCase();
  const version = Number(resource.version);
  const bytes = Number(resource.bytes);
  const width = Number(resource.width);
  const height = Number(resource.height);
  const assetId = String(resource.asset_id ?? "").trim();
  const secureUrl = String(resource.secure_url ?? "").trim();
  const context = providerContext(resource);

  if (
    resource.public_id !== plan.publicId ||
    resource.resource_type !== "image" ||
    resource.type !== "upload" ||
    !allowedFormats.has(format) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !Number.isInteger(bytes) ||
    bytes < 1 ||
    bytes > MAXIMUM_IMAGE_BYTES ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAXIMUM_IMAGE_EDGE ||
    height > MAXIMUM_IMAGE_EDGE ||
    width * height > MAXIMUM_IMAGE_PIXELS ||
    !assetId ||
    context.siriranee_migration !== MIGRATION_NAME ||
    context.siriranee_scope !== MEDIA_SCOPE ||
    context.siriranee_source_sha256 !== plan.sourceSha256
  ) {
    throw new Error(
      `The deterministic Cloudinary asset for “${plan.title}” does not match this migration.`,
    );
  }

  validateSecureUrl(secureUrl, {
    title: plan.title,
    cloudName: configuration.cloudName,
    version,
    publicId: plan.publicId,
    format,
  });

  return {
    provider: "cloudinary",
    providerAssetId: assetId,
    publicId: plan.publicId,
    secureUrl,
    cloudinaryVersion: version,
    format,
    bytes,
    width,
    height,
    migrationRun: String(context.siriranee_migration_run ?? ""),
  };
}

function proveCloudinaryRunOwnership(resource, plan, runId) {
  if (!isPlainObject(resource)) return null;
  const context = providerContext(resource);
  const providerAssetId = String(resource.asset_id ?? "").trim();
  if (
    resource.public_id !== plan.publicId ||
    resource.resource_type !== "image" ||
    resource.type !== "upload" ||
    !providerAssetId ||
    context.siriranee_migration !== MIGRATION_NAME ||
    context.siriranee_scope !== MEDIA_SCOPE ||
    context.siriranee_source_sha256 !== plan.sourceSha256 ||
    context.siriranee_migration_run !== runId
  ) {
    return null;
  }
  return {
    publicId: plan.publicId,
    providerAssetId,
    secureUrl: String(resource.secure_url ?? "").trim(),
  };
}

export async function assertExistingAssetIsCommitted(db, asset, plan) {
  const exactMedia = await db.collection("cmsMediaAssets").findOne({
    status: "committed",
    providerAssetId: asset.providerAssetId,
    publicId: asset.publicId,
    secureUrl: asset.secureUrl,
  });
  let exactContentReference = false;
  if (!exactMedia && asset.secureUrl) {
    const content = await db.collection("cmsContent").findOne({
      _id: "siriranee-content",
      "vouchers.imageUrl": asset.secureUrl,
    });
    const publication = content
      ? null
      : await db.collection("cmsPublications").findOne({
          "snapshot.vouchers.imageUrl": asset.secureUrl,
        });
    exactContentReference = Boolean(content || publication);
  }

  if (!exactMedia && !exactContentReference) {
    throw new Error(
      `The deterministic Cloudinary asset for “${plan.title}” exists but is not committed in MongoDB. Refusing unsafe reuse.`,
    );
  }
}

async function acquireCloudinaryAsset(plan, configuration, runId, db) {
  const existing = await findCloudinaryResource(plan.publicId);
  if (existing) {
    const asset = validateCloudinaryResource(existing, plan, configuration);
    await assertExistingAssetIsCommitted(db, asset, plan);
    return {
      asset,
      newlyUploaded: false,
    };
  }

  let uploadResponse = null;
  try {
    uploadResponse = await uploadCloudinaryBuffer(plan.sourceBuffer, {
      resource_type: "image",
      type: "upload",
      public_id: plan.publicId,
      overwrite: false,
      unique_filename: false,
      use_filename: false,
      tags: [
        "siriranee-cms",
        "siriranee-cms-committed",
        "siriranee-voucher-migration",
      ],
      context: `siriranee_migration=${MIGRATION_NAME}|siriranee_migration_run=${runId}|siriranee_scope=${MEDIA_SCOPE}|siriranee_source_sha256=${plan.sourceSha256}`,
    });
    const uploaded = await findCloudinaryResource(plan.publicId);
    const asset = validateCloudinaryResource(uploaded, plan, configuration);
    const responseOwnership = proveCloudinaryRunOwnership(
      uploadResponse,
      plan,
      runId,
    );
    if (
      asset.migrationRun !== runId ||
      !responseOwnership ||
      asset.providerAssetId !== responseOwnership.providerAssetId
    ) {
      throw new Error(`Cloudinary upload ownership changed for “${plan.title}”.`);
    }
    return { asset, newlyUploaded: true };
  } catch (uploadError) {
    const reconciliation = await reconcileCloudinaryResource(plan.publicId);
    const afterError = reconciliation.resource;
    const ownership = proveCloudinaryRunOwnership(
      afterError ?? uploadResponse,
      plan,
      runId,
    );
    if (ownership) {
      const error = new Error(
        `Cloudinary upload response was ambiguous for “${plan.title}”.`,
      );
      error.cause = uploadError;
      error.recoveredAsset = ownership;
      throw error;
    }
    if (afterError) {
      const concurrentlyUploaded = validateCloudinaryResource(
        afterError,
        plan,
        configuration,
      );
      if (concurrentlyUploaded.migrationRun !== runId) {
        await assertExistingAssetIsCommitted(
          db,
          concurrentlyUploaded,
          plan,
        );
        return { asset: concurrentlyUploaded, newlyUploaded: false };
      }
    }
    if (!reconciliation.confirmedAbsent) {
      const error = new Error(
        `Cloudinary upload outcome remained indeterminate for “${plan.title}”; no destructive cleanup was attempted for the unverified asset.`,
      );
      error.cause = reconciliation.lastError ?? uploadError;
      error.cloudinaryOutcomeIndeterminate = true;
      throw error;
    }
    throw uploadError;
  }
}

function mediaRecordMatches(record, asset) {
  return (
    record?._id === asset.publicId &&
    record.provider === "cloudinary" &&
    record.providerAssetId === asset.providerAssetId &&
    record.publicId === asset.publicId &&
    record.secureUrl === asset.secureUrl &&
    record.cloudinaryVersion === asset.cloudinaryVersion &&
    record.scope === MEDIA_SCOPE &&
    record.format === asset.format &&
    record.bytes === asset.bytes &&
    record.width === asset.width &&
    record.height === asset.height &&
    record.status === "committed"
  );
}

function createMediaRecord(asset, submissionId, timestamp) {
  return {
    _id: asset.publicId,
    provider: "cloudinary",
    providerAssetId: asset.providerAssetId,
    publicId: asset.publicId,
    secureUrl: asset.secureUrl,
    cloudinaryVersion: asset.cloudinaryVersion,
    scope: MEDIA_SCOPE,
    submissionId,
    ownerUserId: MIGRATION_ACTOR_ID,
    format: asset.format,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    status: "committed",
    providerSignatureExpiresAt: timestamp,
    expiresAt: timestamp,
    committedAt: timestamp,
    deletedAt: "",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createContentDocument(current, vouchers, revision, timestamp) {
  return {
    _id: "siriranee-content",
    schemaVersion: MINIMUM_CONTENT_SCHEMA_VERSION,
    revision,
    services: structuredClone(current.services),
    site: structuredClone(current.site),
    bookingSettings: structuredClone(current.bookingSettings),
    team: structuredClone(current.team),
    promotions: structuredClone(current.promotions),
    vouchers,
    updatedAt: timestamp,
    updatedBy: MIGRATION_ACTOR_ID,
  };
}

export function createPublicationSnapshot(
  currentPublication,
  nextContent,
  desiredVouchers,
) {
  const publishedBase = currentPublication.snapshot;
  assertSupportedPublicationSnapshot(publishedBase);

  return {
    id: "siriranee-content",
    schemaVersion: MINIMUM_CONTENT_SCHEMA_VERSION,
    revision: nextContent.revision,
    services: structuredClone(publishedBase.services),
    site: structuredClone(publishedBase.site),
    bookingSettings: structuredClone(publishedBase.bookingSettings),
    team: structuredClone(publishedBase.team),
    promotions: structuredClone(publishedBase.promotions),
    vouchers: replaceVoucherRecords(desiredVouchers),
    updatedAt: nextContent.updatedAt,
    updatedBy: nextContent.updatedBy,
  };
}

async function readCurrentPublication(db, session) {
  const options = session ? { session } : undefined;
  const pointer = await db
    .collection("cmsMeta")
    .findOne({ _id: "current-publication" }, options);
  if (!pointer) {
    throw new Error(
      "An existing current CMS publication is required before voucher migration.",
    );
  }
  if (typeof pointer.publicationId !== "string" || !pointer.publicationId) {
    throw new Error("The current CMS publication pointer is invalid.");
  }
  const publication = await db
    .collection("cmsPublications")
    .findOne({ _id: pointer.publicationId }, options);
  if (!publication || !isPlainObject(publication.snapshot)) {
    throw new Error("The current CMS publication could not be loaded.");
  }
  assertSupportedPublicationSnapshot(publication.snapshot);
  if (
    !Number.isInteger(publication.revision) ||
    publication.revision < 1 ||
    pointer.revision !== publication.revision ||
    publication.snapshot.revision !== publication.revision
  ) {
    throw new Error("The current CMS publication revisions are inconsistent.");
  }
  return { pointer, publication };
}

function hasLegacyFields(value) {
  return Boolean(
    value &&
      (Object.hasOwn(value, "pages") || Object.hasOwn(value, "gallery")),
  );
}

export function recordsContainTargets(records, desiredVouchers) {
  if (
    !Array.isArray(records) ||
    records.length !== desiredVouchers.length ||
    records.length !== 2
  ) {
    return false;
  }
  return desiredVouchers.every((desired, index) =>
    voucherRecordMatches(records[index], desired),
  );
}

async function inspectMongoState(db, preparedVouchers) {
  const content = await db
    .collection("cmsContent")
    .findOne({ _id: "siriranee-content" });
  assertContentDocument(content);
  const plans = resolveVoucherPlans(content.vouchers ?? [], preparedVouchers);
  const publicationState = await readCurrentPublication(db);
  return { content, plans, ...publicationState };
}

async function assertTransactionSupport(client) {
  const hello = await client.db("admin").command({ hello: 1 });
  const supported = hello.msg === "isdbgrid" || typeof hello.setName === "string";
  if (!supported || !Number.isFinite(hello.logicalSessionTimeoutMinutes)) {
    throw new Error(
      "MongoDB transactions require a replica set or sharded cluster with sessions.",
    );
  }
}

function auditExpiry(timestamp) {
  return new Date(
    new Date(timestamp).getTime() +
      AUDIT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
  );
}

function auditIdForRevision(migrationFingerprint, revision) {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("Cannot create an audit ID for an invalid CMS revision.");
  }
  return `voucher-migration-${migrationFingerprint.slice(0, 32)}-r${revision}`;
}

function verificationAuditId(migrationFingerprint) {
  return `voucher-migration-${migrationFingerprint.slice(0, 32)}`;
}

export function auditRecordIsValid(record, migrationFingerprint) {
  const createdAt = new Date(record?.createdAt);
  const expiresAt = record?.expiresAtDate;
  const baseId = verificationAuditId(migrationFingerprint);
  const revisionPrefix = `${baseId}-r`;
  const revisionText = String(record?._id ?? "").slice(revisionPrefix.length);
  const revision = Number(revisionText);
  const validId =
    record?._id === baseId ||
    (String(record?._id ?? "").startsWith(revisionPrefix) &&
      /^\d+$/.test(revisionText) &&
      Number.isInteger(revision) &&
      revision >= 1);
  return Boolean(
    record &&
      validId &&
      record.requestId === record._id &&
      record.action === "voucher.migrated" &&
      record.entityType === "voucher-migration" &&
      record.entityId === migrationFingerprint &&
      Number.isFinite(createdAt.getTime()) &&
      expiresAt instanceof Date &&
      Number.isFinite(expiresAt.getTime()) &&
      expiresAt.getTime() > Date.now() &&
      expiresAt.getTime() - createdAt.getTime() ===
        AUDIT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
  );
}

async function commitMongoMigration({
  client,
  db,
  preparedVouchers,
  uploadedAssets,
  migrationFingerprint,
  submissionId,
}) {
  const session = client.startSession();

  try {
    return await session.withTransaction(
      async () => {
        const contentCollection = db.collection("cmsContent");
        const publications = db.collection("cmsPublications");
        const metadata = db.collection("cmsMeta");
        const mediaAssets = db.collection("cmsMediaAssets");
        const audit = db.collection("cmsAuditEvents");
        const current = await contentCollection.findOne(
          { _id: "siriranee-content" },
          { session },
        );
        assertContentDocument(current);

        const plans = resolveVoucherPlans(
          current.vouchers ?? [],
          preparedVouchers,
        );
        const expectedIds = preparedVouchers.map((plan) => plan.voucherId);
        if (
          plans.some(
            (plan, index) => plan.voucherId !== expectedIds[index],
          )
        ) {
          throw new Error(
            "Voucher records changed after preflight. No database changes were made.",
          );
        }

        const publicationState = await readCurrentPublication(db, session);
        const timestamp = new Date().toISOString();
        const desiredVouchers = buildVoucherRecords(
          current.vouchers ?? [],
          plans,
          uploadedAssets,
          timestamp,
        );
        const replacementVouchers = replaceVoucherRecords(desiredVouchers);

        const mediaEntries = [];
        let mediaNeedsUpdate = false;
        for (const asset of uploadedAssets) {
          const existingById = await mediaAssets.findOne(
            { _id: asset.publicId },
            { session },
          );
          const existingByProviderAssetId = await mediaAssets.findOne(
            { providerAssetId: asset.providerAssetId },
            { session },
          );
          if (
            existingById &&
            existingByProviderAssetId &&
            existingById._id !== existingByProviderAssetId._id
          ) {
            throw new Error(
              `CMS media identity conflicts for “${asset.publicId}”.`,
            );
          }
          const existing = existingById ?? existingByProviderAssetId;
          if (existing && !mediaRecordMatches(existing, asset)) {
            throw new Error(
              `The registered CMS media asset conflicts with “${asset.publicId}”.`,
            );
          }
          const record = existing ?? createMediaRecord(asset, submissionId, timestamp);
          if (!existing) mediaNeedsUpdate = true;
          mediaEntries.push({ record, needsInsert: !existing });
        }
        const mediaRecords = mediaEntries.map((entry) => entry.record);

        const sameVouchers = isDeepStrictEqual(
          current.vouchers ?? [],
          replacementVouchers,
        );
        const currentSchemaVersion = Number(current.schemaVersion);
        const contentNeedsUpdate =
          !sameVouchers ||
          !hasExactTopLevelFields(current, STORED_CONTENT_FIELDS) ||
          hasLegacyFields(current) ||
          currentSchemaVersion < MINIMUM_CONTENT_SCHEMA_VERSION;

        const publicationNeedsUpdate =
          publicationState.publication.snapshot.schemaVersion !==
            MINIMUM_CONTENT_SCHEMA_VERSION ||
          !hasExactTopLevelFields(
            publicationState.publication.snapshot,
            PUBLICATION_SNAPSHOT_FIELDS,
          ) ||
          publicationState.pointer.revision !== current.revision ||
          publicationState.publication.revision !== current.revision ||
          publicationState.publication.snapshot.revision !== current.revision ||
          publicationState.publication.snapshot.updatedAt !== current.updatedAt ||
          publicationState.publication.snapshot.updatedBy !== current.updatedBy ||
          hasLegacyFields(publicationState.publication.snapshot) ||
          !recordsContainTargets(
            publicationState.publication.snapshot.vouchers,
            desiredVouchers,
          );

        const existingAudit = await audit.findOne(
          {
            action: "voucher.migrated",
            entityType: "voucher-migration",
            entityId: migrationFingerprint,
          },
          { session, sort: { createdAt: -1, _id: -1 } },
        );
        if (
          existingAudit &&
          !auditRecordIsValid(existingAudit, migrationFingerprint)
        ) {
          throw new Error("The existing voucher migration audit entry is invalid.");
        }
        const operationalChange =
          contentNeedsUpdate || publicationNeedsUpdate || mediaNeedsUpdate;
        if (!operationalChange && existingAudit) {
          return {
            changed: false,
            revision: current.revision,
            publicationId: publicationState.publication._id,
            vouchers: desiredVouchers,
            mediaRecords,
            auditId: existingAudit._id,
          };
        }

        if (!operationalChange) {
          const createdAt = timestamp;
          const auditId = verificationAuditId(migrationFingerprint);
          await audit.insertOne(
            {
              _id: auditId,
              actorId: MIGRATION_ACTOR_ID,
              actorName: MIGRATION_ACTOR_NAME,
              action: "voucher.migrated",
              entityType: "voucher-migration",
              entityId: migrationFingerprint,
              summary: "Verified two published voucher images and their CMS media registrations.",
              requestId: auditId,
              createdAt,
              expiresAtDate: auditExpiry(createdAt),
            },
            { session },
          );
          return {
            changed: true,
            revision: current.revision,
            publicationId: publicationState.publication._id,
            vouchers: desiredVouchers,
            mediaRecords,
            auditId,
          };
        }

        const nextRevision = current.revision + 1;
        const auditId = auditIdForRevision(
          migrationFingerprint,
          nextRevision,
        );
        const conflictingTargetAudit = await audit.findOne(
          { _id: auditId },
          { session },
        );
        if (conflictingTargetAudit) {
          throw new Error(
            "The target voucher migration audit entry already exists while data still requires changes.",
          );
        }
        const nextContent = createContentDocument(
          current,
          replacementVouchers,
          nextRevision,
          timestamp,
        );
        const publicationSnapshot = createPublicationSnapshot(
          publicationState.publication,
          nextContent,
          desiredVouchers,
        );
        const snapshotFingerprint = sha256(JSON.stringify(publicationSnapshot));
        const publicationId = `voucher-migration-${migrationFingerprint.slice(0, 16)}-r${nextRevision}-${snapshotFingerprint.slice(0, 10)}`;
        const publication = {
          _id: publicationId,
          revision: nextRevision,
          publishedAt: timestamp,
          publishedBy: MIGRATION_ACTOR_ID,
          snapshot: publicationSnapshot,
        };

        for (const [index, asset] of uploadedAssets.entries()) {
          const entry = mediaEntries[index];
          if (!entry?.record?._id) {
            throw new Error(`CMS media record is unavailable for “${asset.publicId}”.`);
          }
          if (entry.needsInsert) {
            await mediaAssets.insertOne(entry.record, { session });
          }
        }

        const replaced = await contentCollection.replaceOne(
          { _id: "siriranee-content", revision: current.revision },
          nextContent,
          { session },
        );
        if (replaced.matchedCount !== 1) {
          throw new Error("The CMS content revision changed during migration.");
        }

        const existingPublication = await publications.findOne(
          { _id: publicationId },
          { session },
        );
        if (existingPublication) {
          if (!isDeepStrictEqual(existingPublication, publication)) {
            throw new Error("The deterministic publication ID is already in use.");
          }
        } else {
          await publications.insertOne(publication, { session });
        }
        await metadata.updateOne(
          { _id: "current-publication" },
          {
            $set: {
              publicationId,
              revision: nextRevision,
              updatedAt: timestamp,
            },
          },
          { upsert: true, session },
        );
        await audit.insertOne(
          {
            _id: auditId,
            actorId: MIGRATION_ACTOR_ID,
            actorName: MIGRATION_ACTOR_NAME,
            action: "voucher.migrated",
            entityType: "voucher-migration",
            entityId: migrationFingerprint,
            summary: "Migrated and published two voucher images with committed CMS media registrations.",
            requestId: auditId,
            createdAt: timestamp,
            expiresAtDate: auditExpiry(timestamp),
          },
          { session },
        );

        return {
          changed: true,
          revision: nextRevision,
          publicationId,
          vouchers: desiredVouchers,
          mediaRecords,
          auditId,
        };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
        maxCommitTimeMS: 30_000,
      },
    );
  } finally {
    await session.endSession();
  }
}

async function verifyCommittedMongoMigration({
  db,
  plans,
  uploadedAssets,
  migrationFingerprint,
}) {
  const content = await db
    .collection("cmsContent")
    .findOne({ _id: "siriranee-content" });
  assertContentDocument(content);
  if (content.schemaVersion !== MINIMUM_CONTENT_SCHEMA_VERSION) {
    throw new Error("CMS content verification requires schema version 7.");
  }
  if (!hasExactTopLevelFields(content, STORED_CONTENT_FIELDS)) {
    throw new Error("Verification found unsupported fields in CMS content.");
  }

  const expectedVouchers = plans.map((plan) => {
    const asset = uploadedAssets.find(
      (candidate) => candidate.publicId === plan.publicId,
    );
    if (!asset) {
      throw new Error(`Verification is missing the asset for “${plan.title}”.`);
    }
    return {
      id: plan.voucherId,
      title: plan.title,
      imageUrl: asset.secureUrl,
      imageAlt: plan.altText,
      status: "published",
      sortOrder: plan.index,
    };
  });
  for (const expected of expectedVouchers) {
    const stored = (content.vouchers ?? []).find(
      (voucher) => voucher?.id === expected.id,
    );
    if (!voucherRecordMatches(stored, expected)) {
      throw new Error(`CMS content verification failed for “${expected.title}”.`);
    }
  }
  if (!recordsContainTargets(content.vouchers, expectedVouchers)) {
    throw new Error(
      "CMS content must contain exactly the two ordered migrated vouchers.",
    );
  }

  const { pointer, publication } = await readCurrentPublication(db);
  if (
    pointer.revision !== content.revision ||
    publication.revision !== content.revision ||
    publication.snapshot.revision !== content.revision ||
    publication.snapshot.schemaVersion !== MINIMUM_CONTENT_SCHEMA_VERSION ||
    !hasExactTopLevelFields(
      publication.snapshot,
      PUBLICATION_SNAPSHOT_FIELDS,
    ) ||
    hasLegacyFields(publication.snapshot) ||
    publication.snapshot.updatedAt !== content.updatedAt ||
    publication.snapshot.updatedBy !== content.updatedBy ||
    !isDeepStrictEqual(publication.snapshot.vouchers, content.vouchers) ||
    !recordsContainTargets(publication.snapshot.vouchers, expectedVouchers)
  ) {
    throw new Error("The immediate publication did not verify against CMS content.");
  }

  for (const asset of uploadedAssets) {
    const record = await db
      .collection("cmsMediaAssets")
      .findOne({ _id: asset.publicId });
    if (!mediaRecordMatches(record, asset)) {
      throw new Error(`CMS media registration failed for “${asset.publicId}”.`);
    }
  }

  const audit = await db.collection("cmsAuditEvents").findOne(
    {
      action: "voucher.migrated",
      entityType: "voucher-migration",
      entityId: migrationFingerprint,
    },
    { sort: { createdAt: -1, _id: -1 } },
  );
  if (!auditRecordIsValid(audit, migrationFingerprint)) {
    throw new Error("The expiry-aware voucher migration audit entry did not verify.");
  }

  return {
    revision: content.revision,
    publicationId: publication._id,
    voucherCount: expectedVouchers.length,
    mediaAssetCount: uploadedAssets.length,
  };
}

async function verifyCloudinaryAssets({
  plans,
  uploadedAssets,
  configuration,
}) {
  for (const asset of uploadedAssets) {
    const reconciliation = await reconcileCloudinaryResource(asset.publicId);
    const verifiedProviderAsset = validateCloudinaryResource(
      reconciliation.resource,
      plans.find((plan) => plan.publicId === asset.publicId),
      configuration,
    );
    if (!isDeepStrictEqual(verifiedProviderAsset, asset)) {
      throw new Error(`Cloudinary verification changed for “${asset.publicId}”.`);
    }
  }
}

async function verifyCommittedMigration(input) {
  const verified = await verifyCommittedMongoMigration(input);
  await verifyCloudinaryAssets(input);
  return verified;
}

export function hasMongoErrorLabel(error, label) {
  const visited = new Set();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if (
      (typeof current.hasErrorLabel === "function" &&
        current.hasErrorLabel(label)) ||
      (Array.isArray(current.errorLabels) && current.errorLabels.includes(label))
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

async function reconcileMongoCommit(input, retryUnknownResult) {
  const delays = retryUnknownResult
    ? MONGO_COMMIT_RECONCILIATION_DELAYS_MS
    : [0];
  let lastError = null;
  for (const waitMilliseconds of delays) {
    if (waitMilliseconds) await delay(waitMilliseconds);
    try {
      const verified = await verifyCommittedMongoMigration(input);
      return { committed: true, verified, lastError: null };
    } catch (error) {
      lastError = error;
    }
  }
  return { committed: false, verified: null, lastError };
}

async function databaseReferencesAsset(db, asset) {
  const media = await db.collection("cmsMediaAssets").findOne({
    $or: [
      { _id: asset.publicId, status: "committed" },
      { providerAssetId: asset.providerAssetId, status: "committed" },
    ],
  });
  if (media) return true;
  if (asset.secureUrl) {
    const content = await db.collection("cmsContent").findOne({
      _id: "siriranee-content",
      "vouchers.imageUrl": asset.secureUrl,
    });
    if (content) return true;
    const publication = await db.collection("cmsPublications").findOne({
      "snapshot.vouchers.imageUrl": asset.secureUrl,
    });
    if (publication) return true;
  }
  return false;
}

async function removeNewlyUploadedAsset(db, item, runId) {
  const resource = await findCloudinaryResourceByAssetId(
    item.asset.providerAssetId,
  );
  if (!resource) {
    return { publicId: item.asset.publicId, outcome: "already-removed" };
  }
  const ownership = proveCloudinaryRunOwnership(
    resource,
    item.plan,
    runId,
  );
  if (
    !ownership ||
    ownership.providerAssetId !== item.asset.providerAssetId
  ) {
    throw new Error(
      `Refused to delete Cloudinary asset with changed ownership: ${item.asset.publicId}`,
    );
  }
  if (await databaseReferencesAsset(db, ownership)) {
    return { publicId: item.asset.publicId, outcome: "protected" };
  }

  await cloudinary.api.delete_resources_by_asset_ids(
    [ownership.providerAssetId],
    {
    invalidate: true,
    },
  );
  if (await findCloudinaryResourceByAssetId(ownership.providerAssetId)) {
    throw new Error(
      `Cloudinary asset still exists after deletion: ${ownership.providerAssetId}`,
    );
  }
  const resourceAtOriginalPublicId = await findCloudinaryResource(
    item.asset.publicId,
  );
  if (
    resourceAtOriginalPublicId &&
    resourceAtOriginalPublicId.asset_id === ownership.providerAssetId
  ) {
    throw new Error(
      `Cloudinary public ID still resolves to the deleted asset: ${item.asset.publicId}`,
    );
  }
  return {
    publicId: item.asset.publicId,
    outcome: "removed",
  };
}

async function rollbackNewUploads(db, newlyUploaded, runId) {
  const results = [];
  for (const item of [...newlyUploaded].reverse()) {
    try {
      results.push(
        await removeNewlyUploadedAsset(db, item, runId),
      );
    } catch {
      results.push({ publicId: item.asset.publicId, outcome: "failed" });
    }
  }
  return results;
}

function redactMessage(error, configuration) {
  let message = error instanceof Error ? error.message : "Unknown migration error.";
  const sensitiveValues = [
    configuration?.mongoUri,
    configuration?.apiKey,
    configuration?.apiSecret,
    process.env.CMS_MEDIA_TOKEN_SECRET,
    process.env.CMS_PII_ENCRYPTION_KEY,
  ]
    .map((value) => String(value ?? ""))
    .filter((value) => value.length >= 4)
    .sort((first, second) => second.length - first.length);
  for (const value of sensitiveValues) {
    message = message.split(value).join("[redacted]");
  }
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted MongoDB URI]")
    .replace(/api_secret=[^&\s]+/gi, "api_secret=[redacted]");
}

function migrationFingerprint(plans) {
  return sha256(
    JSON.stringify(
      plans.map((plan) => ({
        title: plan.title,
        altText: plan.altText,
        publicId: plan.publicId,
        sourceSha256: plan.sourceSha256,
      })),
    ),
  );
}

async function main() {
  let configuration;
  let client;
  try {
    const argumentsResult = parseArguments(process.argv.slice(2));
    if (argumentsResult.help) {
      console.log(usage());
      return;
    }

    configuration = readConfiguration();
    const prepared = await prepareVoucherInputs(
      argumentsResult.vouchers,
      configuration.folder,
    );
    cloudinary.config({
      cloud_name: configuration.cloudName,
      api_key: configuration.apiKey,
      api_secret: configuration.apiSecret,
      secure: true,
      signature_algorithm: "sha256",
      signature_version: 2,
    });

    client = new MongoClient(configuration.mongoUri, {
      appName: "siriranee-voucher-migration",
      maxPoolSize: 2,
      retryReads: true,
      retryWrites: true,
    });
    await client.connect();
    await assertTransactionSupport(client);
    const db = client.db(configuration.databaseName);
    await db.command({ ping: 1 });
    const inspected = await inspectMongoState(db, prepared);
    const plans = inspected.plans;
    const fingerprint = migrationFingerprint(plans);
    const submissionId = `voucher-migration-${fingerprint.slice(0, 24)}`;

    console.log(
      `Validated 2 voucher files for database ${configuration.databaseName}.`,
    );
    for (const plan of plans) {
      const existing = await findCloudinaryResource(plan.publicId);
      if (existing) {
        const asset = validateCloudinaryResource(existing, plan, configuration);
        await assertExistingAssetIsCommitted(db, asset, plan);
      }
      console.log(
        `- ${plan.title}: ${plan.fileName} -> ${plan.publicId} (${existing ? "reuse" : "upload"})`,
      );
    }

    if (!argumentsResult.apply) {
      console.log("Read-only preflight passed. Re-run with --apply to migrate.");
      return;
    }

    const runId = randomUUID();
    const acquiredAssets = [];
    const newlyUploaded = [];
    try {
      for (const plan of plans) {
        try {
          const acquired = await acquireCloudinaryAsset(
            plan,
            configuration,
            runId,
            db,
          );
          acquiredAssets.push(acquired.asset);
          if (acquired.newlyUploaded) {
            newlyUploaded.push({ plan, asset: acquired.asset });
          }
        } catch (error) {
          if (error?.recoveredAsset) {
            newlyUploaded.push({ plan, asset: error.recoveredAsset });
          }
          throw error;
        }
      }
    } catch (error) {
      const rollback = await rollbackNewUploads(
        db,
        newlyUploaded,
        runId,
      );
      const incomplete = rollback.filter(
        (item) => !["removed", "already-removed"].includes(item.outcome),
      );
      if (incomplete.length) {
        throw new Error(
          `${redactMessage(error, configuration)} Cleanup was incomplete for: ${incomplete.map((item) => item.publicId).join(", ")}.`,
        );
      }
      throw error;
    }

    let transactionResult;
    try {
      transactionResult = await commitMongoMigration({
        client,
        db,
        preparedVouchers: plans,
        uploadedAssets: acquiredAssets,
        migrationFingerprint: fingerprint,
        submissionId,
      });
    } catch (error) {
      const commitWasIndeterminate = hasMongoErrorLabel(
        error,
        "UnknownTransactionCommitResult",
      );
      const reconciled = await reconcileMongoCommit(
        {
          db,
          plans,
          uploadedAssets: acquiredAssets,
          migrationFingerprint: fingerprint,
        },
        commitWasIndeterminate,
      );
      if (!reconciled.committed && commitWasIndeterminate) {
        const indeterminateError = new Error(
          "MongoDB commit outcome remained indeterminate after synchronous verification. Newly uploaded Cloudinary assets were retained to avoid deleting media that may be committed.",
        );
        indeterminateError.cause = error;
        throw indeterminateError;
      }
      if (!reconciled.committed) {
        const rollback = await rollbackNewUploads(
          db,
          newlyUploaded,
          runId,
        );
        const incomplete = rollback.filter(
          (item) => !["removed", "already-removed"].includes(item.outcome),
        );
        if (incomplete.length) {
          throw new Error(
            `${redactMessage(error, configuration)} Cleanup was incomplete for: ${incomplete.map((item) => item.publicId).join(", ")}.`,
          );
        }
        throw error;
      }
    }

    const verified = await verifyCommittedMigration({
      db,
      plans,
      uploadedAssets: acquiredAssets,
      migrationFingerprint: fingerprint,
      configuration,
    });
    console.log(
      `${transactionResult?.changed === false ? "Voucher migration was already complete" : "Voucher migration committed"}: revision ${verified.revision}, ${verified.voucherCount} vouchers, ${verified.mediaAssetCount} media assets.`,
    );
    console.log(`Current publication: ${verified.publicationId}`);
  } catch (error) {
    console.error(`Voucher migration failed: ${redactMessage(error, configuration)}`);
    process.exitCode = 1;
  } finally {
    await client?.close().catch(() => undefined);
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === entryPoint) {
  await main();
}
