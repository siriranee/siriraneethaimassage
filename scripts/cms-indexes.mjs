import { MongoClient } from "mongodb";

const auditRetentionDays = 365;
const notificationRetentionDays = 365;
const bookingRetentionDays = 2 * 365;
const dayLockRetentionDays = 30;
const publicationRetentionCount = 50;

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB?.trim() || "siriranee";

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  appName: "siriranee-cms-indexes",
  connectTimeoutMS: 10_000,
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 10_000,
});

try {
  await client.connect();
  console.log("Connected to MongoDB; applying CMS retention policy.");
  const db = client.db(dbName);
  const users = db.collection("cmsUsers");
  const audit = db.collection("cmsAuditEvents");
  const bookings = db.collection("cmsBookings");
  const notifications = db.collection("cmsBookingNotifications");
  const dayLocks = db.collection("cmsBookingDayLocks");
  const publications = db.collection("cmsPublications");
  const metadata = db.collection("cmsMeta");
  const usersCollectionExists = await db
    .listCollections({ name: "cmsUsers" }, { nameOnly: true })
    .hasNext();
  const userIndexes = usersCollectionExists ? await users.indexes() : [];
  const obsoleteEmailIndex = userIndexes.find(
    (index) =>
      index.name === "cms_users_email_unique" &&
      index.unique === true &&
      !index.partialFilterExpression,
  );

  await users.createIndex(
    { username: 1 },
    {
      name: "cms_users_username_unique",
      unique: true,
      partialFilterExpression: { username: { $type: "string" } },
    },
  );

  if (obsoleteEmailIndex?.name) {
    await users.dropIndex(obsoleteEmailIndex.name);
    console.log("Removed obsolete CMS email login index.");
  }

  const auditBackfill = await audit.updateMany(
    {
      $expr: {
        $ne: [{ $type: "$expiresAtDate" }, "date"],
      },
    },
    [
      {
        $set: {
          expiresAtDate: {
            $dateAdd: {
              startDate: {
                $let: {
                  vars: {
                    parsedCreatedAt: {
                      $convert: {
                        input: "$createdAt",
                        to: "date",
                        onError: null,
                        onNull: null,
                      },
                    },
                  },
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$$parsedCreatedAt", null] },
                          { $lte: ["$$parsedCreatedAt", "$$NOW"] },
                        ],
                      },
                      "$$parsedCreatedAt",
                      "$$NOW",
                    ],
                  },
                },
              },
              unit: "day",
              amount: auditRetentionDays,
            },
          },
        },
      },
    ],
  );

  if (auditBackfill.modifiedCount) {
    console.log(
      `Added one-year retention dates to ${auditBackfill.modifiedCount} CMS audit event${auditBackfill.modifiedCount === 1 ? "" : "s"}.`,
    );
  }

  const notificationBackfill = await notifications.updateMany(
    { expiresAtDate: { $not: { $type: "date" } } },
    [
      {
        $set: {
          expiresAtDate: {
            $dateAdd: {
              startDate: {
                $convert: {
                  input: "$createdAt",
                  to: "date",
                  onError: "$$NOW",
                  onNull: "$$NOW",
                },
              },
              unit: "day",
              amount: notificationRetentionDays,
            },
          },
        },
      },
    ],
  );

  const bookingBackfill = await bookings.updateMany(
    { retentionExpiresAtDate: { $not: { $type: "date" } } },
    [
      {
        $set: {
          retentionExpiresAtDate: {
            $dateAdd: {
              startDate: {
                $convert: {
                  input: "$startsAt",
                  to: "date",
                  onError: "$$NOW",
                  onNull: "$$NOW",
                },
              },
              unit: "day",
              amount: bookingRetentionDays,
            },
          },
        },
      },
    ],
  );

  const dayLockBackfill = await dayLocks.updateMany(
    { expiresAtDate: { $not: { $type: "date" } } },
    [
      {
        $set: {
          expiresAtDate: {
            $dateAdd: {
              startDate: {
                $convert: {
                  input: { $concat: ["$_id", "T00:00:00.000Z"] },
                  to: "date",
                  onError: "$$NOW",
                  onNull: "$$NOW",
                },
              },
              unit: "day",
              amount: dayLockRetentionDays,
            },
          },
        },
      },
    ],
  );

  if (notificationBackfill.modifiedCount) {
    console.log(`Added retention dates to ${notificationBackfill.modifiedCount} booking notification record(s).`);
  }
  if (bookingBackfill.modifiedCount) {
    console.log(`Added retention dates to ${bookingBackfill.modifiedCount} booking record(s).`);
  }
  if (dayLockBackfill.modifiedCount) {
    console.log(`Added retention dates to ${dayLockBackfill.modifiedCount} booking day lock(s).`);
  }

  const currentPublication = await metadata.findOne(
    { _id: "current-publication" },
    { projection: { publicationId: 1 } },
  );
  const newestPublications = await publications
    .find({}, { projection: { _id: 1 } })
    .sort({ publishedAt: -1, _id: -1 })
    .limit(publicationRetentionCount)
    .toArray();
  const retainedPublicationIds = newestPublications.map((item) => item._id);
  if (
    currentPublication?.publicationId &&
    !retainedPublicationIds.some(
      (id) => String(id) === String(currentPublication.publicationId),
    )
  ) {
    retainedPublicationIds.splice(
      Math.max(0, publicationRetentionCount - 1),
      1,
      currentPublication.publicationId,
    );
  }
  const publicationCleanup = retainedPublicationIds.length
    ? await publications.deleteMany({ _id: { $nin: retainedPublicationIds } })
    : { deletedCount: 0 };
  if (publicationCleanup.deletedCount) {
    console.log(`Removed ${publicationCleanup.deletedCount} old publication revision(s).`);
  }

  await Promise.all([
    db.collection("cmsSessions").createIndex(
      { tokenHash: 1 },
      { name: "cms_sessions_token_unique", unique: true },
    ),
    db.collection("cmsSessions").createIndex(
      { userId: 1 },
      { name: "cms_sessions_user_id" },
    ),
    db.collection("cmsSessions").createIndex(
      { expiresAtDate: 1 },
      {
        name: "cms_sessions_expiry_ttl",
        expireAfterSeconds: 0,
      },
    ),
    db.collection("cmsLoginAttempts").createIndex(
      { expiresAtDate: 1 },
      {
        name: "cms_login_attempts_expiry_ttl",
        expireAfterSeconds: 0,
      },
    ),
    db.collection("cmsAuditEvents").createIndex(
      { createdAt: -1 },
      { name: "cms_audit_created_at" },
    ),
    db.collection("cmsAuditEvents").createIndex(
      { expiresAtDate: 1 },
      { name: "cms_audit_expiry_ttl", expireAfterSeconds: 0 },
    ),
    db.collection("cmsBookings").createIndex(
      { reference: 1 },
      { name: "cms_bookings_reference_unique", unique: true },
    ),
    db.collection("cmsBookings").createIndex(
      { idempotencyKeyHash: 1 },
      {
        name: "cms_bookings_idempotency_unique",
        unique: true,
        partialFilterExpression: { idempotencyKeyHash: { $type: "string" } },
      },
    ),
    db.collection("cmsBookings").createIndex(
      { localDate: 1, status: 1 },
      { name: "cms_bookings_local_date_status" },
    ),
    db.collection("cmsBookings").createIndex(
      { startsAt: 1 },
      { name: "cms_bookings_starts_at" },
    ),
    db.collection("cmsBookings").createIndex(
      { localDate: 1, status: 1, startsAt: 1 },
      { name: "cms_bookings_date_status_start" },
    ),
    db.collection("cmsBookings").createIndex(
      { assignedStaffId: 1, startsAt: 1 },
      { name: "cms_bookings_staff_starts_at" },
    ),
    db.collection("cmsBookings").createIndex(
      { retentionExpiresAtDate: 1 },
      { name: "cms_bookings_retention_ttl", expireAfterSeconds: 0 },
    ),
    db.collection("cmsBookingHolds").createIndex(
      { tokenHash: 1 },
      { name: "cms_holds_token_unique", unique: true },
    ),
    db.collection("cmsBookingHolds").createIndex(
      { expiresAtDate: 1 },
      { name: "cms_holds_expiry_ttl", expireAfterSeconds: 0 },
    ),
    db.collection("cmsBookingHolds").createIndex(
      { status: 1, expiresAt: 1 },
      { name: "cms_holds_status_expiry" },
    ),
    db.collection("cmsClosures").createIndex(
      { localDate: 1, active: 1 },
      { name: "cms_closures_local_date" },
    ),
    db.collection("cmsBookingNotifications").createIndex(
      { bookingId: 1, createdAt: -1 },
      { name: "cms_notifications_booking_created" },
    ),
    db.collection("cmsBookingNotifications").createIndex(
      { status: 1, createdAt: 1 },
      { name: "cms_notifications_status_created" },
    ),
    db.collection("cmsBookingNotifications").createIndex(
      { channel: 1, createdAt: -1 },
      { name: "cms_notifications_channel_created" },
    ),
    db.collection("cmsBookingNotifications").createIndex(
      { expiresAtDate: 1 },
      { name: "cms_notifications_retention_ttl", expireAfterSeconds: 0 },
    ),
    db.collection("cmsBookingDayLocks").createIndex(
      { expiresAtDate: 1 },
      { name: "cms_day_locks_retention_ttl", expireAfterSeconds: 0 },
    ),
    db.collection("cmsPublications").createIndex(
      { publishedAt: -1 },
      { name: "cms_publications_published_at" },
    ),
    db.collection("cmsMediaAssets").createIndex(
      { providerAssetId: 1 },
      {
        name: "cms_media_provider_asset_id_unique",
        unique: true,
        partialFilterExpression: { providerAssetId: { $type: "string" } },
      },
    ),
    db.collection("cmsMediaAssets").createIndex(
      { secureUrl: 1 },
      { name: "cms_media_secure_url" },
    ),
    db.collection("cmsMediaAssets").createIndex(
      { ownerUserId: 1, submissionId: 1, status: 1 },
      { name: "cms_media_owner_submission_status" },
    ),
  ]);

  await db.command({ ping: 1 });
  console.log(`CMS indexes verified for database: ${dbName}`);
} finally {
  await client.close();
}
