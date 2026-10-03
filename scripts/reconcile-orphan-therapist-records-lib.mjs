import { createHash } from "node:crypto";

const maximumDeletionBatch = 100;

export class OrphanTherapistCleanupError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrphanTherapistCleanupError";
  }
}

function requiredId(value) {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new OrphanTherapistCleanupError(
      "Malformed therapist data was found. Nothing was deleted.",
    );
  }
  return value;
}

function sortedUniqueIds(values) {
  return [...new Set(values.map(requiredId))].sort();
}

function recordVersions(rows) {
  return rows
    .map((row) => ({
      id: requiredId(row._id),
      version: Number.isSafeInteger(row.version) ? row.version : null,
    }))
    .sort((first, second) => first.id.localeCompare(second.id));
}

function teamIdsFromContent(content) {
  if (
    !content ||
    !Number.isSafeInteger(content.revision) ||
    !Array.isArray(content.team)
  ) {
    throw new OrphanTherapistCleanupError(
      "Current CMS team data is missing or malformed. Nothing was deleted.",
    );
  }
  return sortedUniqueIds(content.team.map((member) => member?.id));
}

function hashPlan(scope) {
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

export function buildOrphanTherapistPlan({
  databaseName = "",
  content,
  contacts,
  locks,
  bookingTherapistIds,
  notificationTherapistIds,
}) {
  const teamIds = teamIdsFromContent(content);
  const contactRecords = recordVersions(contacts);
  const lockRecords = recordVersions(locks);
  const bookingReferences = sortedUniqueIds(bookingTherapistIds);
  const notificationReferences = sortedUniqueIds(notificationTherapistIds);
  const scope = {
    schemaVersion: 1,
    databaseName,
    contentRevision: content.revision,
    teamIds,
    contactRecords,
    lockRecords,
    bookingReferences,
    notificationReferences,
  };
  const teamSet = new Set(teamIds);
  const bookingSet = new Set(bookingReferences);
  const notificationSet = new Set(notificationReferences);
  const recordIds = sortedUniqueIds([
    ...contactRecords.map((record) => record.id),
    ...lockRecords.map((record) => record.id),
  ]);
  const orphanIds = recordIds.filter((id) => !teamSet.has(id));
  const eligibleIds = orphanIds.filter(
    (id) => !bookingSet.has(id) && !notificationSet.has(id),
  );
  const eligibleSet = new Set(eligibleIds);

  if (eligibleIds.length > maximumDeletionBatch) {
    throw new OrphanTherapistCleanupError(
      "More than 100 orphan therapist identities need cleanup. Review in smaller batches; nothing was deleted.",
    );
  }

  return {
    planHash: hashPlan(scope),
    contentRevision: scope.contentRevision,
    teamIds,
    orphanIds,
    eligibleIds,
    eligibleContactIds: contactRecords
      .map((record) => record.id)
      .filter((id) => eligibleSet.has(id)),
    eligibleLockIds: lockRecords
      .map((record) => record.id)
      .filter((id) => eligibleSet.has(id)),
    counts: {
      teamMembers: teamIds.length,
      contactRecords: contactRecords.length,
      lockRecords: lockRecords.length,
      orphanContacts: contactRecords.filter((record) => orphanIds.includes(record.id)).length,
      orphanLocks: lockRecords.filter((record) => orphanIds.includes(record.id)).length,
      protectedOrphanIdentities: orphanIds.length - eligibleIds.length,
      bookingReferencedOrphanIdentities: orphanIds.filter((id) => bookingSet.has(id)).length,
      notificationReferencedOrphanIdentities: orphanIds.filter((id) => notificationSet.has(id)).length,
      deletableContacts: contactRecords.filter((record) => eligibleSet.has(record.id)).length,
      deletableLocks: lockRecords.filter((record) => eligibleSet.has(record.id)).length,
    },
  };
}

async function readReferences(db, candidateIds, session) {
  if (!candidateIds.length) {
    return { bookingTherapistIds: [], notificationTherapistIds: [] };
  }
  const bookingRows = await db.collection("cmsBookings")
    .find(
      { assignedStaffId: { $in: candidateIds } },
      { session, projection: { assignedStaffId: 1 } },
    ).toArray();
  const notificationRows = await db.collection("cmsBookingNotifications")
    .find(
      { targetTeamMemberId: { $in: candidateIds } },
      { session, projection: { targetTeamMemberId: 1 } },
    ).toArray();
  const bookingTherapistIds = sortedUniqueIds(
    bookingRows.map((row) => row.assignedStaffId),
  );
  const notificationTherapistIds = sortedUniqueIds(
    notificationRows.map((row) => row.targetTeamMemberId),
  );
  return { bookingTherapistIds, notificationTherapistIds };
}

export async function inspectOrphanTherapistRecords(db, session) {
  if (typeof db.databaseName !== "string" || !db.databaseName.trim()) {
    throw new OrphanTherapistCleanupError(
      "MongoDB database identity is missing. Nothing was deleted.",
    );
  }
  // MongoDB does not support concurrent operations on one transaction session.
  const content = await db.collection("cmsContent").findOne(
    { _id: "siriranee-content" },
    { session, projection: { revision: 1, team: 1 } },
  );
  const teamIds = teamIdsFromContent(content);
  const contacts = await db.collection("cmsTherapistContacts")
    .find({}, { session, projection: { _id: 1, version: 1 } }).toArray();
  const locks = await db.collection("cmsTherapistLocks")
    .find({}, { session, projection: { _id: 1, version: 1 } }).toArray();
  const teamSet = new Set(teamIds);
  const orphanIds = sortedUniqueIds([
    ...contacts.map((record) => record._id),
    ...locks.map((record) => record._id),
  ]).filter((id) => !teamSet.has(id));
  const references = await readReferences(db, orphanIds, session);
  return buildOrphanTherapistPlan({
    databaseName: db.databaseName,
    content,
    contacts,
    locks,
    ...references,
  });
}

export function publicOrphanTherapistReport(plan, mode = "dry-run") {
  return { mode, ...plan.counts, planHash: plan.planHash };
}

async function verifyDeletionSafety(db, plan, session) {
  const content = await db.collection("cmsContent").findOne(
    { _id: "siriranee-content" },
    { session, projection: { revision: 1, team: 1 } },
  );
  const teamIds = teamIdsFromContent(content);
  if (
    content.revision !== plan.contentRevision ||
    teamIds.length !== plan.teamIds.length ||
    teamIds.some((id, index) => id !== plan.teamIds[index])
  ) {
    throw new OrphanTherapistCleanupError(
      "The CMS team changed during cleanup. Nothing was deleted; run a fresh dry run.",
    );
  }
  const references = await readReferences(db, plan.eligibleIds, session);
  if (references.bookingTherapistIds.length || references.notificationTherapistIds.length) {
    throw new OrphanTherapistCleanupError(
      "A booking or notification now references a cleanup candidate. Nothing was deleted; run a fresh dry run.",
    );
  }
}

export async function applyOrphanTherapistCleanup(db, client, expectedPlanHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedPlanHash ?? "")) {
    throw new OrphanTherapistCleanupError(
      "Apply requires the exact reviewed dry-run --expected-plan hash.",
    );
  }
  const session = client.startSession();
  let appliedPlan;
  try {
    await session.withTransaction(async () => {
      const plan = await inspectOrphanTherapistRecords(db, session);
      if (plan.planHash !== expectedPlanHash) {
        throw new OrphanTherapistCleanupError(
          "The cleanup plan changed. Nothing was deleted; run a fresh dry run.",
        );
      }
      appliedPlan = plan;
      if (!plan.eligibleIds.length) return;

      // Booking and team mutations use the same therapist lock records. Taking
      // the write locks before the second reference check serializes this
      // cleanup with application mutations for these identities.
      const locks = db.collection("cmsTherapistLocks");
      for (const id of plan.eligibleIds) {
        await locks.updateOne(
          { _id: id },
          {
            $inc: { version: 1 },
            $set: { updatedAt: new Date().toISOString() },
            $setOnInsert: { createdAt: new Date().toISOString() },
          },
          { session, upsert: true },
        );
      }

      await verifyDeletionSafety(db, plan, session);

      if (plan.eligibleContactIds.length) {
        const contactsDeleted = await db.collection("cmsTherapistContacts").deleteMany(
          { _id: { $in: plan.eligibleContactIds } }, { session },
        );
        if (contactsDeleted.deletedCount !== plan.eligibleContactIds.length) {
          throw new OrphanTherapistCleanupError(
            "Therapist contacts changed during cleanup. Nothing was deleted; run a fresh dry run.",
          );
        }
      }
      const locksDeleted = await locks.deleteMany(
        { _id: { $in: plan.eligibleIds } }, { session },
      );
      if (locksDeleted.deletedCount !== plan.eligibleIds.length) {
        throw new OrphanTherapistCleanupError(
          "Therapist locks changed during cleanup. Nothing was deleted; run a fresh dry run.",
        );
      }
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } finally {
    await session.endSession();
  }

  if (!appliedPlan) {
    throw new OrphanTherapistCleanupError(
      "Cleanup did not complete. No result was reported.",
    );
  }
  const remainingContacts = await db.collection("cmsTherapistContacts").countDocuments(
    { _id: { $in: appliedPlan.eligibleIds } },
  );
  const remainingLocks = await db.collection("cmsTherapistLocks").countDocuments(
    { _id: { $in: appliedPlan.eligibleIds } },
  );
  if (remainingContacts || remainingLocks) {
    throw new OrphanTherapistCleanupError(
      "Post-commit cleanup verification failed. Inspect the database before retrying.",
    );
  }
  return publicOrphanTherapistReport(
    appliedPlan,
    appliedPlan.eligibleIds.length ? "applied" : "already-clean",
  );
}
