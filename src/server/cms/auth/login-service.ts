import "server-only";

import { createHash } from "node:crypto";

import type { CmsUser } from "@/domain/cms/types";
import { appendCmsAudit } from "@/server/cms/audit";
import {
  getDummyCmsPasswordHash,
  verifyCmsPassword,
} from "@/server/cms/auth/password";
import { createCmsSession } from "@/server/cms/auth/session";
import { getCmsMode } from "@/server/cms/config";
import { getCmsRepository } from "@/server/cms/repositories";

const maxAttempts = 5;
const lockDurationMs = 15 * 60 * 1000;
const attemptLifetimeMs = 60 * 60 * 1000;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 254);
}

function attemptKey(email: string, address: string) {
  return createHash("sha256")
    .update(`${email}|${address}`)
    .digest("base64url");
}

async function recordFailure(
  user: CmsUser | null,
  email: string,
  address: string,
) {
  const repository = getCmsRepository();
  const key = attemptKey(email, address);
  const now = Date.now();
  const previous = await repository.getLoginAttempt(key);
  const count = (previous?.count ?? 0) + 1;
  const lockedUntil =
    count >= maxAttempts ? new Date(now + lockDurationMs).toISOString() : "";

  await repository.saveLoginAttempt({
    key,
    count,
    lockedUntil,
    expiresAt: new Date(now + attemptLifetimeMs).toISOString(),
  });

  if (user) {
    await repository.saveUser({
      ...user,
      failedLoginCount: count,
      lockedUntil,
      updatedAt: new Date(now).toISOString(),
    });
  }
}

export async function loginCmsUser(input: {
  readonly email: string;
  readonly password: string;
  readonly address: string;
  readonly requestId: string;
}) {
  const repository = getCmsRepository();
  const email = normalizeEmail(input.email);
  const key = attemptKey(email, input.address);
  const attempt = await repository.getLoginAttempt(key);
  const nowIso = new Date().toISOString();

  if (attempt?.lockedUntil && attempt.lockedUntil > nowIso) {
    return { error: "Login was not successful. Please wait and try again." } as const;
  }

  const user = await repository.findUserByEmail(email);
  const hash = user?.passwordHash || getDummyCmsPasswordHash();
  const passwordValid = await verifyCmsPassword(input.password, hash);

  if (
    !user ||
    !user.active ||
    (user.lockedUntil && user.lockedUntil > nowIso) ||
    !passwordValid
  ) {
    await recordFailure(user, email, input.address);
    return { error: "Email or password is incorrect." } as const;
  }

  const updatedUser: CmsUser = {
    ...user,
    failedLoginCount: 0,
    lockedUntil: "",
    lastLoginAt: nowIso,
    updatedAt: nowIso,
  };

  await repository.transaction(async (transaction) => {
    await transaction.saveUser(updatedUser);
    await transaction.deleteLoginAttempt(key);
    await appendCmsAudit(transaction, {
      actor: updatedUser,
      action: "auth.login",
      entityType: "cms-user",
      entityId: updatedUser.id,
      summary: "Signed in to the CMS.",
      requestId: input.requestId,
    });
  });

  return {
    token: await createCmsSession(updatedUser),
    user: updatedUser,
  } as const;
}

export async function loginCmsMockDemo(requestId: string) {
  if (getCmsMode() !== "mock") {
    return { error: "Demo access is not available." } as const;
  }

  const repository = getCmsRepository();
  const user = await repository.findUserById("mock-administrator");

  if (!user) {
    return { error: "Demo administrator is unavailable." } as const;
  }

  await appendCmsAudit(repository, {
    actor: user,
    action: "auth.demo-login",
    entityType: "cms-user",
    entityId: user.id,
    summary: "Opened the local mock CMS workspace.",
    requestId,
  });

  return {
    token: await createCmsSession(user),
    user,
  } as const;
}
