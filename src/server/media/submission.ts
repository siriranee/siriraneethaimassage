import "server-only";

import type {
  CmsContentState,
  CmsMediaAsset,
  CmsMediaScope,
  CmsUser,
} from "@/domain/cms/types";
import { appendCmsAudit } from "@/server/cms/audit";
import type { CmsRepository } from "@/server/cms/repositories";
import {
  getCloudinaryMediaConfig,
  getCloudinaryMediaOwnershipConfig,
} from "@/server/media/config";
import {
  CmsMediaValidationError,
  parseCmsMediaScope,
  parseMediaSubmissionId,
} from "@/server/media/policy";
import {
  assertCmsContentImageReferencesApproved,
  collectNewCmsScopedMediaReferences,
  isCloudinaryImageUrl,
  isOwnedCloudinaryPublicId,
  parseCmsCloudinarySecureUrl,
} from "@/server/media/references";
import { verifyCmsMediaStagedToken } from "@/server/media/tokens";

export const CMS_MEDIA_SUBMISSION_FIELD = "mediaSubmission";
const maximumSubmissionAssets = 16;

export type CmsMediaSubmissionAsset = {
  readonly scope: CmsMediaScope;
  readonly publicId: string;
  readonly secureUrl: string;
  readonly stagedToken: string;
};

