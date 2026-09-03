import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type {
  CmsAuditEvent,
  CmsLoginAttempt,
  CmsUser,
} from "@/domain/cms/types";
import {
  CmsUserConflictError,
  CmsUserRateLimitError,
  CmsUserValidationError,
  createCmsUserCore,
  resetCmsUserPasswordCore,
  revokeCmsUserSessionsCore,
  updateCmsUserCore,
  type CmsUserManagementContext,
  type CmsUserManagementDependencies,
  type CmsUserManagementRepository,
} from "@/server/cms/user-core";

const fixedNow = new Date("2026-09-02T14:30:00.000Z");
const currentPassword = "CurrentAdmin123";
const newPassword = "NewAccount123";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function cmsUser(overrides: Partial<CmsUser> = {}): CmsUser {
  return {
    id: "administrator-1",
    username: "admin123",
    displayName: "Siriranee Administrator",
    passwordHash: "stored-administrator-hash",
    role: "administrator",
    active: true,
    authVersion: 2,
    version: 3,
    lastLoginAt: "2026-09-02T09:00:00.000Z",
    passwordChangedAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-09-02T09:00:00.000Z",
    ...overrides,
  };
}

class UserRepositoryDouble implements CmsUserManagementRepository {
  readonly users = new Map<string, CmsUser>();
  readonly audits: CmsAuditEvent[] = [];
  readonly deletedSessionUserIds: string[] = [];
  readonly insertedUserIds: string[] = [];
  readonly updatedUserIds: string[] = [];
  readonly loginAttempts = new Map<string, CmsLoginAttempt>();
  directoryLockCount = 0;

  constructor(users: readonly CmsUser[] = []) {
    for (const user of users) this.users.set(user.id, user);
  }

  async transaction<T>(
    work: (repository: CmsUserManagementRepository) => Promise<T>,
  ): Promise<T> {
    return work(this);
  }

  async findUserByUsername(username: string) {
    const normalized = username.toLowerCase();
    return (
      [...this.users.values()].find(
        (user) => user.username.toLowerCase() === normalized,
      ) ?? null
    );
  }

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async listUsers() {
    return [...this.users.values()];
  }

  async getLoginAttempt(key: string) {
    return this.loginAttempts.get(key) ?? null;
  }

  async incrementLoginAttempt(key: string, expiresAt: string) {
    const current = this.loginAttempts.get(key);
    const attempt = {
      key,
      count: (current?.count ?? 0) + 1,
      lockedUntil: "",
      expiresAt,
    };
    this.loginAttempts.set(key, attempt);
    return attempt;
  }

  async deleteLoginAttempt(key: string) {
    this.loginAttempts.delete(key);
  }

  async insertUser(user: CmsUser) {
    if (
      this.users.has(user.id) ||
      [...this.users.values()].some(
        (current) => current.username.toLowerCase() === user.username.toLowerCase(),
      )
    ) {
      throw new CmsUserConflictError("That username is already in use.");
    }
    this.users.set(user.id, user);
    this.insertedUserIds.push(user.id);
  }

  async updateUser(user: CmsUser, expectedVersion: number) {
    const current = this.users.get(user.id);
    if (!current || current.version !== expectedVersion) {
      throw new CmsUserConflictError();
    }
    this.users.set(user.id, user);
    this.updatedUserIds.push(user.id);
  }

  async deleteSessionsForUser(userId: string) {
    this.deletedSessionUserIds.push(userId);
  }

  async lockUserDirectory() {
    this.directoryLockCount += 1;
  }

  async appendAudit(event: CmsAuditEvent) {
    this.audits.push(event);
  }
}

function passwordHash(password: string) {
  return `sha256-test$${createHash("sha256").update(password).digest("hex")}`;
}

function dependencies(
  repository: UserRepositoryDouble,
  overrides: Partial<CmsUserManagementDependencies> = {},
): CmsUserManagementDependencies {
  return {
    repository,
    hashPassword: async (password) => passwordHash(password),
    verifyActorPassword: async (_actor, password) =>
      password === currentPassword,
    now: () => fixedNow,
    randomId: () => "created-user-1",
    ...overrides,
  };
}

