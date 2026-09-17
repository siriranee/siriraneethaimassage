import { MongoClient } from "mongodb";

import { applyBookingLaunchIndexes } from "./booking-launch-indexes-lib.mjs";

const argumentsList = process.argv.slice(2);
if (argumentsList.some((argument) => argument !== "--apply")) {
  throw new Error("Usage: node --env-file-if-exists=.env.local scripts/booking-launch-indexes.mjs [--apply]");
}
const apply = argumentsList.includes("--apply");
const uri = process.env.MONGODB_URI?.trim();
const databaseName = process.env.MONGODB_DB?.trim() || "siriranee";
if (!uri) throw new Error("MONGODB_URI is required.");

const client = new MongoClient(uri, {
  appName: "siriranee-booking-launch-indexes",
  connectTimeoutMS: 10_000,
  serverSelectionTimeoutMS: 10_000,
  maxPoolSize: 2,
});
try {
  await client.connect();
  const plan = await applyBookingLaunchIndexes(client.db(databaseName), { apply });
  console.log(`${apply ? "Verified" : "Dry run for"} booking launch indexes in database: ${databaseName}`);
  for (const index of plan) {
    console.log(`${index.action}: ${index.collection}/${index.options.name}${index.existingName && index.existingName !== index.options.name ? ` (existing equivalent: ${index.existingName})` : ""}`);
  }
  console.log(apply
    ? "Only missing booking/email tracking indexes were created. No documents were rewritten or explicitly deleted."
    : "No changes made. Pass --apply to create missing indexes; incompatible existing indexes are never replaced.");
  console.log("Delivery-event expiry uses the existing expiresAtDate value (30 days after receipt); MongoDB removes expired event metadata automatically.");
  if (plan.some((index) => index.action === "conflict")) process.exitCode = 1;
} finally {
  await client.close();
}
