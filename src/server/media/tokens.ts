import { createHmac, timingSafeEqual } from "node:crypto";

import {
  CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS,
  CMS_MEDIA_UPLOAD_TOKEN_TTL_SECONDS,
  CmsMediaValidationError,
  type CmsMediaScope,
} from "@/server/media/policy";

type CmsMediaTokenBase = {
  readonly version: 1;
  readonly userId: string;
  readonly submissionId: string;
  readonly scope: CmsMediaScope;
  readonly publicId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
};

export type CmsMediaUploadTokenClaims = CmsMediaTokenBase & {
  readonly kind: "upload";
};

export type CmsMediaStagedTokenClaims = CmsMediaTokenBase & {
  readonly kind: "staged";
  readonly secureUrl: string;
  readonly providerAssetId: string;
  readonly assetVersion: number;
  readonly format: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
};

type CmsMediaTokenClaims =
  | CmsMediaUploadTokenClaims
  | CmsMediaStagedTokenClaims;

type CmsMediaCleanupGrantClaims = {
  readonly version: 1;
  readonly kind: "cleanup-grant";
  readonly userId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
};

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`siriranee-cms-media.v1.${encodedPayload}`)
    .digest("base64url");
}

function signCleanupGrant(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`siriranee-cms-media-cleanup.v1.${encodedPayload}`)
    .digest("base64url");
}

function createToken(claims: CmsMediaTokenClaims, secret: string) {
  const encodedPayload = encode(JSON.stringify(claims));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function createCleanupGrantToken(
  claims: CmsMediaCleanupGrantClaims,
  secret: string,
) {
  const encodedPayload = encode(JSON.stringify(claims));
  return `${encodedPayload}.${signCleanupGrant(encodedPayload, secret)}`;
}

function invalidToken(): never {
  throw new CmsMediaValidationError(
    "The staged image authorization is invalid or has expired. Upload the image again.",
  );
}

function parseToken(
  token: string,
  secret: string,
  nowSeconds: number,
): CmsMediaTokenClaims {
  if (
    token.length < 32 ||
    token.length > 8_192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    return invalidToken();
  }

  const [encodedPayload, suppliedSignature] = token.split(".");
  const expectedSignature = sign(encodedPayload, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return invalidToken();
  }

  let claims: unknown;
  try {
    claims = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return invalidToken();
  }

  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    return invalidToken();
  }

  const candidate = claims as Partial<CmsMediaTokenClaims>;
  if (
    candidate.version !== 1 ||
    (candidate.kind !== "upload" && candidate.kind !== "staged") ||
    typeof candidate.userId !== "string" ||
    typeof candidate.submissionId !== "string" ||
    typeof candidate.scope !== "string" ||
    typeof candidate.publicId !== "string" ||
    !Number.isSafeInteger(candidate.issuedAt) ||
    !Number.isSafeInteger(candidate.expiresAt) ||
    (candidate.issuedAt as number) > nowSeconds + 30 ||
    (candidate.expiresAt as number) <= nowSeconds
  ) {
    return invalidToken();
  }

  const maximumLifetime =
    candidate.kind === "upload"
      ? CMS_MEDIA_UPLOAD_TOKEN_TTL_SECONDS
      : CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS;
  if (
    (candidate.expiresAt as number) - (candidate.issuedAt as number) >
    maximumLifetime
  ) {
    return invalidToken();
  }

  if (candidate.kind === "staged") {
    if (
      typeof candidate.secureUrl !== "string" ||
      typeof candidate.providerAssetId !== "string" ||
      !Number.isSafeInteger(candidate.assetVersion) ||
      typeof candidate.format !== "string" ||
      !Number.isSafeInteger(candidate.bytes) ||
      !Number.isSafeInteger(candidate.width) ||
      !Number.isSafeInteger(candidate.height)
    ) {
      return invalidToken();
    }
  }

  return candidate as CmsMediaTokenClaims;
}

