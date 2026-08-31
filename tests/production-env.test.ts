import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const script = resolve(process.cwd(), "scripts/validate-production-env.mjs");
const relevantKeys = [
  "VERCEL",
  "NETLIFY",
  "CI",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_SITE_URL",
  "CMS_MODE",
  "MONGODB_URI",
  "MONGODB_DB",
  "CMS_ORIGIN",
  "CMS_COOKIE_SECURE",
  "CMS_PUBLIC_BOOKING_READY",
  "CMS_PRIVACY_NOTICE_APPROVED",
  "CMS_BOOKING_NOTIFICATION_READY",
  "CMS_MONITORING_READY",
  "CMS_RECOVERY_DRILL_VERIFIED",
  "CMS_PII_ENCRYPTION_KEY",
];

function run(overrides: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of relevantKeys) delete env[key];
  Object.assign(env, { CI: "true" }, overrides);

  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

const validOrigin = "https://siriranee.example";
const database = {
  CMS_MODE: "mongodb",
  MONGODB_URI: "mongodb://127.0.0.1:27017",
  MONGODB_DB: "siriranee_test",
  CMS_ORIGIN: validOrigin,
  CMS_COOKIE_SECURE: "true",
};

test("hosted builds require a clean HTTPS production origin", () => {
  assert.equal(run({ CMS_MODE: "disabled" }).status, 1);
  assert.equal(
    run({
      CMS_MODE: "disabled",
      NEXT_PUBLIC_SITE_URL: "http://example.test/path",
    }).status,
    1,
  );
  assert.equal(
    run({ CMS_MODE: "disabled", NEXT_PUBLIC_SITE_URL: validOrigin }).status,
    0,
  );
  assert.equal(
    run({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "siriraneethaimassage.vercel.app",
      CMS_MODE: "disabled",
    }).status,
    0,
  );
});

test("hosted builds reject mock mode and mismatched CMS origin", () => {
  assert.equal(
    run({ CMS_MODE: "mock", NEXT_PUBLIC_SITE_URL: validOrigin }).status,
    1,
  );
  assert.equal(
    run({
      ...database,
      NEXT_PUBLIC_SITE_URL: validOrigin,
      CMS_ORIGIN: "https://other.example",
    }).status,
    1,
  );
});

test("live booking requires privacy, notification, monitoring, recovery and encryption gates", () => {
  const live = {
    ...database,
    NEXT_PUBLIC_SITE_URL: validOrigin,
    CMS_PUBLIC_BOOKING_READY: "true",
  };

  assert.equal(run(live).status, 1);
  assert.equal(
    run({
      ...live,
      CMS_PRIVACY_NOTICE_APPROVED: "true",
      CMS_BOOKING_NOTIFICATION_READY: "true",
      CMS_MONITORING_READY: "true",
      CMS_RECOVERY_DRILL_VERIFIED: "true",
      CMS_PII_ENCRYPTION_KEY: "invalid",
    }).status,
    1,
  );
  assert.equal(
    run({
      ...live,
      CMS_PRIVACY_NOTICE_APPROVED: "true",
      CMS_BOOKING_NOTIFICATION_READY: "true",
      CMS_MONITORING_READY: "true",
      CMS_RECOVERY_DRILL_VERIFIED: "true",
      CMS_PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
    }).status,
    0,
  );
});

test("boolean readiness flags reject ambiguous values", () => {
  assert.equal(
    run({
      CMS_MODE: "disabled",
      NEXT_PUBLIC_SITE_URL: validOrigin,
      CMS_PUBLIC_BOOKING_READY: "yes",
    }).status,
    1,
  );
});
