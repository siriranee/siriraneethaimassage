import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import type { CmsUser } from "@/domain/cms/types";
import { getCmsRepository } from "@/server/cms/repositories";

const sessionDurationMs = 8 * 60 * 60 * 1000;
const localCookieName = "siriranee_cms_session";
const secureCookieName = "__Host-siriranee_cms_session";

function shouldUseSecureCookie() {
  const configured = process.env.CMS_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

function getCookieName() {
  return shouldUseSecureCookie() ? secureCookieName : localCookieName;
}

export function hashCmsSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createCmsSession(user: CmsUser) {
  const repository = getCmsRepository();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDurationMs);

  await repository.saveSession({
    id: randomUUID(),
    tokenHash: hashCmsSessionToken(token),
    userId: user.id,
    authVersion: user.authVersion,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return token;
}

export async function getCurrentCmsUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCookieName())?.value;
  if (!token) return null;

  const repository = getCmsRepository();
  const session = await repository.findSessionByTokenHash(
    hashCmsSessionToken(token),
  );

  if (!session || session.expiresAt <= new Date().toISOString()) {
    return null;
  }

  const user = await repository.findUserById(session.userId);

  if (
    !user ||
    !user.active ||
    user.authVersion !== session.authVersion
  ) {
    return null;
  }

  return user;
}

export async function deleteCurrentCmsSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCookieName())?.value;
  if (!token) return;

  await getCmsRepository().deleteSession(hashCmsSessionToken(token));
}

export function setCmsSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(getCookieName(), token, {
    httpOnly: true,
    maxAge: Math.floor(sessionDurationMs / 1000),
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
  });
}

export function clearCmsSessionCookie(response: NextResponse) {
  response.cookies.set(getCookieName(), "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
  });
}
