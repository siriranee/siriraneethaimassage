import { createHash } from "node:crypto";

import { BSON } from "mongodb";

export const NOTIFICATION_RETENTION_DAYS = 365;
export const MAX_ATOMIC_NOTIFICATION_REPAIRS = 1_000;

const millisecondsPerDay = 24 * 60 * 60 * 1_000;
const migrationVersion = 1;
const collectionName = "cmsBookingNotifications";
const missingExpiryFilter = {
  $expr: { $ne: [{ $type: "$expiresAtDate" }, "date"] },
};

function hasField(row, name) {
  return Object.prototype.hasOwnProperty.call(row, name);
}

function canonical(value) {
  return BSON.EJSON.stringify(value, { relaxed: false });
}

function sourceField(row, name) {
  return hasField(row, name)
    ? { present: true, value: canonical(row[name]) }
    : { present: false };
}

function planHash(databaseName, ttlIndexReady, rows) {
  const sources = rows
    .map((row) => ({
      id: canonical(row._id),
      createdAt: sourceField(row, "createdAt"),
      expiresAtDate: sourceField(row, "expiresAtDate"),
    }))
    .sort((first, second) => first.id.localeCompare(second.id));
  return createHash("sha256")
    .update(JSON.stringify({ migrationVersion, databaseName, ttlIndexReady, sources }))
    .digest("hex");
}

function usableCreatedAt(value, now) {
  const date = value instanceof Date
    ? value
    : typeof value === "string" && value.trim()
      ? new Date(value)
      : null;
  if (!date || !Number.isFinite(date.getTime()) || date.getTime() > now.getTime()) {
    return null;
  }
  return date;
}

export function notificationExpiry(createdAt, now = new Date()) {
  const start = usableCreatedAt(createdAt, now) ?? now;
  return new Date(start.getTime() + NOTIFICATION_RETENTION_DAYS * millisecondsPerDay);
}

export function createNotificationRetentionPlan(databaseName, rows, ttlIndexReady, now = new Date()) {
  const invalidCreatedAtCount = rows.filter((row) => !usableCreatedAt(row.createdAt, now)).length;
  const alreadyDueCount = rows.filter((row) => notificationExpiry(row.createdAt, now) <= now).length;
  return {
    databaseName,
    ttlIndexReady,
    rows,
    hash: planHash(databaseName, ttlIndexReady, rows),
    summary: {
      missingExpiryCount: rows.filter((row) => !hasField(row, "expiresAtDate")).length,
      invalidExpiryCount: rows.filter((row) => hasField(row, "expiresAtDate")).length,
      invalidCreatedAtCount,
      alreadyDueCount,
      totalToRepair: rows.length,
    },
  };
}

function ttlIndexIsReady(indexes) {
  return indexes.some((index) =>
    Object.keys(index.key ?? {}).length === 1 &&
    index.key.expiresAtDate === 1 &&
    index.expireAfterSeconds === 0,
  );
}

async function readTtlIndexState(database) {
  const exists = await database.listCollections(
    { name: collectionName },
    { nameOnly: true },
  ).hasNext();
  if (!exists) return false;
  return ttlIndexIsReady(await database.collection(collectionName).indexes());
}

async function readPlan(database, ttlIndexReady, now, session) {
  const rows = await database.collection(collectionName)
    .find(missingExpiryFilter, {
      session,
      projection: { _id: 1, createdAt: 1, expiresAtDate: 1 },
    })
    .toArray();
  return createNotificationRetentionPlan(database.databaseName, rows, ttlIndexReady, now);
}

function compareField(row, name) {
  return hasField(row, name)
    ? { $eq: row[name], $exists: true }
    : { $exists: false };
}

export function notificationCompareAndSetFilter(row) {
  return {
    _id: row._id,
    createdAt: compareField(row, "createdAt"),
    expiresAtDate: compareField(row, "expiresAtDate"),
    ...missingExpiryFilter,
  };
}

export function notificationRetentionReport(plan, mode, repairedCount = 0, remainingCount = plan.rows.length) {
  return {
    mode,
    database: plan.databaseName,
    planHash: plan.hash,
    ttlIndexReady: plan.ttlIndexReady,
    ...plan.summary,
    repairedCount,
    remainingCount,
  };
}

export async function runNotificationRetentionBackfill(database, { client, apply = false, expectedPlan = "", now = new Date() } = {}) {
  const ttlIndexReady = await readTtlIndexState(database);
  const plan = await readPlan(database, ttlIndexReady, now);
  if (!apply) return notificationRetentionReport(plan, "dry-run");

  if (!/^[a-f0-9]{64}$/.test(expectedPlan) || expectedPlan !== plan.hash) {
    throw new Error("The exact current dry-run plan hash is required; no records were changed.");
  }
  if (!ttlIndexReady) {
    throw new Error("The booking-notification TTL index is missing or incompatible; no records were changed.");
  }
  if (plan.rows.length > MAX_ATOMIC_NOTIFICATION_REPAIRS) {
    throw new Error(`More than ${MAX_ATOMIC_NOTIFICATION_REPAIRS} notifications need repair; review a batched migration. No records were changed.`);
  }
  if (!client?.startSession) {
    throw new Error("Apply requires a MongoDB client supporting transactions; no records were changed.");
  }

  const session = client.startSession();
  let repairedCount = 0;
  try {
    await session.withTransaction(async () => {
      // Recheck inside the transaction so a reviewed plan cannot silently run
      // against notifications created, removed or edited since the dry run.
      const transactionNow = new Date();
      const current = await readPlan(database, ttlIndexReady, transactionNow, session);
      if (current.hash !== expectedPlan) {
        throw new Error("Notification state changed since the reviewed dry run; no records were changed.");
      }
      let changedInTransaction = 0;
      for (const row of current.rows) {
        const result = await database.collection(collectionName).updateOne(
          notificationCompareAndSetFilter(row),
          { $set: { expiresAtDate: notificationExpiry(row.createdAt, transactionNow) } },
          { session },
        );
        if (result.matchedCount !== 1) {
          throw new Error("A notification changed during repair; the transaction was aborted.");
        }
        changedInTransaction += 1;
      }
      const verified = await readPlan(database, ttlIndexReady, transactionNow, session);
      if (verified.rows.length !== 0) {
        throw new Error("Notification retention verification failed; the transaction was aborted.");
      }
      repairedCount = changedInTransaction;
    });
  } finally {
    await session.endSession();
  }

  const verified = await readPlan(database, ttlIndexReady, new Date());
  if (verified.rows.length !== 0) {
    throw new Error("New notifications without valid expiry appeared after commit; rerun a dry run.");
  }
  return notificationRetentionReport(plan, "applied", repairedCount, verified.rows.length);
}
