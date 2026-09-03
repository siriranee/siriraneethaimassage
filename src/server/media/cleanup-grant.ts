import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { getCloudinaryMediaConfig } from "@/server/media/config";
import { CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS } from "@/server/media/policy";
import {
  issueCmsMediaCleanupGrant,
  verifyCmsMediaCleanupGrant,
} from "@/server/media/tokens";

const localCookieName = "siriranee_media_cleanup";
const secureCookieName = "__Host-siriranee_media_cleanup";

function shouldUseSecureCookie() {
  const configured = process.env.CMS_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

function cookieName() {
  return shouldUseSecureCookie() ? secureCookieName : localCookieName;
}

export function setCmsMediaCleanupGrantCookie(
  response: NextResponse,
  userId: string,
) {
  const config = getCloudinaryMediaConfig();
  const grant = issueCmsMediaCleanupGrant(userId, config.tokenSecret);
  response.cookies.set(cookieName(), grant.token, {
    httpOnly: true,
    maxAge: CMS_MEDIA_STAGED_TOKEN_TTL_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
  });
}

export async function getCmsMediaCleanupGrantUserId() {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) return null;

  try {
    return verifyCmsMediaCleanupGrant(
      token,
      getCloudinaryMediaConfig().tokenSecret,
    ).userId;
  } catch {
    return null;
  }
}
