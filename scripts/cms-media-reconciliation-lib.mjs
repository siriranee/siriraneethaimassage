import { createHash } from "node:crypto";

import { BSON } from "mongodb";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_DELETING_ROWS = 500;
const MAX_APPLY_CANDIDATES = 5;
const PROVIDER_LOOKUP_TIMEOUT_MS = 4_000;
const PLAN_VERSION = 1;

function canonical(value) {
  return BSON.EJSON.stringify(value, { relaxed: false });
}

function strictNotFound(error) {
  return Number(error?.http_code ?? error?.error?.http_code) === 404;
}

function isOwnedPublicId(publicId, folder) {
  return (
    typeof publicId === "string" &&
    publicId.startsWith(`${folder}/assets/`) &&
    /^[a-z0-9][a-z0-9_/-]{1,240}$/i.test(publicId) &&
    !publicId.includes("..") &&
    !publicId.includes("//")
  );
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validRegisteredUrl(row, cloudName) {
  if (row.secureUrl === "") return !row.providerAssetId;
  if (typeof row.secureUrl !== "string" || !row.providerAssetId ||
    !Number.isSafeInteger(row.cloudinaryVersion) || row.cloudinaryVersion < 1 ||
    !["avif", "jpg", "jpeg", "png", "webp"].includes(row.format)) {
    return false;
  }
  try {
    const url = new URL(row.secureUrl);
    return url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === `/${cloudName}/image/upload/v${row.cloudinaryVersion}/${row.publicId}.${row.format}`;
  } catch {
    return false;
  }
}

function assertValidSnapshot(snapshot) {
  const malformed = () => {
    throw new Error("A CMS content snapshot is malformed; no records were changed.");
  };
  const isRecord = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    malformed();
  }
  if (!Array.isArray(snapshot.services)) {
    malformed();
  }
  for (const field of ["team", "vouchers"]) {
    if (field in snapshot && !Array.isArray(snapshot[field])) {
      malformed();
    }
  }
  for (const service of snapshot.services) {
    if (!isRecord(service) ||
      ("imageUrl" in service && typeof service.imageUrl !== "string") ||
      ("hero" in service && !isRecord(service.hero)) ||
      ("galleryImages" in service && !Array.isArray(service.galleryImages))) {
      malformed();
    }
    if (service.hero && "imageUrl" in service.hero &&
      typeof service.hero.imageUrl !== "string") {
      malformed();
    }
    for (const image of service.galleryImages ?? []) {
      if (!isRecord(image) ||
        ("imageUrl" in image && typeof image.imageUrl !== "string")) {
        malformed();
      }
    }
  }
  for (const field of ["team", "vouchers"]) {
    for (const item of snapshot[field] ?? []) {
      if (!isRecord(item) ||
        ("imageUrl" in item && typeof item.imageUrl !== "string")) {
        malformed();
      }
    }
  }
}

function imageReferenceMatches(value, asset) {
  if (typeof value !== "string") return false;
  if (asset.secureUrl && value.includes(asset.secureUrl)) return true;
  if (value.includes(asset.publicId)) return true;
  if (!value.includes("res.cloudinary.com") || !value.includes("%")) return false;
  try {
    return decodeURIComponent(value).includes(asset.publicId);
  } catch {
    // An unparseable string is uncertain, not evidence that an image is unused.
    throw new Error("A CMS content snapshot contains an invalid URL; no records were changed.");
  }
}

function valueReferencesAsset(value, asset, depth = 0) {
  if (depth > 64) {
    throw new Error("A CMS content snapshot is too deeply nested; no records were changed.");
  }
  if (typeof value === "string") return imageReferenceMatches(value, asset);
  if (Array.isArray(value)) {
    return value.some((item) => valueReferencesAsset(item, asset, depth + 1));
  }
  if (!value || typeof value !== "object" || value instanceof Date) return false;
  return Object.values(value).some((item) => valueReferencesAsset(item, asset, depth + 1));
}

function isReferenced(state, asset) {
  if (valueReferencesAsset(state.content, asset)) return true;
  return state.publications.some((publication) =>
    valueReferencesAsset(publication.snapshot, asset),
  );
}

