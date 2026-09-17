// Usage: node --env-file-if-exists=.env.local --import tsx scripts/assign-all-current-bookings-therapist.ts --therapist-id=<exact-id>
// Apply only after reviewing the dry run: add --apply --expected-plan=<printed-hash>.
import { createHash, randomUUID } from "node:crypto";

import type { ClientSession, Db, Document } from "mongodb";
import { MongoClient } from "mongodb";

import { getCmsAuditExpiryDate } from "../src/server/cms/audit-retention";

const maximumBookingCount = 100;
const actorId = "system:owner-authorized-all-booking-assignment";
const actorName = "Owner-authorized all-booking assignment";

type BookingCandidate = {
  readonly id: string;
  readonly reference: string;
  readonly status: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly version: number;
  readonly assignedStaffId: string;
  readonly assignedStaffName: string;
};

type AssignmentPlan = {
  readonly database: string;
  readonly therapist: { readonly id: string; readonly name: string };
  readonly totalBookings: number;
  readonly candidates: readonly BookingCandidate[];
  readonly planHash: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function planHash(input: Omit<AssignmentPlan, "planHash">) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function readPlan(
  db: Db,
  therapistId: string,
  session?: ClientSession,
): Promise<AssignmentPlan> {
  const content = await db.collection<Document & { _id: string }>("cmsContent").findOne(
    { _id: "siriranee-content" },
    { session, projection: { team: 1 } },
  );
  if (!content || !Array.isArray(content.team)) {
    throw new Error("Existing CMS team data is required; nothing was seeded.");
  }

  const therapist = content.team.find(
    (member: Document) => member.id === therapistId,
  ) as Document | undefined;
  if (
    !therapist ||
    therapist.archived === true ||
    therapist.operationalActive !== true ||
    !stringValue(therapist.name).trim()
  ) {
    throw new Error("The selected therapist is not active.");
  }

  const target = {
    id: therapistId,
    name: stringValue(therapist.name).trim(),
  };
  const bookings = db.collection<Document & { _id: string }>("cmsBookings");
  const [totalBookings, rows] = await Promise.all([
    bookings.countDocuments({}, { session }),
    bookings
      .find(
        {
          $or: [
            { assignedStaffId: { $ne: target.id } },
            { assignedStaffName: { $ne: target.name } },
          ],
        },
        {
          session,
          projection: {
            _id: 1,
            reference: 1,
            status: 1,
            localDate: 1,
            localTime: 1,
            version: 1,
            assignedStaffId: 1,
            assignedStaffName: 1,
          },
        },
      )
      .sort({ _id: 1 })
      .limit(maximumBookingCount + 1)
      .toArray(),
  ]);

  if (rows.length > maximumBookingCount) {
    throw new Error(
      `More than ${maximumBookingCount} bookings require changes; stop for a separately reviewed migration.`,
    );
  }

  const candidates = rows.map((row) => {
    const version = integerValue(row.version);
    if (version < 1) {
      throw new Error(`Booking ${String(row._id)} has an invalid version.`);
    }
    return {
      id: String(row._id),
      reference: stringValue(row.reference) || String(row._id),
      status: stringValue(row.status),
      localDate: stringValue(row.localDate),
      localTime: stringValue(row.localTime),
      version,
      assignedStaffId: stringValue(row.assignedStaffId),
      assignedStaffName: stringValue(row.assignedStaffName),
    };
  });
  const hashInput = {
    database: db.databaseName,
    therapist: target,
    totalBookings,
    candidates,
  };

  return { ...hashInput, planHash: planHash(hashInput) };
}

function output(plan: AssignmentPlan, applied: boolean) {
  return {
    mode: applied ? "applied" : "dry-run",
    database: plan.database,
    therapistId: plan.therapist.id,
    therapistName: plan.therapist.name,
    planHash: plan.planHash,
    totalBookings: plan.totalBookings,
    changedBookings: plan.candidates.length,
    alreadyAssignedBookings:
      plan.totalBookings - plan.candidates.length,
    bookings: plan.candidates.map(
      ({ reference, status, localDate, localTime, version }) => ({
        reference,
        status,
        localDate,
        localTime,
        previousVersion: version,
        ...(applied ? { updatedVersion: version + 1 } : {}),
      }),
    ),
    emailsSent: 0,
    emailRecordsChanged: 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) =>
        arg !== "--apply" &&
        !arg.startsWith("--therapist-id=") &&
        !arg.startsWith("--expected-plan="),
    )
  ) {
    throw new Error(
      "Unknown argument. Use --therapist-id=<exact-id> and optional --apply --expected-plan=<hash>.",
    );
  }
  if (process.env.CMS_MODE !== "mongodb") {
    throw new Error("This migration requires CMS_MODE=mongodb.");
  }

  const therapistId =
    args
      .find((arg) => arg.startsWith("--therapist-id="))
      ?.slice("--therapist-id=".length) ?? "";
  const apply = args.includes("--apply");
  const expectedPlan = args
    .find((arg) => arg.startsWith("--expected-plan="))
    ?.slice("--expected-plan=".length);
  if (!therapistId) throw new Error("An exact --therapist-id is required.");
  if (apply && !/^[a-f0-9]{64}$/.test(expectedPlan ?? "")) {
    throw new Error(
      "Apply requires a reviewed dry-run --expected-plan hash.",
    );
  }

  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB;
  if (!uri || !databaseName) {
    throw new Error("MongoDB configuration is incomplete.");
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(databaseName);
    if (!apply) {
      console.log(JSON.stringify(output(await readPlan(db, therapistId), false), null, 2));
      return;
    }

    const session = client.startSession();
    try {
      let appliedPlan: AssignmentPlan | undefined;
      await session.withTransaction(async () => {
        const plan = await readPlan(db, therapistId, session);
        if (plan.planHash !== expectedPlan) {
          throw new Error(
            "The assignment plan changed. No bookings were changed; review a fresh dry run.",
          );
        }

        const changedAt = new Date().toISOString();
        for (const booking of plan.candidates) {
          const update = await db
            .collection<Document & { _id: string }>("cmsBookings")
            .updateOne(
            { _id: booking.id, version: booking.version },
            {
              $set: {
                assignedStaffId: plan.therapist.id,
                assignedStaffName: plan.therapist.name,
                lastChangeReason: "scheduling-correction",
                updatedAt: changedAt,
                updatedBy: actorId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
          if (update.matchedCount !== 1 || update.modifiedCount !== 1) {
            throw new Error(
              `Booking ${booking.reference} changed concurrently. No bookings were changed.`,
            );
          }

          const auditId = randomUUID();
          await db
            .collection<Document & { _id: string }>("cmsAuditEvents")
            .insertOne(
            {
              _id: auditId,
              actorId,
              actorName,
              action: "booking.therapist-backfilled",
              entityType: "booking",
              entityId: booking.id,
              summary: `Assigned ${booking.reference} to therapist ${plan.therapist.id} through the owner-authorized all-booking backfill; existing email records were preserved and no email was sent.`,
              requestId: `all-booking-assignment:${booking.id}:${booking.version}`,
              createdAt: changedAt,
              expiresAtDate: getCmsAuditExpiryDate(changedAt),
            },
            { session },
          );
        }
        appliedPlan = plan;
      });

      if (!appliedPlan) throw new Error("The assignment transaction did not complete.");
      console.log(JSON.stringify(output(appliedPlan, true), null, 2));
    } finally {
      await session.endSession();
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error && !/mongodb(?:\+srv)?:\/\//i.test(error.message)
      ? error.message
      : "Therapist assignment failed; no partial batch was committed.",
  );
  process.exitCode = 1;
});
