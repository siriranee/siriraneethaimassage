import { randomUUID } from "node:crypto";

import {
  CMS_PASSWORD_MAX_LENGTH,
  normalizeCmsUsername,
  validateCmsDisplayName,
  validateCmsPasswordValue,
  validateCmsUsername,
} from "@/domain/cms/account-policy";
import { getCmsRoleLabel, isCmsRole } from "@/domain/cms/permissions";
import type {
  CmsAuditEvent,
  CmsLoginAttempt,
  CmsRole,
  CmsUser,
  CmsUserSummary,
} from "@/domain/cms/types";
import {
  createCmsReauthenticationThrottlePlan,
  isCmsLoginThrottleBlocked,
} from "@/server/cms/auth/throttle-policy";

export class CmsUserValidationError extends Error {
  constructor(
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CmsUserValidationError";
  }
}

export class CmsUserConflictError extends Error {
  constructor(
    message = "This account changed in another request. Refresh and try again.",
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CmsUserConflictError";
  }
}

export class CmsUserNotFoundError extends Error {
  constructor() {
    super("CMS user not found.");
    this.name = "CmsUserNotFoundError";
  }
}

export class CmsUserRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many password confirmation attempts. Please wait and try again.");
    this.name = "CmsUserRateLimitError";
  }
}

export type CmsUserManagementRepository = {
  transaction<T>(
    work: (repository: CmsUserManagementRepository) => Promise<T>,
  ): Promise<T>;
  findUserByUsername(username: string): Promise<CmsUser | null>;
  findUserById(id: string): Promise<CmsUser | null>;
  listUsers(): Promise<readonly CmsUser[]>;
  getLoginAttempt(key: string): Promise<CmsLoginAttempt | null>;
  incrementLoginAttempt(
    key: string,
    expiresAt: string,
  ): Promise<CmsLoginAttempt>;
  deleteLoginAttempt(key: string): Promise<void>;
  insertUser(user: CmsUser): Promise<void>;
  updateUser(user: CmsUser, expectedVersion: number): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  lockUserDirectory(): Promise<void>;
  appendAudit(event: CmsAuditEvent): Promise<void>;
};

export type CmsUserManagementContext = {
  readonly actor: CmsUser;
  readonly requestId: string;
  readonly address?: string;
};

export type CmsUserManagementDependencies = {
  readonly repository: CmsUserManagementRepository;
  readonly hashPassword: (password: string) => Promise<string>;
  readonly verifyActorPassword: (
    actor: CmsUser,
    password: string,
  ) => Promise<boolean>;
  readonly allowEmptyActorPassword?: (actor: CmsUser) => boolean;
  readonly now?: () => Date;
  readonly randomId?: () => string;
};

type UserMutationResult = {
  readonly user: CmsUserSummary;
  readonly sessionsRevoked: boolean;
  readonly signedOut: boolean;
};

function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CmsUserValidationError("Request must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function currentVersion(user: CmsUser) {
  return Number.isInteger(user.version) && user.version >= 0 ? user.version : 0;
}

function expectedVersion(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new CmsUserValidationError("Refresh this account and try again.", {
      expectedVersion: "A valid account version is required.",
    });
  }
  return Number(value);
}

function displayName(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";
  const errors = validateCmsDisplayName(result);
  if (errors.length) {
    throw new CmsUserValidationError("Please check the highlighted fields.", {
      displayName: errors.join(" "),
    });
  }
  return result;
}

function username(value: unknown) {
  const result = normalizeCmsUsername(typeof value === "string" ? value : "");
  const errors = validateCmsUsername(result);
  if (errors.length) {
    throw new CmsUserValidationError("Please check the highlighted fields.", {
      username: errors.join(" "),
    });
  }
  return result;
}

function role(value: unknown): CmsRole {
  if (!isCmsRole(value)) {
    throw new CmsUserValidationError("Please choose a valid CMS role.", {
      role: "Choose Administrator or Staff.",
    });
  }
  return value;
}

