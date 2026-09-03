import { createHash } from "node:crypto";

import type { CmsLoginAttempt } from "@/domain/cms/types";

export const CMS_LOGIN_WINDOW_MS = 15 * 60 * 1_000;
export const CMS_LOGIN_PAIR_LIMIT = 5;
export const CMS_LOGIN_ACCOUNT_ALERT_THRESHOLD = 5;
export const CMS_LOGIN_ADDRESS_LIMIT = 20;
export const CMS_REAUTH_WINDOW_MS = 15 * 60 * 1_000;
export const CMS_REAUTH_LIMIT = 5;

export type CmsLoginThrottle = {
  readonly scope: "pair" | "account" | "address";
  readonly behavior: "block" | "alert";
  readonly key: string;
  readonly limit: number;
};

function throttleKey(scope: CmsLoginThrottle["scope"], value: string, bucket: number) {
  return createHash("sha256")
    .update(`cms-login\0${scope}\0${bucket}\0${value}`)
    .digest("base64url");
}

export function createCmsLoginThrottlePlan(
  username: string,
  address: string,
  now = Date.now(),
) {
  const bucket = Math.floor(now / CMS_LOGIN_WINDOW_MS);
  const normalizedAddress = address.trim().slice(0, 200) || "unavailable";
  const expiresAt = new Date((bucket + 1) * CMS_LOGIN_WINDOW_MS).toISOString();

  return {
    expiresAt,
    throttles: [
      {
        scope: "pair",
        behavior: "block",
        key: throttleKey("pair", `${username}\0${normalizedAddress}`, bucket),
        limit: CMS_LOGIN_PAIR_LIMIT,
      },
      {
        scope: "account",
        behavior: "alert",
        key: throttleKey("account", username, bucket),
        limit: CMS_LOGIN_ACCOUNT_ALERT_THRESHOLD,
      },
      {
        scope: "address",
        behavior: "block",
        key: throttleKey("address", normalizedAddress, bucket),
        limit: CMS_LOGIN_ADDRESS_LIMIT,
      },
    ] satisfies readonly CmsLoginThrottle[],
  } as const;
}

export function isCmsLoginThrottleBlocked(
  attempt: CmsLoginAttempt | null,
  limit: number,
) {
  return Boolean(attempt && attempt.count >= limit);
}

export function createCmsReauthenticationThrottlePlan(
  actorId: string,
  address: string,
  now = Date.now(),
) {
  const bucket = Math.floor(now / CMS_REAUTH_WINDOW_MS);
  const normalizedAddress = address.trim().slice(0, 200) || "unavailable";
  const expiresAtTime = (bucket + 1) * CMS_REAUTH_WINDOW_MS;

  return {
    key: createHash("sha256")
      .update(
        ["cms-reauthentication", bucket, actorId, normalizedAddress].join(
          "\0",
        ),
      )
      .digest("base64url"),
    limit: CMS_REAUTH_LIMIT,
    expiresAt: new Date(expiresAtTime).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAtTime - now) / 1_000)),
  } as const;
}
