import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

import type { CmsMediaAsset, CmsUser } from "@/domain/cms/types";
import { appendCmsAudit } from "@/server/cms/audit";
import { getCmsRepository } from "@/server/cms/repositories";
import {
  getCloudinaryMediaConfig,
  type CloudinaryMediaConfig,
} from "@/server/media/config";
import {
  CMS_MEDIA_ALLOWED_FORMATS,
  CMS_MEDIA_MAX_BYTES,
  CMS_MEDIA_PROVIDER_SIGNATURE_RETENTION_SECONDS,
  CmsMediaValidationError,
  parseCmsMediaContentType,
  parseCmsMediaDeclaredBytes,
  parseCmsMediaFileName,
  parseCmsMediaFormat,
  parseCmsMediaScope,
  parseMediaSubmissionId,
  validateCmsMediaDimensions,
} from "@/server/media/policy";
import {
  isOwnedCloudinaryPublicId,
  parseCmsCloudinarySecureUrl,
} from "@/server/media/references";
import { verifyCloudinaryUploadResponseSignature } from "@/server/media/response-signature";
import {
  parseCmsMediaSubmission,
  type CmsMediaSubmission,
} from "@/server/media/submission";
import {
  issueCmsMediaStagedToken,
  issueCmsMediaUploadToken,
  verifyCmsMediaStagedCleanupCapability,
  verifyCmsMediaStagedToken,
  verifyCmsMediaUploadCleanupCapability,
  verifyCmsMediaUploadToken,
} from "@/server/media/tokens";

export class CmsMediaProviderError extends Error {
  constructor() {
    super("The image provider could not complete the request. Try again.");
    this.name = "CmsMediaProviderError";
  }
}

export class CmsMediaStateError extends Error {
  constructor(
    readonly code:
      | "not-authorized"
      | "already-processed"
      | "committed"
      | "referenced"
      | "state-changed"
      | "not-expired",
    message: string,
  ) {
    super(message);
    this.name = "CmsMediaStateError";
  }
}

export type CmsCloudinaryProvider = {
  readonly getResource: (
    publicId: string,
    config: CloudinaryMediaConfig,
  ) => Promise<unknown>;
  readonly destroy: (
    asset: CmsMediaAsset,
    config: CloudinaryMediaConfig,
  ) => Promise<unknown>;
};

function cloudinaryClient(config: CloudinaryMediaConfig) {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
    signature_algorithm: "sha256",
    signature_version: 2,
  });
  return cloudinary;
}