function active(value: unknown) {
  if (typeof value !== "boolean") {
    throw new CmsUserValidationError("Please choose an account status.", {
      active: "Choose whether this account is active.",
    });
  }
  return value;
}

function newPassword(source: Record<string, unknown>) {
  const password =
    typeof source.newPassword === "string" ? source.newPassword : "";
  const errors = validateCmsPasswordValue(password);
  if (errors.length) {
    throw new CmsUserValidationError("Please check the highlighted fields.", {
      newPassword: errors.join(" "),
    });
  }
  if (source.confirmPassword !== password) {
    throw new CmsUserValidationError("Please check the highlighted fields.", {
      confirmPassword: "Passwords do not match.",
    });
  }
  return password;
}

function currentPassword(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > CMS_PASSWORD_MAX_LENGTH
  ) {
    throw new CmsUserValidationError(
      "Enter your current administrator password to continue.",
      { currentPassword: "Enter your current administrator password." },
    );
  }
  return value;
}

async function confirmActorPassword(
  source: Record<string, unknown>,
  context: CmsUserManagementContext,
  dependencies: CmsUserManagementDependencies,
) {
  if (
    source.currentPassword === "" &&
    dependencies.allowEmptyActorPassword?.(context.actor)
  ) {
    return;
  }

  const now = dependencies.now?.() ?? new Date();
  const throttle = createCmsReauthenticationThrottlePlan(
    context.actor.id,
    context.address ?? "unavailable",
    now.getTime(),
  );
  const existingAttempt =
    await dependencies.repository.getLoginAttempt(throttle.key);
  if (isCmsLoginThrottleBlocked(existingAttempt, throttle.limit)) {
    throw new CmsUserRateLimitError(throttle.retryAfterSeconds);
  }

  const password = currentPassword(source.currentPassword);
  let valid = false;
  try {
    valid = await dependencies.verifyActorPassword(context.actor, password);
  } catch {
    valid = false;
  }
  if (!valid) {
    await dependencies.repository.transaction(async (repository) => {
      const attempt = await repository.incrementLoginAttempt(
        throttle.key,
        throttle.expiresAt,
      );
      if (attempt.count === throttle.limit) {
        await repository.appendAudit(
          auditEvent({
            actor: context.actor,
            action: "auth.reauthentication-risk-threshold",
            entityId: context.actor.id,
            summary:
              "Detected repeated failed administrator password confirmations.",
            requestId: context.requestId,
            createdAt: now.toISOString(),
          }),
        );
      }
    });
    throw new CmsUserValidationError(
      "Your administrator password is incorrect.",
      { currentPassword: "Enter your current administrator password." },
    );
  }

  await dependencies.repository.deleteLoginAttempt(throttle.key);
}

async function currentActor(
  repository: CmsUserManagementRepository,
  context: CmsUserManagementContext,
) {
  const actor = await repository.findUserById(context.actor.id);
  if (
    !actor ||
    !actor.active ||
    actor.role !== "administrator" ||
    actor.authVersion !== context.actor.authVersion
  ) {
    throw new CmsUserConflictError(
      "Your administrator access changed. Refresh and sign in again.",
    );
  }
  return actor;
}

function auditEvent(input: {
  readonly actor: CmsUser;
  readonly action: string;
  readonly entityId: string;
  readonly summary: string;
  readonly requestId: string;
  readonly createdAt: string;
}): CmsAuditEvent {
  return {
    id: randomUUID(),
    actorId: input.actor.id,
    actorName: input.actor.displayName,
    action: input.action,
    entityType: "cms-user",
    entityId: input.entityId,
    summary: input.summary.slice(0, 500),
    requestId: input.requestId.slice(0, 120),
    createdAt: input.createdAt,
  };
}

