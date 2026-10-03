// Read-only inspection:
//   npm run cms:backfill-notification-retention
// Apply only the exact reviewed state:
//   npm run cms:backfill-notification-retention -- --apply --expected-plan=<sha256>
import { MongoClient } from "mongodb";

import { runNotificationRetentionBackfill } from "./notification-retention-lib.mjs";

const argumentsList = process.argv.slice(2);
const apply = argumentsList.includes("--apply");
const expectedPlanArguments = argumentsList.filter((argument) => argument.startsWith("--expected-plan="));
if (
  argumentsList.some((argument) => argument !== "--apply" && !argument.startsWith("--expected-plan=")) ||
  argumentsList.filter((argument) => argument === "--apply").length > 1 ||
  expectedPlanArguments.length > 1 ||
  (expectedPlanArguments.length > 0 && !apply)
) {
  throw new Error("Usage: npm run cms:backfill-notification-retention -- [--apply --expected-plan=<reviewed-sha256>]");
}

const uri = process.env.MONGODB_URI?.trim();
const databaseName = process.env.MONGODB_DB?.trim() || "siriranee";
if (!uri) throw new Error("MONGODB_URI is required.");

const client = new MongoClient(uri, {
  appName: "siriranee-notification-retention-backfill",
  connectTimeoutMS: 10_000,
  serverSelectionTimeoutMS: 10_000,
  maxPoolSize: 2,
});

try {
  await client.connect();
  const report = await runNotificationRetentionBackfill(client.db(databaseName), {
    client,
    apply,
    expectedPlan: expectedPlanArguments[0]?.slice("--expected-plan=".length) ?? "",
  });
  console.log(JSON.stringify(report, null, 2));
  if (!apply && report.totalToRepair > 0) {
    console.log(`Review the counts, then run npm run cms:backfill-notification-retention -- --apply --expected-plan=${report.planHash}`);
  }
  if (!report.ttlIndexReady) {
    console.warn("The notification TTL index is missing or incompatible; expiry dates will not be automatically removed until it is repaired.");
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
