import { randomUUID } from "node:crypto";

import type {
  CmsAuditEvent,
  CmsLoginAttempt,
  CmsUser,
} from "@/domain/cms/types";
import {
  isValidCmsPassword,
  isValidCmsUsername,
  normalizeCmsUsername,
} from "@/domain/cms/account-policy";
import {
  createCmsLoginThrottlePlan,
  isCmsLoginThrottleBlocked,
} from "@/server/cms/auth/throttle-policy";

export type CmsLoginInput = {
  readonly username: string;
  readonly password: string;
  readonly address: string;
  readonly requestId: string;
};

export type CmsLoginRepository = {
  transaction<T>(
    work: (repository: CmsLoginRepository) => Promise<T>,
  ): Promise<T>;
  findUserByUsername(username: string): Promise<CmsUser | null>;
  getLoginAttempt(key: string): Promise<CmsLoginAttempt | null>;
  incrementLoginAttempt(
    key: string,
    expiresAt: string,
  ): Promise<CmsLoginAttempt>;
  deleteLoginAttempt(key: string): Promise<void>;
  recordUserLogin(
    userId: string,
    expectedAuthVersion: number,
    timestamp: string,
  ): Promise<CmsUser | null>;
  appendAudit(event: CmsAuditEvent): Promise<void>;
};

export type CmsLoginDependencies = {
  readonly repository: CmsLoginRepository;
  readonly dummyPasswordHash: string;
  readonly verifyPassword: (
    password: string,
    passwordHash: string,
  ) => Promise<boolean>;
  readonly createSession: (user: CmsUser) => Promise<string>;
  readonly now?: () => Date;
};

function auditEvent(input: {
  readonly actorId: string;
  readonly actorName: string;
  readonly action: string;
  readonly entityId: string;
  readonly summary: string;
  readonly requestId: string;
  readonly createdAt: string;
}): CmsAuditEvent {
  return {
    id: randomUUID(),
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    entityType: "cms-user",
    entityId: input.entityId,
    summary: input.summary,
    requestId: input.requestId.slice(0, 120),
    createdAt: input.createdAt,
  };
}

async function recordFailure(
  repository: CmsLoginRepository,
  user: CmsUser | null,
  plan: ReturnType<typeof createCmsLoginThrottlePlan>,
  requestId: string,
  createdAt: string,
) {
  await repository.transaction(async (transaction) => {
    let accountCount = 0;

    for (const throttle of plan.throttles) {
      const attempt = await transaction.incrementLoginAttempt(
        throttle.key,
        plan.expiresAt,
      );
      if (throttle.scope === "account") accountCount = attempt.count;
    }

    const accountThrottle = plan.throttles.find(
      (throttle) => throttle.scope === "account",
    );
    if (user && accountThrottle && accountCount === accountThrottle.limit) {
      await transaction.appendAudit(
        auditEvent({
          actorId: "authentication-protection",
          actorName: "Authentication protection",
          action: "auth.login-risk-threshold",
          entityId: user.id,
          summary: "Detected repeated failed CMS sign-in attempts.",
          requestId,
          createdAt,
        }),
      );
    }
  });
}

async function isSourceBlocked(
  repository: CmsLoginRepository,
  plan: ReturnType<typeof createCmsLoginThrottlePlan>,
) {
  for (const throttle of plan.throttles) {
    if (throttle.behavior !== "block") continue;
    const attempt = await repository.getLoginAttempt(throttle.key);
    if (isCmsLoginThrottleBlocked(attempt, throttle.limit)) return true;
  }
  return false;
}

export async function loginCmsUserCore(
  input: CmsLoginInput,
  dependencies: CmsLoginDependencies,
) {
  const { repository } = dependencies;
  const now = dependencies.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const username = normalizeCmsUsername(input.username);
  const throttlePlan = createCmsLoginThrottlePlan(
    username,
    input.address,
    now.getTime(),
  );

  if (await isSourceBlocked(repository, throttlePlan)) {
    return {
      code: "rate_limited",
      error: "Too many sign-in attempts. Please wait and try again.",
    } as const;
  }

  const user = isValidCmsUsername(username)
    ? await repository.findUserByUsername(username)
    : null;
  const hash = user?.passwordHash || dependencies.dummyPasswordHash;
  let passwordValid = false;

  try {
    passwordValid = await dependencies.verifyPassword(input.password, hash);
  } catch {
    passwordValid = false;
  }

  if (!user || !user.active || !isValidCmsPassword(input.password) || !passwordValid) {
    await recordFailure(
      repository,
      user,
      throttlePlan,
      input.requestId,
      nowIso,
    );
    return {
      code: "invalid_credentials",
      error: "Username or password is incorrect.",
    } as const;
  }

  const updatedUser = await repository.transaction(async (transaction) => {
    const recordedUser = await transaction.recordUserLogin(
      user.id,
      user.authVersion,
      nowIso,
    );
    if (!recordedUser) return null;

    for (const throttle of throttlePlan.throttles) {
      if (throttle.scope !== "address") {
        await transaction.deleteLoginAttempt(throttle.key);
      }
    }
    await transaction.appendAudit(
      auditEvent({
        actorId: recordedUser.id,
        actorName: recordedUser.displayName,
        action: "auth.login",
        entityId: recordedUser.id,
        summary: "Signed in to the CMS.",
        requestId: input.requestId,
        createdAt: nowIso,
      }),
    );

    return recordedUser;
  });

  if (!updatedUser) {
    return {
      code: "invalid_credentials",
      error: "Username or password is incorrect.",
    } as const;
  }

  return {
    token: await dependencies.createSession(updatedUser),
    user: updatedUser,
  } as const;
}