function context(actor: CmsUser): CmsUserManagementContext {
  return {
    actor,
    address: "203.0.113.10",
    requestId: "admin-request-1",
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "New Staff Member",
    username: "newstaff12",
    role: "staff",
    newPassword,
    confirmPassword: newPassword,
    currentPassword,
    ...overrides,
  };
}

test("account creation normalizes usernames, hashes passwords and exposes no secret", async () => {
  const actor = cmsUser();
  const repository = new UserRepositoryDouble([actor]);
  const hashedInputs: string[] = [];
  const result = await createCmsUserCore(
    createInput({ username: "  NEWSTAFF12  " }),
    context(actor),
    dependencies(repository, {
      hashPassword: async (password) => {
        hashedInputs.push(password);
        return passwordHash(password);
      },
    }),
  );

  const stored = repository.users.get("created-user-1");
  assert.ok(stored);
  assert.deepEqual(hashedInputs, [newPassword]);
  assert.equal(stored.username, "newstaff12");
  assert.equal(stored.displayName, "New Staff Member");
  assert.equal(stored.role, "staff");
  assert.equal(stored.active, true);
  assert.equal(stored.authVersion, 1);
  assert.equal(stored.version, 1);
  assert.equal(stored.passwordHash, passwordHash(newPassword));
  assert.notEqual(stored.passwordHash, newPassword);
  assert.equal(stored.passwordHash.includes(newPassword), false);
  assert.equal("passwordHash" in result.user, false);
  assert.equal("passwordChangedAt" in result.user, false);
  assert.equal(result.sessionsRevoked, false);
  assert.equal(result.signedOut, false);
  assert.equal(repository.directoryLockCount, 1);
  assert.equal(repository.audits.at(-1)?.action, "user.created");

  const publicOutput = JSON.stringify({ result, audits: repository.audits });
  assert.equal(publicOutput.includes(newPassword), false);
  assert.equal(publicOutput.includes(currentPassword), false);
  assert.equal(publicOutput.includes("passwordHash"), false);
});

test("account creation rejects a duplicate username after canonicalization", async () => {
  const actor = cmsUser();
  const existing = cmsUser({
    id: "staff-1",
    username: "existing12",
    displayName: "Existing Staff",
    role: "staff",
  });
  const repository = new UserRepositoryDouble([actor, existing]);

  await assert.rejects(
    () =>
      createCmsUserCore(
        createInput({ username: "  EXISTING12  " }),
        context(actor),
        dependencies(repository),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CmsUserConflictError);
      assert.equal(error.fields.username, "Choose another username.");
      return true;
    },
  );
  assert.deepEqual(repository.insertedUserIds, []);
  assert.equal(repository.audits.length, 0);
});

