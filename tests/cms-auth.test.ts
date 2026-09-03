import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  CMS_DISPLAY_NAME_MAX_LENGTH,
  CMS_DISPLAY_NAME_MIN_LENGTH,
  CMS_PASSWORD_HTML_PATTERN,
  CMS_PASSWORD_MAX_LENGTH,
  CMS_PASSWORD_MIN_LENGTH,
  CMS_USERNAME_HTML_PATTERN,
  CMS_USERNAME_MAX_LENGTH,
  CMS_USERNAME_MIN_LENGTH,
  isValidCmsPassword,
  isValidCmsUsername,
  normalizeCmsUsername,
  validateCmsDisplayName,
  validateCmsPasswordValue,
  validateCmsUsername,
} from "@/domain/cms/account-policy";
import type { CmsAuditEvent, CmsLoginAttempt, CmsUser } from "@/domain/cms/types";
import {
  loginCmsUserCore,
  type CmsLoginRepository,
} from "@/server/cms/auth/login-core";
import {
  CMS_LOGIN_ACCOUNT_ALERT_THRESHOLD,
  CMS_LOGIN_ADDRESS_LIMIT,
  CMS_LOGIN_PAIR_LIMIT,
  CMS_LOGIN_WINDOW_MS,
  createCmsLoginThrottlePlan,
  isCmsLoginThrottleBlocked,
} from "@/server/cms/auth/throttle-policy";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const fixedNow = new Date("2026-09-02T12:07:00.000Z");

