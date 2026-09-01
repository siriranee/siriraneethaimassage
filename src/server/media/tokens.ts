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

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`siriranee-cms-media.v1.${encodedPayload}`)
    .digest("base64url");
}

function createToken(claims: CmsMediaTokenClaims, secret: string) {
  const encodedPayload = encode(JSON.stringify(claims));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
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
  if (typeof token !== "string") return invalidToken();
  const claims = parseToken(token, secret, nowSeconds);

  if (
    claims.kind !== "upload" ||
    claims.userId !== expected.userId ||
    claims.submissionId !== expected.submissionId ||
    claims.scope !== expected.scope ||
    claims.publicId !== expected.publicId
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
  if (typeof token !== "string") return invalidToken();
  const claims = parseToken(token, secret, nowSeconds);

  if (
    claims.kind !== "staged" ||
    claims.userId !== expected.userId ||
    claims.submissionId !== expected.submissionId ||
    claims.scope !== expected.scope ||
    claims.publicId !== expected.publicId ||
    claims.secureUrl !== expected.secureUrl
  ) {
    return invalidToken();
  }

  return claims;
}