async function boundedLookup(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Provider lookup timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function getResourceState(provider, asset, timeoutMs) {
  try {
    const resource = await boundedLookup(
      () => provider.getByPublicId(asset.publicId),
      timeoutMs,
    );
    if (resource) return "present";
    return "unknown";
  } catch (error) {
    if (!strictNotFound(error)) return "unknown";
  }

  if (asset.providerAssetId) {
    try {
      const resource = await boundedLookup(
        () => provider.getByAssetId(asset.providerAssetId),
        timeoutMs,
      );
      if (resource) return "present";
      return "unknown";
    } catch (error) {
      if (!strictNotFound(error)) return "unknown";
    }
  }
  return "absent";
}

async function readState(database, session) {
  const options = session ? { session } : {};
  // MongoDB forbids concurrent operations on a transaction session.
  const media = database.collection("cmsMediaAssets");
  const rows = await media.find({ status: "deleting" }, options).toArray();
  if (rows.length > MAX_DELETING_ROWS) {
    throw new Error("Too many deleting media records; review a bounded batch before applying.");
  }
  const allMediaRows = await media.find({}, {
    ...options,
    projection: { _id: 1, publicId: 1, secureUrl: 1, status: 1 },
  }).toArray();
  const content = await database.collection("cmsContent")
    .findOne({ _id: "siriranee-content" }, options);
  const publications = await database.collection("cmsPublications")
    .find({}, options).toArray();
  assertValidSnapshot(content);
  for (const publication of publications) {
    assertValidSnapshot(publication?.snapshot);
  }
  return {
    rows: rows.sort((a, b) => canonical(a._id).localeCompare(canonical(b._id))),
    allMediaRows: allMediaRows.sort((a, b) =>
      canonical(a._id).localeCompare(canonical(b._id)),
    ),
    content,
    publications: publications.sort((a, b) =>
      canonical(a._id).localeCompare(canonical(b._id)),
    ),
  };
}

export async function createCmsMediaReconciliationPlan(
  state,
  provider,
  {
    databaseName,
    cloudName,
    folder,
    now = new Date(),
    providerLookupTimeoutMs = PROVIDER_LOOKUP_TIMEOUT_MS,
  },
) {
  if (!Number.isFinite(now.getTime())) throw new Error("The current time is invalid.");
  if (
    !Number.isInteger(providerLookupTimeoutMs) ||
    providerLookupTimeoutMs < 1 ||
    providerLookupTimeoutMs > PROVIDER_LOOKUP_TIMEOUT_MS
  ) {
    throw new Error("The provider timeout is invalid.");
  }
  assertValidSnapshot(state.content);
  for (const publication of state.publications) assertValidSnapshot(publication?.snapshot);

  const counts = {
    mediaRecordCount: 0,
    authorizedCount: 0,
    stagedCount: 0,
    committedCount: 0,
    deletingCount: state.rows.length,
    deletedCount: 0,
    otherStatusCount: 0,
    unreferencedCommittedCount: 0,
    tooRecentCount: 0,
    invalidCount: 0,
    referencedCount: 0,
    providerPresentCount: 0,
    providerUnknownCount: 0,
    candidateCount: 0,
  };
  const allMediaRows = [...(state.allMediaRows ?? state.rows)].sort((a, b) =>
    canonical(a._id).localeCompare(canonical(b._id)),
  );
  for (const record of allMediaRows) {
    counts.mediaRecordCount += 1;
    if (record.status === "authorized") counts.authorizedCount += 1;
    else if (record.status === "staged") counts.stagedCount += 1;
    else if (record.status === "committed") {
      counts.committedCount += 1;
      if (!isReferenced(state, record)) counts.unreferencedCommittedCount += 1;
    } else if (record.status === "deleted") counts.deletedCount += 1;
    else if (record.status !== "deleting") counts.otherStatusCount += 1;
  }
  const observations = [];
  const candidates = [];
  for (const row of state.rows) {
    let outcome = "invalid";
    const signatureExpiry = validDate(row.providerSignatureExpiresAt);
    if (
      row.status !== "deleting" ||
      !isOwnedPublicId(row.publicId, folder) ||
      row._id !== row.publicId ||
      !validRegisteredUrl(row, cloudName) ||
      !Number.isSafeInteger(row.version) ||
      row.version < 1 ||
      (row.providerAssetId !== undefined &&
        (typeof row.providerAssetId !== "string" || !/^[a-z0-9_-]{8,255}$/i.test(row.providerAssetId))) ||
      !signatureExpiry
    ) {
      counts.invalidCount += 1;
    } else if (now.getTime() <= signatureExpiry + DAY_MS) {
      outcome = "too-recent";
      counts.tooRecentCount += 1;
    } else if (isReferenced(state, row)) {
      outcome = "referenced";
      counts.referencedCount += 1;
    } else {
      outcome = await getResourceState(
        provider,
        row,
        providerLookupTimeoutMs,
      );
      if (outcome === "absent") {
        counts.candidateCount += 1;
        candidates.push(row);
      } else if (outcome === "present") {
        counts.providerPresentCount += 1;
      } else {
        counts.providerUnknownCount += 1;
      }
    }
    observations.push({ id: canonical(row._id), outcome });
  }

  const hash = createHash("sha256")
    .update(canonical({
      planVersion: PLAN_VERSION,
      databaseName,
      cloudName,
      folder,
      rows: state.rows,
      allMediaRows,
      content: state.content,
      publications: state.publications,
      observations,
    }))
    .digest("hex");
  return { hash, counts, candidates };
}

function report(mode, plan, updatedCount = 0) {
  return {
    mode,
    planHash: plan.hash,
    ...plan.counts,
    updatedCount,
  };
}

export async function runCmsMediaReconciliation(
  database,
  provider,
  {
    client,
    cloudName,
    folder,
    apply = false,
    expectedPlan = "",
    now = new Date(),
  } = {},
) {
  if (!/^[a-z0-9][a-z0-9_/-]{1,120}$/i.test(folder ?? "")) {
    throw new Error("The owned media folder is invalid; no records were changed.");
  }
  const context = { databaseName: database.databaseName, cloudName, folder, now };
  const first = await createCmsMediaReconciliationPlan(
    await readState(database),
    provider,
    context,
  );
  if (!apply) return report("dry-run", first);

  if (!/^[a-f0-9]{64}$/.test(expectedPlan) || first.hash !== expectedPlan) {
    throw new Error("The exact current dry-run plan hash is required; no records were changed.");
  }
  if (first.counts.invalidCount || first.counts.providerUnknownCount) {
    throw new Error("Some media records could not be verified; no records were changed.");
  }
  if (first.candidates.length > MAX_APPLY_CANDIDATES) {
    throw new Error("Too many eligible media records; review a bounded batch before applying.");
  }
  if (!client?.startSession) {
    throw new Error("Apply requires a MongoDB transaction; no records were changed.");
  }

  const session = client.startSession();
  let updatedCount = 0;
  try {
    await session.withTransaction(async () => {
      let attemptUpdatedCount = 0;
      // Recheck Cloudinary and all CMS references against the transaction's
      // database snapshot. Any changed plan aborts every metadata update.
      const current = await createCmsMediaReconciliationPlan(
        await readState(database, session),
        provider,
        { ...context, now: new Date() },
      );
      if (current.hash !== expectedPlan ||
        current.counts.invalidCount || current.counts.providerUnknownCount) {
        throw new Error("Media or provider state changed since dry-run; no records were changed.");
      }
      for (const row of current.candidates) {
        const updatedAt = new Date().toISOString();
        const result = await database.collection("cmsMediaAssets").updateOne(
          {
            _id: row._id,
            status: "deleting",
            version: row.version,
            publicId: row.publicId,
            providerSignatureExpiresAt: row.providerSignatureExpiresAt,
          },
          {
            $set: {
              status: "deleted",
              deletedAt: updatedAt,
              updatedAt,
              version: row.version + 1,
            },
          },
          { session },
        );
        if (result.matchedCount !== 1) {
          throw new Error("A media record changed during reconciliation; no records were changed.");
        }
        attemptUpdatedCount += 1;
      }
      updatedCount = attemptUpdatedCount;
    });
  } finally {
    await session.endSession();
  }
  return report("applied", first, updatedCount);
}