export type CmsMediaSubmission = {
  readonly submissionId: string;
  readonly assets: readonly CmsMediaSubmissionAsset[];
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSubmissionAsset(value: unknown): CmsMediaSubmissionAsset {
  const source = objectValue(value);
  if (!source) {
    throw new CmsMediaValidationError("The staged image details are invalid.");
  }

  const publicId = typeof source.publicId === "string" ? source.publicId.trim() : "";
  const secureUrl =
    typeof source.secureUrl === "string" ? source.secureUrl.trim() : "";
  const stagedToken =
    typeof source.stagedToken === "string" ? source.stagedToken.trim() : "";

  if (
    publicId.length < 3 ||
    publicId.length > 255 ||
    secureUrl.length < 12 ||
    secureUrl.length > 2_048 ||
    stagedToken.length < 32 ||
    stagedToken.length > 8_192
  ) {
    throw new CmsMediaValidationError("The staged image details are invalid.");
  }

  return {
    scope: parseCmsMediaScope(source.scope),
    publicId,
    secureUrl,
    stagedToken,
  };
}

export function parseCmsMediaSubmission(value: unknown): CmsMediaSubmission | null {
  if (value === undefined || value === null) return null;
  const source = objectValue(value);
  if (!source || !Array.isArray(source.assets)) {
    throw new CmsMediaValidationError("The image submission is invalid.");
  }
  if (source.assets.length > maximumSubmissionAssets) {
    throw new CmsMediaValidationError(
      `An update can include up to ${maximumSubmissionAssets} staged images.`,
    );
  }

  const assets = source.assets.map(parseSubmissionAsset);
  const publicIds = assets.map((asset) => asset.publicId);
  const secureUrls = assets.map((asset) => asset.secureUrl);
  if (
    new Set(publicIds).size !== publicIds.length ||
    new Set(secureUrls).size !== secureUrls.length
  ) {
    throw new CmsMediaValidationError("Each staged image can be submitted once.");
  }

  return {
    submissionId: parseMediaSubmissionId(source.submissionId),
    assets,
  };
}

export function removeCmsMediaSubmissionEnvelope(
  input: Record<string, unknown>,
) {
  const submission = parseCmsMediaSubmission(input[CMS_MEDIA_SUBMISSION_FIELD]);
  const body = { ...input };
  delete body[CMS_MEDIA_SUBMISSION_FIELD];
  return { body, submission } as const;
}

export function assertCmsContentMediaReferencesApproved(
  content: CmsContentState,
) {
  assertCmsContentImageReferencesApproved(
    content,
    getCloudinaryMediaOwnershipConfig(),
  );
}

function assertRecordMatchesSubmission(
  record: CmsMediaAsset,
  asset: CmsMediaSubmissionAsset,
  submissionId: string,
  actorId: string,
) {
  if (
    record.provider !== "cloudinary" ||
    record.status !== "staged" ||
    record.ownerUserId !== actorId ||
    record.submissionId !== submissionId ||
    record.scope !== asset.scope ||
    record.publicId !== asset.publicId ||
    record.secureUrl !== asset.secureUrl ||
    record.expiresAt <= new Date().toISOString()
  ) {
    throw new CmsMediaValidationError(
      "A staged image is unavailable or has expired. Upload it again.",
    );
  }
}

export async function commitCmsMediaForContentMutation(
  repository: CmsRepository,
  input: {
    readonly current: CmsContentState;
    readonly next: CmsContentState;
    readonly submission: CmsMediaSubmission | null | undefined;
    readonly actor: Pick<CmsUser, "id" | "displayName">;
    readonly requestId?: string;
  },
) {
  assertCmsContentMediaReferencesApproved(input.next);

  const newReferences = collectNewCmsScopedMediaReferences(
    input.current,
    input.next,
  ).filter((reference) => isCloudinaryImageUrl(reference.secureUrl));
  const uniqueNewUrls = new Set(newReferences.map((item) => item.secureUrl));
  const submission = input.submission ?? null;

  if (!uniqueNewUrls.size) {
    if (submission?.assets.length) {
      throw new CmsMediaValidationError(
        "Remove staged images that are not used in this update.",
      );
    }
    return [];
  }

  if (!submission) {
    throw new CmsMediaValidationError(
      "New Cloudinary images must include their staged upload authorization.",
    );
  }

  const config = getCloudinaryMediaConfig();
  const assetsByUrl = new Map(
    submission.assets.map((asset) => [asset.secureUrl, asset] as const),
  );

  if (
    assetsByUrl.size !== uniqueNewUrls.size ||
    submission.assets.some((asset) => !uniqueNewUrls.has(asset.secureUrl))
  ) {
    throw new CmsMediaValidationError(
      "Every staged image must be used exactly once in this update.",
    );
  }

  const committed: CmsMediaAsset[] = [];
  const now = new Date().toISOString();

  for (const secureUrl of uniqueNewUrls) {
    const references = newReferences.filter(
      (reference) => reference.secureUrl === secureUrl,
    );
    const scopes = new Set(references.map((reference) => reference.scope));
    const asset = assetsByUrl.get(secureUrl);
    if (!asset || scopes.size !== 1 || !scopes.has(asset.scope)) {
      throw new CmsMediaValidationError(
        "A staged image was used outside its approved destination.",
      );
    }
    if (!isOwnedCloudinaryPublicId(asset.publicId, config.folder)) {
      throw new CmsMediaValidationError("The staged image is not owned by this website.");
    }

    const record = await repository.getMediaAsset(asset.publicId);
    if (!record) {
      throw new CmsMediaValidationError(
        "A staged image is unavailable or has expired. Upload it again.",
      );
    }
    assertRecordMatchesSubmission(
      record,
      asset,
      submission.submissionId,
      input.actor.id,
    );

    const claims = verifyCmsMediaStagedToken(
      asset.stagedToken,
      {
        userId: input.actor.id,
        submissionId: submission.submissionId,
        scope: asset.scope,
        publicId: asset.publicId,
        secureUrl: asset.secureUrl,
      },
      config.tokenSecret,
    );
    parseCmsCloudinarySecureUrl(asset.secureUrl, {
      cloudName: config.cloudName,
      folder: config.folder,
      publicId: record.publicId,
      format: record.format,
      version: record.cloudinaryVersion,
    });
    if (
      claims.assetVersion !== record.cloudinaryVersion ||
      claims.providerAssetId !== record.providerAssetId ||
      claims.format !== record.format ||
      claims.bytes !== record.bytes ||
      claims.width !== record.width ||
      claims.height !== record.height
    ) {
      throw new CmsMediaValidationError("The staged image details do not match.");
    }

    const nextRecord: CmsMediaAsset = {
      ...record,
      status: "committed",
      committedAt: now,
      version: record.version + 1,
      updatedAt: now,
    };
    await repository.saveMediaAsset(nextRecord, record.version);
    committed.push(nextRecord);
  }

  await appendCmsAudit(repository, {
    actor: input.actor,
    action: "media.committed",
    entityType: "media-submission",
    entityId: submission.submissionId,
    summary: `Committed ${committed.length} CMS image${committed.length === 1 ? "" : "s"} with the content update.`,
    requestId: input.requestId,
  });

  return committed;
}