const defaultCloudinaryProvider: CmsCloudinaryProvider = {
  getResource(publicId, config) {
    return cloudinaryClient(config).api.resource(publicId, {
      resource_type: "image",
      type: "upload",
    });
  },
  destroy(asset, config) {
    if (asset.providerAssetId) {
      return cloudinaryClient(config).api.delete_resources_by_asset_ids(
        [asset.providerAssetId],
        { invalidate: true },
      );
    }
    return cloudinaryClient(config).uploader.destroy(asset.publicId, {
      resource_type: "image",
      type: "upload",
      invalidate: true,
    });
  },
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assertFileNameMatchesContentType(fileName: string, contentType: string) {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const acceptedExtensions: Record<string, readonly string[]> = {
    "image/avif": ["avif"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
  };

  if (!acceptedExtensions[contentType]?.includes(extension)) {
    throw new CmsMediaValidationError(
      "The image filename does not match its file type.",
    );
  }
}

function identifierFolderSegment(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function parseOwnedPublicId(value: unknown, folder: string) {
  const publicId = typeof value === "string" ? value.trim() : "";
  if (!isOwnedCloudinaryPublicId(publicId, folder)) {
    throw new CmsMediaValidationError("The staged image is not owned by this website.");
  }
  return publicId;
}

export async function createSignedCmsMediaUpload(
  value: unknown,
  actor: Pick<CmsUser, "id" | "displayName">,
  requestId?: string,
) {
  const source = objectValue(value);
  if (!source) throw new CmsMediaValidationError("The upload request is invalid.");

  const config = getCloudinaryMediaConfig();
  const submissionId = parseMediaSubmissionId(source.submissionId);
  const scope = parseCmsMediaScope(source.scope);
  const fileName = parseCmsMediaFileName(source.fileName);
  const contentType = parseCmsMediaContentType(source.contentType);
  const declaredBytes = parseCmsMediaDeclaredBytes(source.bytes);
  assertFileNameMatchesContentType(fileName, contentType);

  const timestamp = Math.floor(Date.now() / 1_000);
  const assetPath = `${config.folder}/assets/${identifierFolderSegment(actor.id)}/${identifierFolderSegment(submissionId)}`;
  const assetId = randomUUID();
  const publicId = `${assetPath}/${assetId}`;
  const parameters = {
    allowed_formats: CMS_MEDIA_ALLOWED_FORMATS.join(","),
    context: `siriranee_submission_id=${submissionId}|siriranee_scope=${scope}`,
    overwrite: false,
    public_id: publicId,
    tags: "siriranee-cms,siriranee-cms-staged",
    timestamp,
    transformation: "c_limit,w_4096,h_4096",
    unique_filename: false,
    upload_preset: config.uploadPreset,
    use_filename: false,
  } as const;
  const signature = cloudinaryClient(config).utils.api_sign_request(
    parameters,
    config.apiSecret,
  );
  const uploadAuthorization = issueCmsMediaUploadToken(
    { userId: actor.id, submissionId, scope, publicId },
    config.tokenSecret,
    timestamp,
  );
  const formatByContentType = {
    "image/avif": "avif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as const;
  const now = new Date(timestamp * 1_000).toISOString();
  const providerSignatureExpiresAt = new Date(
    (timestamp + CMS_MEDIA_PROVIDER_SIGNATURE_RETENTION_SECONDS) * 1_000,
  ).toISOString();
  const authorized: CmsMediaAsset = {
    id: publicId,
    provider: "cloudinary",
    publicId,
    secureUrl: "",
    cloudinaryVersion: 0,
    scope,
    submissionId,
    ownerUserId: actor.id,
    format: formatByContentType[contentType],
    bytes: declaredBytes,
    width: 0,
    height: 0,
    status: "authorized",
    providerSignatureExpiresAt,
    expiresAt: new Date(
      uploadAuthorization.claims.expiresAt * 1_000,
    ).toISOString(),
    committedAt: "",
    deletedAt: "",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await getCmsRepository().transaction(async (transaction) => {
    await transaction.saveMediaAsset(authorized);
    await appendCmsAudit(transaction, {
      actor,
      action: "media.authorized",
      entityType: "media-asset",
      entityId: publicId,
      summary: `Authorized a ${scope} image upload.`,
      requestId,
    });
  });

  return {
    endpoint: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    parameters,
    signature,
    uploadToken: uploadAuthorization.token,
    expiresAt: new Date(
      uploadAuthorization.claims.expiresAt * 1_000,
    ).toISOString(),
  } as const;
}

type CompletedUpload = {
  readonly publicId: string;
  readonly secureUrl: string;
  readonly signature: string;
  readonly version: number;
  readonly resourceType: "image";
  readonly format: CmsMediaAsset["format"];
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
};

function parseCompletedUpload(
  value: unknown,
  config: CloudinaryMediaConfig,
): CompletedUpload {
  const source = objectValue(value);
  if (!source || source.resourceType !== "image") {
    throw new CmsMediaValidationError("The upload response is invalid.");
  }

  const publicId = parseOwnedPublicId(source.publicId, config.folder);
  const format = parseCmsMediaFormat(source.format) as CmsMediaAsset["format"];
  const bytes = parseCmsMediaDeclaredBytes(source.bytes);
  const dimensions = validateCmsMediaDimensions(source.width, source.height);
  const version = typeof source.version === "number" ? source.version : Number(source.version);
  const signature = typeof source.signature === "string" ? source.signature.trim() : "";

  if (!Number.isSafeInteger(version) || version < 1 || !/^[a-f0-9]{40,64}$/i.test(signature)) {
    throw new CmsMediaValidationError("The upload response is invalid.");
  }

  const secureUrl = parseCmsCloudinarySecureUrl(source.secureUrl, {
    cloudName: config.cloudName,
    folder: config.folder,
    publicId,
    format,
    version,
  });
  if (
    !verifyCloudinaryUploadResponseSignature({
      apiSecret: config.apiSecret,
      publicId,
      version,
      signature,
    })
  ) {
    throw new CmsMediaValidationError("The upload response signature is invalid.");
  }

  return {
    publicId,
    secureUrl,
    signature,
    version,
    resourceType: "image",
    format,
    bytes,
    ...dimensions,
  };
}

async function verifyCompletedUploadAtProvider(
  completed: CompletedUpload,
  config: CloudinaryMediaConfig,
  provider: CmsCloudinaryProvider,
) {
  let resource: unknown;
  try {
    resource = await provider.getResource(completed.publicId, config);
  } catch {
    throw new CmsMediaProviderError();
  }

  const providerResponse = objectValue(resource);
  const providerAssetId =
    typeof providerResponse?.asset_id === "string"
      ? providerResponse.asset_id.trim()
      : "";
  if (
    !providerResponse ||
    !/^[a-z0-9_-]{8,255}$/i.test(providerAssetId) ||
    providerResponse.public_id !== completed.publicId ||
    providerResponse.resource_type !== "image" ||
    providerResponse.type !== "upload" ||
    Number(providerResponse.version) !== completed.version ||
    providerResponse.secure_url !== completed.secureUrl ||
    String(providerResponse.format).toLowerCase() !== completed.format ||
    Number(providerResponse.bytes) !== completed.bytes ||
    Number(providerResponse.width) !== completed.width ||
    Number(providerResponse.height) !== completed.height
  ) {
    throw new CmsMediaValidationError(
      "The uploaded image details could not be verified.",
    );
  }

  return providerAssetId;
}

export async function completeCmsMediaUpload(
  value: unknown,
  actor: Pick<CmsUser, "id" | "displayName">,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
) {
  const source = objectValue(value);
  if (!source) throw new CmsMediaValidationError("The upload response is invalid.");

  const config = getCloudinaryMediaConfig();
  const submissionId = parseMediaSubmissionId(source.submissionId);
  const scope = parseCmsMediaScope(source.scope);
  const completed = parseCompletedUpload(source.upload, config);
  verifyCmsMediaUploadToken(
    source.uploadToken,
    {
      userId: actor.id,
      submissionId,
      scope,
      publicId: completed.publicId,
    },
    config.tokenSecret,
  );
  const providerAssetId = await verifyCompletedUploadAtProvider(
    completed,
    config,
    provider,
  );

  const repository = getCmsRepository();
  const staged = await repository.transaction(async (transaction) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1_000).toISOString();
    const existing = await transaction.getMediaAsset(completed.publicId);
    let record: CmsMediaAsset;

    if (!existing) {
      throw new CmsMediaStateError(
        "not-authorized",
        "This image upload was not authorized.",
      );
    }

    if (existing.status === "staged") {
      if (
        existing.ownerUserId !== actor.id ||
        existing.submissionId !== submissionId ||
        existing.scope !== scope ||
        existing.secureUrl !== completed.secureUrl ||
        existing.providerAssetId !== providerAssetId ||
        existing.cloudinaryVersion !== completed.version ||
        existing.format !== completed.format ||
        existing.bytes !== completed.bytes ||
        existing.width !== completed.width ||
        existing.height !== completed.height
      ) {
        throw new CmsMediaStateError(
          "already-processed",
          "This image upload has already been processed.",
        );
      }

      record = {
        ...existing,
        expiresAt,
        version: existing.version + 1,
        updatedAt: now.toISOString(),
      };
      await transaction.saveMediaAsset(record, existing.version);
    } else {
      if (
        existing.status !== "authorized" ||
        existing.ownerUserId !== actor.id ||
        existing.submissionId !== submissionId ||
        existing.scope !== scope
      ) {
        throw new CmsMediaStateError(
          "already-processed",
          "This image upload has already been processed.",
        );
      }

      record = {
        ...existing,
        providerAssetId,
        secureUrl: completed.secureUrl,
        cloudinaryVersion: completed.version,
        format: completed.format,
        bytes: completed.bytes,
        width: completed.width,
        height: completed.height,
        status: "staged",
        expiresAt,
        version: existing.version + 1,
        updatedAt: now.toISOString(),
      };
      await transaction.saveMediaAsset(record, existing.version);
    }

    await appendCmsAudit(transaction, {
      actor,
      action: "media.staged",
      entityType: "media-asset",
      entityId: record.publicId,
      summary: `Verified a staged ${record.scope} image upload.`,
      requestId,
    });
    return record;
  });
  const authorization = issueCmsMediaStagedToken(
    {
      userId: actor.id,
      submissionId,
      scope,
      publicId: staged.publicId,
      secureUrl: staged.secureUrl,
      providerAssetId: staged.providerAssetId!,
      assetVersion: staged.cloudinaryVersion,
      format: staged.format,
      bytes: staged.bytes,
      width: staged.width,
      height: staged.height,
    },
    config.tokenSecret,
  );

  return {
    publicId: staged.publicId,
    secureUrl: staged.secureUrl,
    scope: staged.scope,
    format: staged.format,
    bytes: staged.bytes,
    width: staged.width,
    height: staged.height,
    stagedToken: authorization.token,
    expiresAt: staged.expiresAt,
  } as const;
}

function parseCleanupRequest(value: unknown) {
  const source = objectValue(value);
  if (!source) throw new CmsMediaValidationError("The cleanup request is invalid.");
  if (typeof source.stagedToken === "string") {
    const submission = parseCmsMediaSubmission({
      submissionId: source.submissionId,
      assets: [source],
    });
    if (!submission) {
      throw new CmsMediaValidationError("The cleanup request is invalid.");
    }
    return {
      kind: "staged" as const,
      submissionId: submission.submissionId,
      asset: submission.assets[0],
      token: submission.assets[0].stagedToken,
    };
  }

  const publicId = typeof source.publicId === "string" ? source.publicId.trim() : "";
  const uploadToken =
    typeof source.uploadToken === "string" ? source.uploadToken.trim() : "";
  if (!publicId || uploadToken.length < 32 || uploadToken.length > 8_192) {
    throw new CmsMediaValidationError("The cleanup request is invalid.");
  }
  return {
    kind: "upload" as const,
    submissionId: parseMediaSubmissionId(source.submissionId),
    asset: {
      scope: parseCmsMediaScope(source.scope),
      publicId,
      secureUrl: "",
      stagedToken: "",
    },
    token: uploadToken,
  };
}

async function deleteRegisteredCmsMediaAsset(
  publicId: string,
  actor: Pick<CmsUser, "id" | "displayName">,
  config: CloudinaryMediaConfig,
  requestId: string | undefined,
  assertRecord: (record: CmsMediaAsset) => void,
  provider: CmsCloudinaryProvider,
) {
  const repository = getCmsRepository();
  const prepared = await repository.transaction(async (transaction) => {
    const record = await transaction.getMediaAsset(publicId);
    if (!record || record.status === "deleted") return null;
    assertRecord(record);
    if (record.status === "committed") {
      throw new CmsMediaStateError(
        "committed",
        "Images used by CMS content cannot be deleted here.",
      );
    }
    if (await transaction.isMediaAssetReferenced(record.publicId, record.secureUrl)) {
      throw new CmsMediaStateError(
        "referenced",
        "Images referenced by CMS content cannot be deleted.",
      );
    }
    if (record.status === "deleting") return record;

    const deleting: CmsMediaAsset = {
      ...record,
      status: "deleting",
      version: record.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await transaction.saveMediaAsset(deleting, record.version);
    return deleting;
  });

  if (!prepared) return { removed: true, alreadyRemoved: true } as const;

  let destroyResult: unknown;
  try {
    destroyResult = await provider.destroy(prepared, config);
  } catch {
    throw new CmsMediaProviderError();
  }
  let providerResult =
    destroyResult && typeof destroyResult === "object" && "result" in destroyResult
      ? String(destroyResult.result)
      : "";
  if (
    !providerResult &&
    prepared.providerAssetId &&
    destroyResult &&
    typeof destroyResult === "object" &&
    "deleted" in destroyResult &&
    destroyResult.deleted &&
    typeof destroyResult.deleted === "object"
  ) {
    const deleted = destroyResult.deleted as Record<string, unknown>;
    providerResult = String(deleted[prepared.providerAssetId] ?? "");
  }
  if (
    providerResult !== "ok" &&
    providerResult !== "not found" &&
    providerResult !== "deleted" &&
    providerResult !== "not_found"
  ) {
    throw new CmsMediaProviderError();
  }

  let pendingFinalSweep = false;
  await repository.transaction(async (transaction) => {
    const current = await transaction.getMediaAsset(prepared.publicId);
    if (!current || current.status === "deleted") return;
    if (current.status !== "deleting") {
      throw new CmsMediaStateError(
        "state-changed",
        "The image cleanup state changed. Try again.",
      );
    }
    const now = new Date().toISOString();
    if (current.providerSignatureExpiresAt > now) {
      pendingFinalSweep = true;
      if (current.expiresAt !== current.providerSignatureExpiresAt) {
        await transaction.saveMediaAsset(
          {
            ...current,
            expiresAt: current.providerSignatureExpiresAt,
            version: current.version + 1,
            updatedAt: now,
          },
          current.version,
        );
      }
      return;
    }
    await transaction.saveMediaAsset(
      {
        ...current,
        status: "deleted",
        deletedAt: now,
        version: current.version + 1,
        updatedAt: now,
      },
      current.version,
    );
    await appendCmsAudit(transaction, {
      actor,
      action: "media.deleted",
      entityType: "media-asset",
      entityId: current.publicId,
      summary: "Deleted an unused CMS image upload.",
      requestId,
    });
  });

  return {
    removed: true,
    alreadyRemoved:
      providerResult === "not found" || providerResult === "not_found",
    pendingFinalSweep,
  } as const;
}

async function cleanupCmsMediaUploadInternal(
  value: unknown,
  authenticatedActor: Pick<CmsUser, "id" | "displayName"> | null,
  capabilityUserId: string | null,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
) {
  const config = getCloudinaryMediaConfig();
  const authorization = parseCleanupRequest(value);
  const { submissionId, asset } = authorization;
  if (!isOwnedCloudinaryPublicId(asset.publicId, config.folder)) {
    throw new CmsMediaValidationError("The staged image is not owned by this website.");
  }
  let stagedClaims: ReturnType<
    typeof verifyCmsMediaStagedCleanupCapability
  > | null = null;
  let signedUserId: string;
  if (authorization.kind === "staged") {
    const expected = {
      submissionId,
      scope: asset.scope,
      publicId: asset.publicId,
      secureUrl: asset.secureUrl,
    } as const;
    stagedClaims = authenticatedActor
      ? verifyCmsMediaStagedToken(
          authorization.token,
          { ...expected, userId: authenticatedActor.id },
          config.tokenSecret,
        )
      : verifyCmsMediaStagedCleanupCapability(
          authorization.token,
          expected,
          config.tokenSecret,
        );
    signedUserId = stagedClaims.userId;
  } else {
    const expected = {
      submissionId,
      scope: asset.scope,
      publicId: asset.publicId,
    } as const;
    const uploadClaims = authenticatedActor
      ? verifyCmsMediaUploadToken(
          authorization.token,
          { ...expected, userId: authenticatedActor.id },
          config.tokenSecret,
        )
      : verifyCmsMediaUploadCleanupCapability(
          authorization.token,
          expected,
          config.tokenSecret,
        );
    signedUserId = uploadClaims.userId;
  }
  if (
    !authenticatedActor &&
    (!capabilityUserId || capabilityUserId !== signedUserId)
  ) {
    throw new CmsMediaValidationError(
      "The staged image authorization is invalid or has expired. Upload the image again.",
    );
  }
  const actor = authenticatedActor ?? {
    id: signedUserId,
    displayName: "Signed CMS media cleanup",
  };

  return deleteRegisteredCmsMediaAsset(
    asset.publicId,
    actor,
    config,
    requestId,
    (record) => {
      if (
        record.ownerUserId !== actor.id ||
        record.submissionId !== submissionId ||
        record.scope !== asset.scope ||
        (authorization.kind === "staged" &&
          (!stagedClaims ||
            record.secureUrl !== asset.secureUrl ||
            record.providerAssetId !== stagedClaims.providerAssetId ||
            record.cloudinaryVersion !== stagedClaims.assetVersion ||
            record.format !== stagedClaims.format ||
            record.bytes !== stagedClaims.bytes ||
            record.width !== stagedClaims.width ||
            record.height !== stagedClaims.height))
      ) {
        throw new CmsMediaValidationError(
          "The staged image details do not match.",
        );
      }
    },
    provider,
  );
}

export async function cleanupCmsMediaUpload(
  value: unknown,
  actor: Pick<CmsUser, "id" | "displayName">,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
) {
  return cleanupCmsMediaUploadInternal(value, actor, null, requestId, provider);
}

export async function cleanupCmsMediaUploadWithCapability(
  value: unknown,
  capabilityUserId: string,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
) {
  return cleanupCmsMediaUploadInternal(
    value,
    null,
    capabilityUserId,
    requestId,
    provider,
  );
}

export type CmsMediaSubmissionRollbackItem = Readonly<{
  publicId: string;
  outcome: "removed" | "already-removed" | "protected" | "failed";
  pendingFinalSweep: boolean;
}>;

export type CmsMediaSubmissionRollbackResult = Readonly<{
  submissionId: string;
  complete: boolean;
  items: readonly CmsMediaSubmissionRollbackItem[];
}>;

async function rollbackCmsMediaSubmissionInternal(
  submission: CmsMediaSubmission,
  actor: Pick<CmsUser, "id" | "displayName"> | null,
  capabilityUserId: string | null,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
): Promise<CmsMediaSubmissionRollbackResult> {
  const uniqueAssets = submission.assets.filter(
    (asset, index) =>
      submission.assets.findIndex(
        (candidate) => candidate.publicId === asset.publicId,
      ) === index,
  );
  const items: CmsMediaSubmissionRollbackItem[] = [];

  for (const asset of uniqueAssets) {
    try {
      const cleanupRequest = {
        submissionId: submission.submissionId,
        scope: asset.scope,
        publicId: asset.publicId,
        secureUrl: asset.secureUrl,
        stagedToken: asset.stagedToken,
      };
      const result = actor
        ? await cleanupCmsMediaUpload(
            cleanupRequest,
            actor,
            requestId,
            provider,
          )
        : await cleanupCmsMediaUploadWithCapability(
            cleanupRequest,
            capabilityUserId ?? "",
            requestId,
            provider,
          );
      items.push({
        publicId: asset.publicId,
        outcome: result.alreadyRemoved ? "already-removed" : "removed",
        pendingFinalSweep:
          "pendingFinalSweep" in result
            ? Boolean(result.pendingFinalSweep)
            : false,
      });
    } catch (error) {
      const protectedAsset =
        error instanceof CmsMediaStateError &&
        (error.code === "committed" || error.code === "referenced");
      items.push({
        publicId: asset.publicId,
        outcome: protectedAsset ? "protected" : "failed",
        pendingFinalSweep: false,
      });
    }
  }

  return {
    submissionId: submission.submissionId,
    complete: items.every(
      (item) => item.outcome !== "failed" && !item.pendingFinalSweep,
    ),
    items,
  };
}

export async function rollbackCmsMediaSubmission(
  submission: CmsMediaSubmission,
  actor: Pick<CmsUser, "id" | "displayName">,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
) {
  return rollbackCmsMediaSubmissionInternal(
    submission,
    actor,
    null,
    requestId,
    provider,
  );
}

export async function rollbackCmsMediaSubmissionWithCapability(
  submission: CmsMediaSubmission,
  capabilityUserId: string,
  requestId?: string,
  provider: CmsCloudinaryProvider = defaultCloudinaryProvider,
) {
  return rollbackCmsMediaSubmissionInternal(
    submission,
    null,
    capabilityUserId,
    requestId,
    provider,
  );
}

export const CMS_MEDIA_UPLOAD_MAX_BYTES = CMS_MEDIA_MAX_BYTES;
