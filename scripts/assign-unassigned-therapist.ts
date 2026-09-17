// Usage: node --env-file-if-exists=.env.local --import tsx scripts/assign-unassigned-therapist.ts --therapist-id=<exact-id>
// Apply only after reviewing the dry run: add --apply --expected-plan=<printed-hash>.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import type { Document } from "mongodb";
import type { CmsContentState } from "../src/domain/cms/types";
import { assignUnassignedTherapist, type AssignmentCandidate } from "./assign-unassigned-therapist-lib";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/node_modules/next/dist/compiled/server-only/empty.js`).href }
      : nextResolve(specifier, context);
  },
});

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--therapist-id=") && !arg.startsWith("--expected-plan="))) {
    throw new Error("Unknown argument. Use --therapist-id=<exact-id> and optional --apply --expected-plan=<hash>.");
  }
  if (process.env.CMS_MODE !== "mongodb") throw new Error("This migration requires CMS_MODE=mongodb.");
  const therapistId = args.find((arg) => arg.startsWith("--therapist-id="))?.slice("--therapist-id=".length) ?? "";
  if (!therapistId) throw new Error("An exact --therapist-id is required.");
  const apply = args.includes("--apply");
  const expectedPlan = args.find((arg) => arg.startsWith("--expected-plan="))?.slice("--expected-plan=".length);
  if (apply && !/^[a-f0-9]{64}$/.test(expectedPlan ?? "")) throw new Error("Apply requires a reviewed dry-run --expected-plan hash.");
  const [{ getMongoClient, getMongoDatabase }, { MongoCmsRepository }, { createCmsAuditEvent }] = await Promise.all([
    import("../src/server/cms/repositories/mongo-client"),
    import("../src/server/cms/repositories/mongo-repository"),
    import("../src/server/cms/audit"),
  ]);
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    const db = await getMongoDatabase();
    const bookings = db.collection<Document & { _id: string }>("cmsBookings");
    const result = await session.withTransaction(async () => {
      const repository = new MongoCmsRepository(session);
      return assignUnassignedTherapist({
        readContent: async () => {
          // Avoid getContent's automatic seed behavior: dry run must be read-only.
          const content = await db.collection("cmsContent").findOne({ _id: "siriranee-content" } as Document, {
            session, projection: { team: 1, bookingSettings: 1, "site.weeklyHours": 1 },
          });
          if (!content) throw new Error("Existing CMS content is required; nothing was seeded.");
          return content as unknown as CmsContentState;
        },
        listCandidates: async (now) => {
          const rows = await bookings.find({
            endsAt: { $gt: now },
            $and: [
              { $or: [{ assignedStaffId: "" }, { assignedStaffId: null }, { assignedStaffId: { $exists: false } }] },
              { $or: [{ status: "confirmed" }, { status: "pending", $or: [
                { capacityExpiresAt: "" }, { capacityExpiresAt: null }, { capacityExpiresAt: { $exists: false } }, { capacityExpiresAt: { $gt: now } },
              ] }] },
            ],
          }, { session, projection: {
            _id: 1, reference: 1, status: 1, serviceId: 1, durationMinutes: 1,
            localDate: 1, localTime: 1, startsAt: 1, endsAt: 1, version: 1,
            assignedStaffId: 1, capacityExpiresAt: 1,
          } }).limit(101).toArray();
          return rows.map(({ _id, ...row }) => ({ id: _id, ...row }) as AssignmentCandidate);
        },
        lockTherapist: (id) => repository.lockTherapist(id),
        lockBookingDate: (date) => repository.lockBookingDate(date),
        listBookingOccupancy: (from, to) => repository.listBookingOccupancy(from, to),
        listActiveHolds: (now) => repository.listActiveHolds(now),
        listClosures: (from, to) => repository.listClosures(from, to),
        assign: async (booking, therapist, now) => {
          const update = await bookings.updateOne({
            _id: booking.id, version: booking.version, status: booking.status,
            $or: [{ assignedStaffId: "" }, { assignedStaffId: null }, { assignedStaffId: { $exists: false } }],
          }, {
            $set: {
              assignedStaffId: therapist.id, assignedStaffName: therapist.name,
              lastChangeReason: "scheduling-correction", updatedAt: now,
              updatedBy: "system:owner-authorized-therapist-backfill",
            },
            $inc: { version: 1 },
          }, { session });
          return update.matchedCount === 1;
        },
        audit: async (booking, id) => {
          await repository.appendAudit(createCmsAuditEvent({
            actor: { id: "system:owner-authorized-therapist-backfill", displayName: "Owner-authorized therapist assignment" },
            action: "booking.therapist-backfilled", entityType: "booking", entityId: booking.id,
            summary: `Assigned ${booking.reference} to therapist ${id}; existing appointment and email records preserved; no email sent.`,
            requestId: `therapist-backfill:${booking.id}:${booking.version}`,
          }));
        },
      }, { therapistId, apply, expectedPlan });
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await session.endSession();
    await client.close();
  }
}

main().catch((error: unknown) => {
  // Do not dump connection strings, provider errors, documents or PII.
  console.error(error instanceof Error && !/mongodb(?:\+srv)?:\/\//i.test(error.message)
    ? error.message : "Therapist assignment failed; no partial batch was committed.");
  process.exitCode = 1;
});