function cmsUser(overrides: Partial<CmsUser> = {}): CmsUser {
  return {
    id: "administrator-1",
    username: "admin123",
    displayName: "Siriranee Administrator",
    passwordHash: "stored-password-hash",
    role: "administrator",
    active: true,
    authVersion: 1,
    version: 1,
    lastLoginAt: "",
    passwordChangedAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

class LoginRepositoryDouble implements CmsLoginRepository {
  readonly attempts = new Map<string, CmsLoginAttempt>();
  readonly audits: CmsAuditEvent[] = [];
  readonly deletedAttemptKeys: string[] = [];
  readonly savedUsers: CmsUser[] = [];
  lastUsername = "";

  constructor(readonly users: CmsUser[] = []) {}

  async transaction<T>(
    work: (repository: CmsLoginRepository) => Promise<T>,
  ): Promise<T> {
    return work(this);
  }

  async findUserByUsername(username: string) {
    this.lastUsername = username;
    return this.users.find((user) => user.username === username) ?? null;
  }

  async getLoginAttempt(key: string) {
    return this.attempts.get(key) ?? null;
  }

  async incrementLoginAttempt(key: string, expiresAt: string) {
    const current = this.attempts.get(key);
    const next = {
      key,
      count: (current?.count ?? 0) + 1,
      lockedUntil: "",
      expiresAt,
    };
    this.attempts.set(key, next);
    return next;
  }

  async deleteLoginAttempt(key: string) {
    this.deletedAttemptKeys.push(key);
    this.attempts.delete(key);
  }

  async recordUserLogin(
    userId: string,
    expectedAuthVersion: number,
    timestamp: string,
  ) {
    const index = this.users.findIndex(
      (user) =>
        user.id === userId &&
        user.active &&
        user.authVersion === expectedAuthVersion,
    );
    if (index < 0) return null;

    const user = {
      ...this.users[index],
      lastLoginAt: timestamp,
      updatedAt: timestamp,
    };
    this.users[index] = user;
    this.savedUsers.push(user);
    return user;
  }

  async appendAudit(event: CmsAuditEvent) {
    this.audits.push(event);
  }
}

function loginInput(overrides: Partial<Parameters<typeof loginCmsUserCore>[0]> = {}) {
  return {
    username: "admin123",
    password: "CorrectPassword9",
    address: "203.0.113.42",
    requestId: "request-1",
    ...overrides,
  };
}

test("CMS usernames are canonical, bounded and safe for identifiers", () => {
  assert.equal(normalizeCmsUsername("  123Admin  "), "123admin");
  assert.equal(isValidCmsUsername("admin123"), true);
  assert.equal(isValidCmsUsername("1234"), true);
  assert.equal(isValidCmsUsername("abcd"), true);
  assert.equal(isValidCmsUsername("a".repeat(32)), true);

  for (const invalid of [
    "abc",
    "admin-",
    "admin.user",
    "admin user",
    "a".repeat(CMS_USERNAME_MAX_LENGTH + 1),
  ]) {
    assert.equal(isValidCmsUsername(invalid), false, invalid);
    assert.notEqual(validateCmsUsername(invalid).length, 0, invalid);
  }

  const browserPattern = new RegExp(`^(?:${CMS_USERNAME_HTML_PATTERN})$`);
  assert.equal(browserPattern.test("admin123"), true);
  assert.equal(browserPattern.test("1234"), true);
  assert.equal(browserPattern.test("admin-"), false);
  assert.equal(CMS_USERNAME_MIN_LENGTH, 4);
  assert.equal(CMS_USERNAME_MAX_LENGTH, 32);
});

test("administrator display names are limited to 2 to 80 characters", () => {
  assert.deepEqual(validateCmsDisplayName("Siriranee Admin"), []);
  assert.deepEqual(validateCmsDisplayName(" A "), ["Use 2 to 80 characters."]);
  assert.notEqual(
    validateCmsDisplayName("a".repeat(CMS_DISPLAY_NAME_MAX_LENGTH + 1)).length,
    0,
  );
  assert.equal(CMS_DISPLAY_NAME_MIN_LENGTH, 2);
  assert.equal(CMS_DISPLAY_NAME_MAX_LENGTH, 80);
});

test("new administrator passwords follow the published 12 to 256 character policy", () => {
  assert.deepEqual(validateCmsPasswordValue("abcdefghijkl"), []);
  assert.deepEqual(validateCmsPasswordValue("123456789012"), []);
  assert.deepEqual(validateCmsPasswordValue("Password1234"), []);
  assert.deepEqual(validateCmsPasswordValue("a".repeat(CMS_PASSWORD_MAX_LENGTH)), []);
  assert.notEqual(validateCmsPasswordValue("password123").length, 0);
  assert.notEqual(
    validateCmsPasswordValue("Password1234!").length,
    0,
  );
  assert.notEqual(validateCmsPasswordValue("Password 1234").length, 0);
  assert.notEqual(
    validateCmsPasswordValue("a".repeat(CMS_PASSWORD_MAX_LENGTH + 1)).length,
    0,
  );
  assert.equal(isValidCmsPassword("abcdefghijkl"), true);
  assert.equal(isValidCmsPassword("123456789012"), true);
  assert.equal(isValidCmsPassword("Password1234!"), false);
  const browserPattern = new RegExp(`^(?:${CMS_PASSWORD_HTML_PATTERN})$`);
  assert.equal(browserPattern.test("123456789012"), true);
  assert.equal(browserPattern.test("Password1234!"), false);
  assert.equal(CMS_PASSWORD_MIN_LENGTH, 12);
  assert.equal(CMS_PASSWORD_MAX_LENGTH, 256);
});

test("CMS login throttles account, address and credential pair without raw identifiers", () => {
  const now = Date.UTC(2026, 8, 2, 12, 7, 0);
  const plan = createCmsLoginThrottlePlan(
    "admin123",
    "203.0.113.42",
    now,
  );
  const repeated = createCmsLoginThrottlePlan(
    "admin123",
    "203.0.113.42",
    now,
  );

  assert.deepEqual(plan, repeated);
  assert.deepEqual(
    plan.throttles.map(({ scope, limit }) => ({ scope, limit })),
    [
      { scope: "pair", limit: CMS_LOGIN_PAIR_LIMIT },
      { scope: "account", limit: CMS_LOGIN_ACCOUNT_ALERT_THRESHOLD },
      { scope: "address", limit: CMS_LOGIN_ADDRESS_LIMIT },
    ],
  );
  assert.deepEqual(
    plan.throttles.map(({ scope, behavior }) => ({ scope, behavior })),
    [
      { scope: "pair", behavior: "block" },
      { scope: "account", behavior: "alert" },
      { scope: "address", behavior: "block" },
    ],
  );
  assert.equal(CMS_LOGIN_PAIR_LIMIT, 5);
  assert.equal(CMS_LOGIN_ACCOUNT_ALERT_THRESHOLD, 5);
  assert.equal(CMS_LOGIN_ADDRESS_LIMIT, 20);
  assert.equal(
    Date.parse(plan.expiresAt),
    (Math.floor(now / CMS_LOGIN_WINDOW_MS) + 1) * CMS_LOGIN_WINDOW_MS,
  );

  for (const throttle of plan.throttles) {
    assert.equal(throttle.key.includes("admin123"), false);
    assert.equal(throttle.key.includes("203.0.113.42"), false);
  }

  assert.notEqual(
    createCmsLoginThrottlePlan("anotheradmin", "203.0.113.42", now)
      .throttles[1].key,
    plan.throttles[1].key,
  );
  assert.notEqual(
    createCmsLoginThrottlePlan("admin123", "203.0.113.99", now)
      .throttles[2].key,
    plan.throttles[2].key,
  );
});

test("the throttle threshold helper activates exactly at its limit", () => {
  const attempt = {
    key: "opaque-key",
    count: CMS_LOGIN_PAIR_LIMIT,
    lockedUntil: "",
    expiresAt: "2026-09-02T12:15:00.000Z",
  };

  assert.equal(isCmsLoginThrottleBlocked(null, CMS_LOGIN_PAIR_LIMIT), false);
  assert.equal(
    isCmsLoginThrottleBlocked(
      { ...attempt, count: CMS_LOGIN_PAIR_LIMIT - 1 },
      CMS_LOGIN_PAIR_LIMIT,
    ),
    false,
  );
  assert.equal(
    isCmsLoginThrottleBlocked(attempt, CMS_LOGIN_PAIR_LIMIT),
    true,
  );
});

test("successful username login creates a session and clears only account-specific failures", async () => {
  const repository = new LoginRepositoryDouble([cmsUser()]);
  const plan = createCmsLoginThrottlePlan(
    "admin123",
    "203.0.113.42",
    fixedNow.getTime(),
  );
  for (const throttle of plan.throttles) {
    repository.attempts.set(throttle.key, {
      key: throttle.key,
      count: 1,
      lockedUntil: "",
      expiresAt: plan.expiresAt,
    });
  }
  const sessionUsers: CmsUser[] = [];

  const result = await loginCmsUserCore(
    loginInput({ username: "  ADMIN123  " }),
    {
      repository,
      dummyPasswordHash: "dummy-password-hash",
      verifyPassword: async (password, hash) =>
        password === "CorrectPassword9" && hash === "stored-password-hash",
      createSession: async (user) => {
        sessionUsers.push(user);
        return "opaque-session-token";
      },
      now: () => fixedNow,
    },
  );

  assert.equal("token" in result && result.token, "opaque-session-token");
  assert.equal(repository.lastUsername, "admin123");
  assert.equal(repository.savedUsers[0]?.lastLoginAt, fixedNow.toISOString());
  assert.deepEqual(sessionUsers, repository.savedUsers);
  assert.deepEqual(
    repository.deletedAttemptKeys.sort(),
    plan.throttles
      .filter((throttle) => throttle.scope !== "address")
      .map((throttle) => throttle.key)
      .sort(),
  );
  assert.equal(
    repository.attempts.has(
      plan.throttles.find((throttle) => throttle.scope === "address")!.key,
    ),
    true,
  );
  assert.equal(repository.audits.at(-1)?.action, "auth.login");
});

test("invalid and inactive accounts fail generically and increment every abuse counter", async () => {
  for (const user of [null, cmsUser({ active: false })]) {
    const repository = new LoginRepositoryDouble(user ? [user] : []);
    let sessionCount = 0;
    const result = await loginCmsUserCore(loginInput(), {
      repository,
      dummyPasswordHash: "dummy-password-hash",
      verifyPassword: async () => true,
      createSession: async () => {
        sessionCount += 1;
        return "must-not-be-created";
      },
      now: () => fixedNow,
    });

    assert.equal("code" in result && result.code, "invalid_credentials");
    assert.equal(
      "error" in result && result.error,
      "Username or password is incorrect.",
    );
    assert.equal(sessionCount, 0);
    assert.deepEqual(
      [...repository.attempts.values()].map((attempt) => attempt.count),
      [1, 1, 1],
    );
  }
});

test("pair and address limits return retry feedback before expensive verification", async () => {
  const repository = new LoginRepositoryDouble([cmsUser()]);
  const plan = createCmsLoginThrottlePlan(
    "admin123",
    "203.0.113.42",
    fixedNow.getTime(),
  );
  const pair = plan.throttles.find((throttle) => throttle.scope === "pair")!;
  repository.attempts.set(pair.key, {
    key: pair.key,
    count: pair.limit,
    lockedUntil: "",
    expiresAt: plan.expiresAt,
  });
  let verificationCount = 0;

  const result = await loginCmsUserCore(loginInput(), {
    repository,
    dummyPasswordHash: "dummy-password-hash",
    verifyPassword: async () => {
      verificationCount += 1;
      return true;
    },
    createSession: async () => "must-not-be-created",
    now: () => fixedNow,
  });

  assert.equal("code" in result && result.code, "rate_limited");
  assert.equal(verificationCount, 0);
});

test("an account-wide alert cannot lock out a correct administrator", async () => {
  const repository = new LoginRepositoryDouble([cmsUser()]);
  const plan = createCmsLoginThrottlePlan(
    "admin123",
    "203.0.113.42",
    fixedNow.getTime(),
  );
  const account = plan.throttles.find(
    (throttle) => throttle.scope === "account",
  )!;
  repository.attempts.set(account.key, {
    key: account.key,
    count: account.limit,
    lockedUntil: "",
    expiresAt: plan.expiresAt,
  });

  const result = await loginCmsUserCore(loginInput(), {
    repository,
    dummyPasswordHash: "dummy-password-hash",
    verifyPassword: async () => true,
    createSession: async () => "correct-user-session",
    now: () => fixedNow,
  });

  assert.equal("token" in result && result.token, "correct-user-session");
});

test("a concurrent access change prevents session creation after password verification", async () => {
  const user = cmsUser();
  const repository = new LoginRepositoryDouble([user]);
  let sessionCount = 0;

  const result = await loginCmsUserCore(loginInput(), {
    repository,
    dummyPasswordHash: "dummy-password-hash",
    verifyPassword: async () => {
      repository.users[0] = {
        ...repository.users[0],
        active: false,
        authVersion: repository.users[0].authVersion + 1,
      };
      return true;
    },
    createSession: async () => {
      sessionCount += 1;
      return "must-not-be-created";
    },
    now: () => fixedNow,
  });

  assert.equal("code" in result && result.code, "invalid_credentials");
  assert.equal(sessionCount, 0);
  assert.deepEqual(repository.savedUsers, []);
  assert.equal(repository.audits.length, 0);
});

test("password-verifier failures fail closed without creating a session", async () => {
  const repository = new LoginRepositoryDouble([cmsUser()]);
  let sessionCount = 0;
  const result = await loginCmsUserCore(loginInput(), {
    repository,
    dummyPasswordHash: "dummy-password-hash",
    verifyPassword: async () => {
      throw new Error("malformed stored password hash");
    },
    createSession: async () => {
      sessionCount += 1;
      return "must-not-be-created";
    },
    now: () => fixedNow,
  });

  assert.equal("code" in result && result.code, "invalid_credentials");
  assert.equal(sessionCount, 0);
});

test("the login boundary stays username-only and does not expose password hashes", () => {
  const form = source("src/components/cms/CmsLoginForm.tsx");
  const loginRoute = source("src/app/api/cms/auth/login/route.ts");
  const currentUserRoute = source("src/app/api/cms/auth/me/route.ts");
  const readService = source("src/server/cms/read-service.ts");

  assert.match(form, /name="username"/);
  assert.match(form, /name="rememberUsername"/);
  assert.match(form, /rememberedUsernameKey/);
  assert.match(form, /localStorage\.setItem/);
  assert.match(form, /localStorage\.removeItem/);
  assert.match(form, /normalizeCmsUsername\(username\)/);
  assert.doesNotMatch(form, /localStorage\.setItem\([^;]*password/);
  assert.doesNotMatch(form, /name="email"/);
  assert.match(loginRoute, /username\?: string/);
  assert.doesNotMatch(loginRoute, /email\?: string/);
  assert.match(loginRoute, /status: rateLimited \? 429 : 401/);
  assert.match(loginRoute, /"Retry-After": "900"/);
  assert.match(currentUserRoute, /username: user\.username/);
  assert.doesNotMatch(currentUserRoute, /email: user\.email/);
  assert.match(readService, /CmsUserSummary/);
  assert.doesNotMatch(
    readService.slice(readService.indexOf("export async function listCmsUsers")),
    /passwordHash/,
  );
});

test("administrator provisioning, indexes and sessions retain security controls", () => {
  const seed = source("scripts/seed-cms-admin.mjs");
  const indexes = source("scripts/cms-indexes.mjs");
  const login = source("src/server/cms/auth/login-core.ts");
  const mongo = source("src/server/cms/repositories/mongo-repository.ts");
  const session = source("src/server/cms/auth/session.ts");

  assert.match(seed, /CMS_SEED_USERNAME/);
  assert.doesNotMatch(seed, /CMS_SEED_EMAIL/);
  assert.match(seed, /authVersion = Number\(existing\?\.authVersion \?\? 0\) \+ 1/);
  assert.match(seed, /sessions\.deleteMany\(\{ userId: id \}\)/);
  assert.match(indexes, /cms_users_username_unique/);
  assert.ok(
    indexes.indexOf("cms_users_username_unique") <
      indexes.indexOf("dropIndex(obsoleteEmailIndex.name)"),
  );
  assert.match(login, /dummyPasswordHash/);
  assert.match(login, /throttle\.behavior !== "block"/);
  assert.match(mongo, /\$inc: \{ count: 1 \}/);
  assert.match(session, /httpOnly: true/);
  assert.match(session, /sameSite: "lax"/);
  assert.match(session, /secure: shouldUseSecureCookie\(\)/);
});