function parseCleanupGrantToken(
  token: string,
  secret: string,
  nowSeconds: number,
): CmsMediaCleanupGrantClaims {
  if (
    token.length < 32 ||
    token.length > 2_048 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    return invalidToken();
  }

  const [encodedPayload, suppliedSignature] = token.split(".");
  const expectedSignature = signCleanupGrant(encodedPayload, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return invalidToken();
  }

  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return invalidToken();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidToken();
  }
  const claims = value as Partial<CmsMediaCleanupGrantClaims>;
  if (
    claims.version !== 1 ||
    claims.kind !== "cleanup-grant" ||
    typeof claims.userId !== "string" ||
    claims.userId.length < 1 ||
    claims.userId.length > 200 ||
    !Number.isSafeInteger(claims.issuedAt) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    (claims.issuedAt as number) > nowSeconds + 30 ||
    (claims.expiresAt as number) <= nowSeconds ||
    (claims.expiresAt as number) - (claims.issuedAt as number) >
      CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS
  ) {
    return invalidToken();
  }

  return claims as CmsMediaCleanupGrantClaims;
}

export function issueCmsMediaUploadToken(
  input: {
    readonly userId: string;
    readonly submissionId: string;
    readonly scope: CmsMediaScope;
    readonly publicId: string;
  },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const claims: CmsMediaUploadTokenClaims = {
    version: 1,
    kind: "upload",
    ...input,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + CMS_MEDIA_UPLOAD_TOKEN_TTL_SECONDS,
  };

  return { token: createToken(claims, secret), claims } as const;
}

export function issueCmsMediaStagedToken(
  input: Omit<
    CmsMediaStagedTokenClaims,
    "version" | "kind" | "issuedAt" | "expiresAt"
  >,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const claims: CmsMediaStagedTokenClaims = {
    version: 1,
    kind: "staged",
    ...input,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS,
  };

  return { token: createToken(claims, secret), claims } as const;
}

export function issueCmsMediaCleanupGrant(
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (!userId || userId.length > 200) return invalidToken();
  const claims: CmsMediaCleanupGrantClaims = {
    version: 1,
    kind: "cleanup-grant",
    userId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS,
  };
  return { token: createCleanupGrantToken(claims, secret), claims } as const;
}

export function verifyCmsMediaCleanupGrant(
  token: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (typeof token !== "string") return invalidToken();
  return parseCleanupGrantToken(token, secret, nowSeconds);
}

export function verifyCmsMediaUploadToken(
  token: unknown,
  expected: {
    readonly userId: string;
    readonly submissionId: string;
    readonly scope: CmsMediaScope;
    readonly publicId: string;
  },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const claims = verifyCmsMediaUploadCleanupCapability(
    token,
    expected,
    secret,
    nowSeconds,
  );

  if (
    claims.userId !== expected.userId
  ) {
    return invalidToken();
  }

  return claims;
}

export function verifyCmsMediaStagedToken(
  token: unknown,
  expected: {
    readonly userId: string;
    readonly submissionId: string;
    readonly scope: CmsMediaScope;
    readonly publicId: string;
    readonly secureUrl: string;
  },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const claims = verifyCmsMediaStagedCleanupCapability(
    token,
    expected,
    secret,
    nowSeconds,
  );

  if (
    claims.userId !== expected.userId
  ) {
    return invalidToken();
  }

  return claims;
}

/**
 * Verifies the upload token as a narrowly scoped cleanup capability. The
 * caller may derive only the signed owner ID from the returned claims; every
 * mutable request field remains bound here before any provider deletion.
 */
export function verifyCmsMediaUploadCleanupCapability(
  token: unknown,
  expected: {
    readonly submissionId: string;
    readonly scope: CmsMediaScope;
    readonly publicId: string;
  },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (typeof token !== "string") return invalidToken();
  const claims = parseToken(token, secret, nowSeconds);

  if (
    claims.kind !== "upload" ||
    claims.submissionId !== expected.submissionId ||
    claims.scope !== expected.scope ||
    claims.publicId !== expected.publicId
  ) {
    return invalidToken();
  }

  return claims;
}

/**
 * Verifies the staged token as an exact cleanup capability. Immutable provider
 * details stay signed in the returned claims and are checked against MongoDB
 * before deletion.
 */
export function verifyCmsMediaStagedCleanupCapability(
  token: unknown,
  expected: {
    readonly submissionId: string;
    readonly scope: CmsMediaScope;
    readonly publicId: string;
    readonly secureUrl: string;
  },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (typeof token !== "string") return invalidToken();
  const claims = parseToken(token, secret, nowSeconds);

  if (
    claims.kind !== "staged" ||
    claims.submissionId !== expected.submissionId ||
    claims.scope !== expected.scope ||
    claims.publicId !== expected.publicId ||
    claims.secureUrl !== expected.secureUrl
  ) {
    return invalidToken();
  }

  return claims;
}