export function toCmsUserSummary(user: CmsUser): CmsUserSummary {
  return {
    id: user.id,
    username: user.username,
    ...(user.email ? { email: user.email } : {}),
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    version: currentVersion(user),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function createCmsUserCore(
  value: unknown,
  context: CmsUserManagementContext,
  dependencies: CmsUserManagementDependencies,
): Promise<UserMutationResult> {
  const source = object(value);
  const nextUsername = username(source.username);
  const nextDisplayName = displayName(source.displayName);
  const nextRole = role(source.role);
  const password = newPassword(source);
  await confirmActorPassword(source, context, dependencies);

  const passwordHash = await dependencies.hashPassword(password);
  const now = (dependencies.now?.() ?? new Date()).toISOString();
  const id = dependencies.randomId?.() ?? randomUUID();

  return dependencies.repository.transaction(async (repository) => {
    await repository.lockUserDirectory();
    const actor = await currentActor(repository, context);
    if (await repository.findUserByUsername(nextUsername)) {
      throw new CmsUserConflictError("That username is already in use.", {
        username: "Choose another username.",
      });
    }

    const user: CmsUser = {
      id,
      username: nextUsername,
      displayName: nextDisplayName,
      passwordHash,
      role: nextRole,
      active: true,
      authVersion: 1,
      version: 1,
      lastLoginAt: "",
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await repository.insertUser(user);
    await repository.appendAudit(
      auditEvent({
        actor,
        action: "user.created",
        entityId: user.id,
        summary: `Created an active ${getCmsRoleLabel(user.role)} account for ${user.displayName}.`,
        requestId: context.requestId,
        createdAt: now,
      }),
    );

    return { user: toCmsUserSummary(user), sessionsRevoked: false, signedOut: false };
  });
}

export async function updateCmsUserCore(
  userId: string,
  value: unknown,
  context: CmsUserManagementContext,
  dependencies: CmsUserManagementDependencies,
): Promise<UserMutationResult> {
  const source = object(value);
  const version = expectedVersion(source.expectedVersion);
  const nextDisplayName = displayName(source.displayName);
  const nextRole = role(source.role);
  const nextActive = active(source.active);
  await confirmActorPassword(source, context, dependencies);
  const now = (dependencies.now?.() ?? new Date()).toISOString();

  return dependencies.repository.transaction(async (repository) => {
    await repository.lockUserDirectory();
    const actor = await currentActor(repository, context);
    const existing = await repository.findUserById(userId);
    if (!existing) throw new CmsUserNotFoundError();
    if (currentVersion(existing) !== version) throw new CmsUserConflictError();

    const roleChanged = existing.role !== nextRole;
    const statusChanged = existing.active !== nextActive;
    if (existing.id === actor.id && (roleChanged || statusChanged)) {
      throw new CmsUserConflictError(
        "You cannot disable or change the role of your current account.",
      );
    }

    const requiresConfirmation =
      (existing.active && !nextActive) ||
      (existing.role === "administrator" && nextRole !== "administrator");
    if (requiresConfirmation && source.confirmAccessChange !== true) {
      throw new CmsUserValidationError("Confirm this access change.", {
        confirmAccessChange: "Confirm the role or status change.",
      });
    }

    const removesActiveAdministrator =
      existing.active &&
      existing.role === "administrator" &&
      (!nextActive || nextRole !== "administrator");
    if (removesActiveAdministrator) {
      const users = await repository.listUsers();
      const activeAdministrators = users.filter(
        (user) => user.active && user.role === "administrator",
      ).length;
      if (activeAdministrators <= 1) {
        throw new CmsUserConflictError(
          "Keep at least one active administrator account.",
        );
      }
    }

    const sessionsRevoked = roleChanged || statusChanged;
    const user: CmsUser = {
      ...existing,
      displayName: nextDisplayName,
      role: nextRole,
      active: nextActive,
      authVersion: existing.authVersion + (sessionsRevoked ? 1 : 0),
      version: version + 1,
      updatedAt: now,
    };

    await repository.updateUser(user, version);
    if (sessionsRevoked) await repository.deleteSessionsForUser(user.id);
    await repository.appendAudit(
      auditEvent({
        actor,
        action: sessionsRevoked ? "user.access-updated" : "user.profile-updated",
        entityId: user.id,
        summary: sessionsRevoked
          ? `Updated access for ${user.displayName}: ${getCmsRoleLabel(user.role)}, ${user.active ? "active" : "disabled"}; existing sessions were revoked.`
          : `Updated the display name for ${user.displayName}.`,
        requestId: context.requestId,
        createdAt: now,
      }),
    );

    return { user: toCmsUserSummary(user), sessionsRevoked, signedOut: false };
  });
}

export async function resetCmsUserPasswordCore(
  userId: string,
  value: unknown,
  context: CmsUserManagementContext,
  dependencies: CmsUserManagementDependencies,
): Promise<UserMutationResult> {
  const source = object(value);
  const version = expectedVersion(source.expectedVersion);
  const password = newPassword(source);
  await confirmActorPassword(source, context, dependencies);
  const passwordHash = await dependencies.hashPassword(password);
  const now = (dependencies.now?.() ?? new Date()).toISOString();

  return dependencies.repository.transaction(async (repository) => {
    await repository.lockUserDirectory();
    const actor = await currentActor(repository, context);
    const existing = await repository.findUserById(userId);
    if (!existing) throw new CmsUserNotFoundError();
    if (currentVersion(existing) !== version) throw new CmsUserConflictError();

    const user: CmsUser = {
      ...existing,
      passwordHash,
      authVersion: existing.authVersion + 1,
      version: version + 1,
      passwordChangedAt: now,
      updatedAt: now,
    };

    await repository.updateUser(user, version);
    await repository.deleteSessionsForUser(user.id);
    await repository.appendAudit(
      auditEvent({
        actor,
        action: "user.password-reset",
        entityId: user.id,
        summary: `Reset the CMS password for ${user.displayName} and revoked existing sessions.`,
        requestId: context.requestId,
        createdAt: now,
      }),
    );

    return {
      user: toCmsUserSummary(user),
      sessionsRevoked: true,
      signedOut: user.id === actor.id,
    };
  });
}

export async function revokeCmsUserSessionsCore(
  userId: string,
  value: unknown,
  context: CmsUserManagementContext,
  dependencies: CmsUserManagementDependencies,
): Promise<UserMutationResult> {
  const source = object(value);
  const version = expectedVersion(source.expectedVersion);
  if (source.confirmRevoke !== true) {
    throw new CmsUserValidationError("Confirm session revocation.", {
      confirmRevoke: "Confirm that all sessions should be signed out.",
    });
  }
  await confirmActorPassword(source, context, dependencies);
  const now = (dependencies.now?.() ?? new Date()).toISOString();

  return dependencies.repository.transaction(async (repository) => {
    await repository.lockUserDirectory();
    const actor = await currentActor(repository, context);
    const existing = await repository.findUserById(userId);
    if (!existing) throw new CmsUserNotFoundError();
    if (currentVersion(existing) !== version) throw new CmsUserConflictError();

    const user: CmsUser = {
      ...existing,
      authVersion: existing.authVersion + 1,
      version: version + 1,
      updatedAt: now,
    };

    await repository.updateUser(user, version);
    await repository.deleteSessionsForUser(user.id);
    await repository.appendAudit(
      auditEvent({
        actor,
        action: "user.sessions-revoked",
        entityId: user.id,
        summary: `Revoked all CMS sessions for ${user.displayName}.`,
        requestId: context.requestId,
        createdAt: now,
      }),
    );

    return {
      user: toCmsUserSummary(user),
      sessionsRevoked: true,
      signedOut: user.id === actor.id,
    };
  });
}
