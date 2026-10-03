import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BSON } from "mongodb";

import {
  createNotificationRetentionPlan,
  notificationCompareAndSetFilter,
  notificationExpiry,
  runNotificationRetentionBackfill,
} from "../scripts/notification-retention-lib.mjs";

const day = 24 * 60 * 60 * 1_000;
const ttlIndex = { key: { expiresAtDate: 1 }, expireAfterSeconds: 0 };

function same(left, right) {
  return BSON.EJSON.stringify(left, { relaxed: false }) === BSON.EJSON.stringify(right, { relaxed: false });
}

function matchesField(row, name, condition) {
  const present = Object.prototype.hasOwnProperty.call(row, name);
  return condition.$exists === present && (!present || same(row[name], condition.$eq));
}

function fakeDatabase(initialRows, indexes = [ttlIndex]) {
  const rows = structuredClone(initialRows);
  const writes = [];
  const collection = {
    indexes: async () => indexes,
    find: () => ({
      toArray: async () => rows.filter((row) => !(row.expiresAtDate instanceof Date)),
    }),
    updateOne: async (filter, update) => {
      const row = rows.find((candidate) =>
        same(candidate._id, filter._id) &&
        !(candidate.expiresAtDate instanceof Date) &&
        matchesField(candidate, "createdAt", filter.createdAt) &&
        matchesField(candidate, "expiresAtDate", filter.expiresAtDate),
      );
      if (!row) return { matchedCount: 0 };
      row.expiresAtDate = update.$set.expiresAtDate;
      writes.push({ id: row._id, expiry: row.expiresAtDate });
      return { matchedCount: 1 };
    },
  };
  return {
    databaseName: "siriranee-test",
    rows,
    writes,
    listCollections: () => ({ hasNext: async () => true }),
    collection: () => collection,
  };
}

const client = {
  startSession: () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  }),
};

test("notification retention uses createdAt plus one year and falls back to now for invalid or future dates", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");
  assert.equal(notificationExpiry("2026-01-01T00:00:00.000Z", now).getTime(), Date.parse("2026-01-01T00:00:00.000Z") + 365 * day);
  assert.equal(notificationExpiry("not a date", now).getTime(), now.getTime() + 365 * day);
  assert.equal(notificationExpiry("2027-01-01T00:00:00.000Z", now).getTime(), now.getTime() + 365 * day);
  assert.equal(notificationExpiry(null, now).getTime(), now.getTime() + 365 * day);
});

test("dry run identifies missing and invalid expiry without writes or exposing identifiers", async () => {
  const db = fakeDatabase([
    { _id: "private-notification-1", createdAt: "2026-01-01T00:00:00.000Z" },
    { _id: "private-notification-2", createdAt: "bad", expiresAtDate: "bad" },
    { _id: "valid", createdAt: "2026-01-01T00:00:00.000Z", expiresAtDate: new Date("2027-01-01T00:00:00.000Z") },
  ]);
  const report = await runNotificationRetentionBackfill(db, { now: new Date("2026-10-03T12:00:00.000Z") });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.totalToRepair, 2);
  assert.equal(report.missingExpiryCount, 1);
  assert.equal(report.invalidExpiryCount, 1);
  assert.equal(report.invalidCreatedAtCount, 1);
  assert.equal(report.ttlIndexReady, true);
  assert.deepEqual(db.writes, []);
  assert.doesNotMatch(JSON.stringify(report), /private-notification|createdAt|expiresAtDate/);
});

test("apply requires the exact current plan and a compatible TTL index", async () => {
  const db = fakeDatabase([{ _id: "one", createdAt: "2026-01-01T00:00:00.000Z" }]);
  const dryRun = await runNotificationRetentionBackfill(db);
  await assert.rejects(runNotificationRetentionBackfill(db, { client, apply: true, expectedPlan: "0".repeat(64) }), /exact current dry-run plan hash/);
  assert.deepEqual(db.writes, []);

  db.rows.push({ _id: "two", createdAt: "2026-01-02T00:00:00.000Z" });
  await assert.rejects(runNotificationRetentionBackfill(db, { client, apply: true, expectedPlan: dryRun.planHash }), /exact current dry-run plan hash/);
  assert.deepEqual(db.writes, []);

  const noTtl = fakeDatabase([{ _id: "one" }], [{ key: { expiresAtDate: 1 }, expireAfterSeconds: 3600 }]);
  const noTtlPlan = await runNotificationRetentionBackfill(noTtl);
  assert.equal(noTtlPlan.ttlIndexReady, false);
  await assert.rejects(runNotificationRetentionBackfill(noTtl, { client, apply: true, expectedPlan: noTtlPlan.planHash }), /TTL index/);
  assert.deepEqual(noTtl.writes, []);
});

test("apply changes only invalid expiry dates, verifies the result, and is idempotent", async () => {
  const db = fakeDatabase([
    { _id: "one", createdAt: "2026-01-01T00:00:00.000Z" },
    { _id: "two", createdAt: "invalid", expiresAtDate: null },
    { _id: "three", createdAt: "2026-01-01T00:00:00.000Z", expiresAtDate: new Date("2027-01-01T00:00:00.000Z") },
  ]);
  const before = Date.now();
  const dryRun = await runNotificationRetentionBackfill(db);
  const result = await runNotificationRetentionBackfill(db, { client, apply: true, expectedPlan: dryRun.planHash });
  const after = Date.now();
  assert.equal(result.repairedCount, 2);
  assert.equal(result.remainingCount, 0);
  assert.equal(db.writes.length, 2);
  assert.equal(db.rows[0].expiresAtDate.getTime(), Date.parse("2026-01-01T00:00:00.000Z") + 365 * day);
  assert.ok(db.rows[1].expiresAtDate.getTime() >= before + 365 * day);
  assert.ok(db.rows[1].expiresAtDate.getTime() <= after + 365 * day);
  assert.equal(db.rows[2].expiresAtDate.getTime(), Date.parse("2027-01-01T00:00:00.000Z"));
  const repeated = await runNotificationRetentionBackfill(db);
  assert.equal(repeated.totalToRepair, 0);
});

test("the per-document guard compares the original expiry and createdAt state", () => {
  const filter = notificationCompareAndSetFilter({ _id: "one", createdAt: "date", expiresAtDate: null });
  assert.deepEqual(filter.createdAt, { $eq: "date", $exists: true });
  assert.deepEqual(filter.expiresAtDate, { $eq: null, $exists: true });
  const missing = notificationCompareAndSetFilter({ _id: "two" });
  assert.deepEqual(missing.createdAt, { $exists: false });
  assert.deepEqual(missing.expiresAtDate, { $exists: false });
});

test("hash is independent of query order but changes with source expiry state", () => {
  const a = { _id: "one", createdAt: "2026-01-01T00:00:00.000Z" };
  const b = { _id: "two", createdAt: "2026-01-02T00:00:00.000Z", expiresAtDate: null };
  const original = createNotificationRetentionPlan("siriranee-test", [a, b], true);
  assert.equal(original.hash, createNotificationRetentionPlan("siriranee-test", [b, a], true).hash);
  assert.notEqual(original.hash, createNotificationRetentionPlan("siriranee-test", [a, { ...b, expiresAtDate: "invalid" }], true).hash);
});

test("general CMS index maintenance no longer silently rewrites notifications", () => {
  const script = readFileSync(new URL("../scripts/cms-indexes.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(script, /notifications\.updateMany\(/);
  assert.match(script, /name: "cms_notifications_retention_ttl", expireAfterSeconds: 0/);
});