test("management actions fail closed when administrator reauthentication is wrong", async () => {
  const actor = cmsUser();
  const repository = new UserRepositoryDouble([actor]);
  let hashCount = 0;

  await assert.rejects(
    () =>
      createCmsUserCore(
        createInput({ currentPassword: "WrongPassword12" }),
        context(actor),
        dependencies(repository, {
          hashPassword: async (password) => {
            hashCount += 1;
            return passwordHash(password);
          },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CmsUserValidationError);
      assert.equal(
        error.fields.currentPassword,
        "Enter your current administrator password.",
      );
      return true;
    },
  );
  assert.equal(hashCount, 0);
  assert.equal(repository.users.size, 1);
  assert.equal(repository.directoryLockCount, 0);
  assert.equal(repository.audits.length, 0);
});

test("a stale account version cannot overwrite a newer record", async () => {
  const actor = cmsUser();
  const target = cmsUser({
    id: "staff-1",
    username: "staff123",
    displayName: "Staff Member",
    role: "staff",
    version: 5,
  });
  const repository = new UserRepositoryDouble([actor, target]);

  await assert.rejects(
    () =>
      updateCmsUserCore(
        target.id,
        {
          expectedVersion: 4,
          displayName: "Stale Name",
          role: "staff",
          active: true,
          currentPassword,
        },
        context(actor),
        dependencies(repository),
      ),
    CmsUserConflictError,
  );
  assert.equal(repository.users.get(target.id)?.displayName, "Staff Member");
  assert.deepEqual(repository.updatedUserIds, []);
  assert.deepEqual(repository.deletedSessionUserIds, []);
  assert.equal(repository.audits.length, 0);
});

test("an administrator cannot disable or change the role of the current account", async () => {
  for (const change of [
    { role: "staff", active: true },
    { role: "administrator", active: false },
  ] as const) {
    const actor = cmsUser();
    const repository = new UserRepositoryDouble([actor]);

    await assert.rejects(
      () =>
        updateCmsUserCore(
          actor.id,
          {
            expectedVersion: actor.version,
            displayName: actor.displayName,
            confirmAccessChange: true,
            currentPassword,
            ...change,
          },
          context(actor),
          dependencies(repository),
        ),
      (error: unknown) => {
        assert.ok(error instanceof CmsUserConflictError);
        assert.match(error.message, /current account/i);
        return true;
      },
    );
    assert.equal(repository.users.get(actor.id)?.active, true);
    assert.equal(repository.users.get(actor.id)?.role, "administrator");
  }
});

test("the last active administrator always remains active", async () => {
  const actor = cmsUser();
  const repository = new UserRepositoryDouble([
    actor,
    cmsUser({
      id: "staff-1",
      username: "staff123",
      displayName: "Staff Member",
      role: "staff",
    }),
  ]);

  await assert.rejects(
    () =>
      updateCmsUserCore(
        actor.id,
        {
          expectedVersion: actor.version,
          displayName: actor.displayName,
          role: "administrator",
          active: false,
          confirmAccessChange: true,
          currentPassword,
        },
        context(actor),
        dependencies(repository),
      ),
    CmsUserConflictError,
  );
  const activeAdministrators = [...repository.users.values()].filter(
    (user) => user.active && user.role === "administrator",
  );
  assert.deepEqual(activeAdministrators.map((user) => user.id), [actor.id]);
});

test("role changes increment authVersion and revoke all target sessions", async () => {
  const actor = cmsUser();
  const target = cmsUser({
    id: "staff-1",
    username: "staff123",
    displayName: "Staff Member",
    role: "staff",
    authVersion: 7,
    version: 4,
  });
  const repository = new UserRepositoryDouble([actor, target]);
  const result = await updateCmsUserCore(
    target.id,
    {
      expectedVersion: target.version,
      displayName: target.displayName,
      role: "administrator",
      active: true,
      currentPassword,
    },
    context(actor),
    dependencies(repository),
  );

  const stored = repository.users.get(target.id);
  assert.equal(stored?.role, "administrator");
  assert.equal(stored?.authVersion, 8);
  assert.equal(stored?.version, 5);
  assert.equal(result.sessionsRevoked, true);
  assert.deepEqual(repository.deletedSessionUserIds, [target.id]);
  assert.equal(repository.audits.at(-1)?.action, "user.access-updated");
  assert.match(repository.audits.at(-1)?.summary ?? "", /sessions were revoked/i);
});

test("display-name-only changes preserve sessions and authVersion", async () => {
  const actor = cmsUser();
  const target = cmsUser({
    id: "staff-1",
    username: "staff123",
    displayName: "Old Display Name",
    role: "staff",
    authVersion: 7,
    version: 4,
  });
  const repository = new UserRepositoryDouble([actor, target]);
  const result = await updateCmsUserCore(
    target.id,
    {
      expectedVersion: target.version,
      displayName: "New Display Name",
      role: "staff",
      active: true,
      currentPassword,
    },
    context(actor),
    dependencies(repository),
  );

  const stored = repository.users.get(target.id);
  assert.equal(stored?.displayName, "New Display Name");
  assert.equal(stored?.authVersion, 7);
  assert.equal(stored?.version, 5);
  assert.equal(result.sessionsRevoked, false);
  assert.deepEqual(repository.deletedSessionUserIds, []);
  assert.equal(repository.audits.at(-1)?.action, "user.profile-updated");
});

test("password reset replaces the hash, advances versions and revokes sessions", async () => {
  const actor = cmsUser();
  const target = cmsUser({
    id: "staff-1",
    username: "staff123",
    displayName: "Staff Member",
    role: "staff",
    authVersion: 3,
    version: 6,
    passwordHash: "old-password-hash",
  });
  const repository = new UserRepositoryDouble([actor, target]);
  const result = await resetCmsUserPasswordCore(
    target.id,
    {
      expectedVersion: target.version,
      newPassword,
      confirmPassword: newPassword,
      currentPassword,
    },
    context(actor),
    dependencies(repository),
  );

  const stored = repository.users.get(target.id);
  assert.equal(stored?.passwordHash, passwordHash(newPassword));
  assert.equal(stored?.passwordHash.includes(newPassword), false);
  assert.equal(stored?.authVersion, 4);
  assert.equal(stored?.version, 7);
  assert.equal(stored?.passwordChangedAt, fixedNow.toISOString());
  assert.equal(result.sessionsRevoked, true);
  assert.equal(result.signedOut, false);
  assert.equal("passwordHash" in result.user, false);
  assert.deepEqual(repository.deletedSessionUserIds, [target.id]);
  assert.equal(repository.audits.at(-1)?.action, "user.password-reset");
  assert.equal(JSON.stringify(result).includes(newPassword), false);
});

test("explicit self-session revocation advances account versions and signs out the actor", async () => {
  const actor = cmsUser();
  const repository = new UserRepositoryDouble([actor]);
  const result = await revokeCmsUserSessionsCore(
    actor.id,
    {
      expectedVersion: actor.version,
      confirmRevoke: true,
      currentPassword,
    },
    context(actor),
    dependencies(repository),
  );

  assert.equal(result.sessionsRevoked, true);
  assert.equal(result.signedOut, true);
  assert.equal(result.user.version, actor.version + 1);
  assert.equal(
    repository.users.get(actor.id)?.authVersion,
    actor.authVersion + 1,
  );
  assert.deepEqual(repository.updatedUserIds, [actor.id]);
  assert.deepEqual(repository.deletedSessionUserIds, [actor.id]);
  assert.equal(repository.audits.at(-1)?.action, "user.sessions-revoked");
});

test("administrator password confirmation is persistently rate limited and audited", async () => {
  const actor = cmsUser();
  const repository = new UserRepositoryDouble([actor]);
  const failingDependencies = dependencies(repository, {
    verifyActorPassword: async () => false,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      createCmsUserCore(createInput(), context(actor), failingDependencies),
      CmsUserValidationError,
    );
  }

  await assert.rejects(
    createCmsUserCore(createInput(), context(actor), failingDependencies),
    CmsUserRateLimitError,
  );
  assert.equal(repository.loginAttempts.size, 1);
  assert.equal(repository.audits.length, 1);
  assert.equal(
    repository.audits[0]?.action,
    "auth.reauthentication-risk-threshold",
  );
  assert.doesNotMatch(
    JSON.stringify(repository.audits),
    /203\.0\.113\.10|CurrentAdmin123/,
  );
});

test("all CMS user mutation APIs enforce origin, administrator permission and safe responses", () => {
  const routePaths = [
    "src/app/api/cms/users/route.ts",
    "src/app/api/cms/users/[userId]/route.ts",
    "src/app/api/cms/users/[userId]/password/route.ts",
    "src/app/api/cms/users/[userId]/revoke-sessions/route.ts",
  ];

  for (const path of routePaths) {
    const route = source(path);
    assert.match(route, /isSameOriginMutation\(request\)/, path);
    assert.match(route, /requireCmsApiUser\("users:manage"\)/, path);
    assert.match(route, /readCmsUserJsonObject\(request\)/, path);
    assert.match(route, /cmsNoStoreJson\(/, path);
    assert.doesNotMatch(route, /passwordHash/, path);
    assert.doesNotMatch(route, /export async function DELETE/, path);
    assert.ok(
      route.indexOf("isSameOriginMutation(request)") <
        route.indexOf('requireCmsApiUser("users:manage")'),
      `${path} must reject cross-origin requests before account work`,
    );
  }

  const passwordRoute = source(
    "src/app/api/cms/users/[userId]/password/route.ts",
  );
  const sessionRoute = source(
    "src/app/api/cms/users/[userId]/revoke-sessions/route.ts",
  );
  assert.match(passwordRoute, /if \(result\.signedOut\) clearCmsSessionCookie/);
  assert.match(sessionRoute, /if \(result\.signedOut\) clearCmsSessionCookie/);

  const http = source("src/server/cms/user-http.ts");
  const repository = source("src/server/cms/repositories/repository.ts");
  const mongo = source("src/server/cms/repositories/mongo-repository.ts");
  assert.match(http, /readJsonBody\(request, 16_000\)/);
  assert.match(http, /status: 422/);
  assert.match(http, /status: 409/);
  assert.match(http, /status: 404/);
  assert.match(repository, /updateUser\(user: CmsUser, expectedVersion: number\)/);
  assert.match(repository, /recordUserLogin\(/);
  assert.match(repository, /lockUserDirectory\(\)/);
  assert.match(mongo, /_id: "cms-user-directory-lock"/);
  assert.match(mongo, /returnDocument: "after"/);
});

test("admin pages, navigation and forms retain access and accessibility contracts", () => {
  const listPage = source("src/app/cms/(protected)/admin/page.tsx");
  const newPage = source("src/app/cms/(protected)/admin/new/page.tsx");
  const editPage = source(
    "src/app/cms/(protected)/admin/[userId]/edit/page.tsx",
  );
  const legacyPage = source(
    "src/app/cms/(protected)/settings/users/page.tsx",
  );
  const shell = source("src/components/cms/CmsShell.tsx");
  const settings = source("src/app/cms/(protected)/settings/page.tsx");
  const form = source("src/components/cms/CmsAdminUserForm.tsx");

  for (const page of [listPage, newPage, editPage, legacyPage]) {
    assert.match(page, /requireCmsPageUser\("users:manage"\)/);
  }
  assert.match(shell, /href: "\/cms\/admin"[\s\S]*permission: "users:manage"/);
  assert.match(settings, /href: "\/cms\/admin"[\s\S]*permission: "users:manage"/);
  assert.match(legacyPage, /redirect\("\/cms\/admin"\)/);
  assert.match(listPage, /aria-labelledby="account-directory-title"/);

  assert.match(form, /<fieldset/);
  assert.match(form, /aria-busy=/);
  assert.match(form, /aria-live="polite"/);
  assert.match(form, /role=\{feedback\.tone === "error" \? "alert" : "status"\}/);
  assert.match(form, /aria-describedby=/);
  assert.match(form, /aria-invalid=/);
  assert.match(form, /aria-pressed=\{visible\}/);
  assert.match(form, /minLength=\{CMS_USERNAME_MIN_LENGTH\}/);
  assert.match(form, /maxLength=\{CMS_USERNAME_MAX_LENGTH\}/);
  assert.match(form, /pattern=\{CMS_USERNAME_HTML_PATTERN\}/);
  assert.match(form, /minLength=\{newPassword \? CMS_PASSWORD_MIN_LENGTH : undefined\}/);
  assert.match(form, /maxLength=\{CMS_PASSWORD_MAX_LENGTH\}/);
  assert.match(form, /pattern=\{newPassword \? CMS_PASSWORD_HTML_PATTERN : undefined\}/);
  assert.match(form, /autoComplete="new-password"/);
  assert.match(form, /autoComplete="current-password"/);
  assert.doesNotMatch(form, /name="email"/);
  assert.doesNotMatch(form, /passwordHash/);
  assert.doesNotMatch(form, /method:\s*"DELETE"/);
});
