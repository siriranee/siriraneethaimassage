import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB?.trim() || "siriranee";

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  appName: "siriranee-cms-indexes",
  maxPoolSize: 2,
});

try {
  await client.connect();
  const db = client.db(dbName);

  await Promise.all([
    db.collection("cmsUsers").createIndex(
      { email: 1 },
      { name: "cms_users_email_unique", unique: true },
    ),
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
    db.collection("cmsMediaAssets").createIndex(
      { providerAssetId: 1 },
      {
        name: "cms_media_provider_asset_id_unique",
        unique: true,
        partialFilterExpression: { providerAssetId: { $type: "string" } },
      },
    ),
    db.collection("cmsMediaAssets").createIndex(
      { status: 1, expiresAt: 1 },
      { name: "cms_media_status_expiry" },
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
