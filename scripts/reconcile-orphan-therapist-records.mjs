// Dry run: node --env-file-if-exists=.env.local scripts/reconcile-orphan-therapist-records.mjs
// Apply only after reviewing the counts: add --apply --expected-plan=<printed-hash>.
import { MongoClient } from "mongodb";

import {
  applyOrphanTherapistCleanup,
  inspectOrphanTherapistRecords,
  OrphanTherapistCleanupError,
  publicOrphanTherapistReport,
} from "./reconcile-orphan-therapist-records-lib.mjs";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const expectedPlanArgs = args.filter((arg) => arg.startsWith("--expected-plan="));
  if (
    (apply && (args.length !== 2 || expectedPlanArgs.length !== 1)) ||
    (!apply && args.length !== 0)
  ) {
    throw new OrphanTherapistCleanupError(
      "Run without arguments for a dry run, or use --apply --expected-plan=<printed-hash>.",
    );
  }
  if (process.env.CMS_MODE !== "mongodb") {
    throw new OrphanTherapistCleanupError("This command requires CMS_MODE=mongodb.");
  }
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DB?.trim();
  if (!uri || !databaseName) {
    throw new OrphanTherapistCleanupError(
      "MongoDB configuration is incomplete.",
    );
  }

  const client = new MongoClient(uri, {
    appName: "siriranee-orphan-therapist-reconciliation",
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 2,
  });
  try {
    await client.connect();
    const db = client.db(databaseName);
    const report = apply
      ? await applyOrphanTherapistCleanup(
        db,
        client,
        expectedPlanArgs[0].slice("--expected-plan=".length),
      )
      : publicOrphanTherapistReport(await inspectOrphanTherapistRecords(db));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  // Driver errors may contain connection details. Never print raw documents,
  // therapist identifiers, contact addresses or the MongoDB URI.
  console.error(error instanceof OrphanTherapistCleanupError
    ? error.message
    : "Orphan therapist reconciliation failed. Inspect the database before retrying.");
  process.exitCode = 1;
});
