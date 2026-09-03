import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CMS_BOOKING_RETENTION_DAYS,
  CMS_DAY_LOCK_RETENTION_DAYS,
  CMS_NOTIFICATION_RETENTION_DAYS,
  CMS_PUBLICATION_RETENTION_COUNT,
  getCmsBookingExpiryDate,
  getCmsDayLockExpiryDate,
  getCmsNotificationExpiryDate,
} from "@/server/cms/data-retention";

const day = 24 * 60 * 60 * 1_000;

test("CMS operational data uses the configured retention windows", () => {
  assert.equal(CMS_NOTIFICATION_RETENTION_DAYS, 365);
  assert.equal(CMS_BOOKING_RETENTION_DAYS, 730);
  assert.equal(CMS_DAY_LOCK_RETENTION_DAYS, 30);
  assert.equal(CMS_PUBLICATION_RETENTION_COUNT, 50);

  assert.equal(
    getCmsNotificationExpiryDate("2026-01-01T00:00:00.000Z").getTime(),
    Date.parse("2026-01-01T00:00:00.000Z") + 365 * day,
  );
  assert.equal(
    getCmsBookingExpiryDate("2026-06-01T10:00:00.000Z").getTime(),
    Date.parse("2026-06-01T10:00:00.000Z") + 730 * day,
  );
  assert.equal(
    getCmsDayLockExpiryDate("2026-09-04").getTime(),
    Date.parse("2026-09-04T00:00:00.000Z") + 30 * day,
  );
});

test("MongoDB persistence stores TTL dates and retains only recent publications", () => {
  const repository = readFileSync(
    "src/server/cms/repositories/mongo-repository.ts",
    "utf8",
  );
  const indexes = readFileSync("scripts/cms-indexes.mjs", "utf8");

  assert.match(repository, /retentionExpiresAtDate: getCmsBookingExpiryDate\(booking\.startsAt\)/);
  assert.match(repository, /expiresAtDate: getCmsNotificationExpiryDate\(value\.createdAt\)/);
  assert.match(repository, /expiresAtDate: getCmsDayLockExpiryDate\(localDate\)/);
  assert.match(repository, /\.limit\(CMS_PUBLICATION_RETENTION_COUNT\)/);
  assert.match(indexes, /name: "cms_bookings_retention_ttl", expireAfterSeconds: 0/);
  assert.match(indexes, /name: "cms_notifications_retention_ttl", expireAfterSeconds: 0/);
  assert.match(indexes, /name: "cms_day_locks_retention_ttl", expireAfterSeconds: 0/);
  assert.match(indexes, /\.limit\(publicationRetentionCount\)/);
  assert.match(indexes, /publicationCleanup = retainedPublicationIds\.length/);
});
