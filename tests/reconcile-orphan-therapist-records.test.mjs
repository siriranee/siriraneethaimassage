import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOrphanTherapistCleanup,
  buildOrphanTherapistPlan,
  inspectOrphanTherapistRecords,
  publicOrphanTherapistReport,
} from "../scripts/reconcile-orphan-therapist-records-lib.mjs";

function fixture() {
  const collections = {
    cmsContent: [{
      _id: "siriranee-content",
      revision: 7,
      team: [{ id: "current-therapist" }],
    }],
    cmsTherapistContacts: [
      { _id: "current-therapist", version: 1 },
      { _id: "free-orphan", version: 2 },
      { _id: "booked-orphan", version: 1 },
    ],
    cmsTherapistLocks: [
      { _id: "current-therapist", version: 8 },
      { _id: "free-orphan", version: 1 },
      { _id: "notified-orphan", version: 1 },
    ],
    cmsBookings: [{ _id: "historic-booking", assignedStaffId: "booked-orphan" }],
    cmsBookingNotifications: [{ _id: "queued-email", targetTeamMemberId: "notified-orphan" }],
  };
  let stored = structuredClone(collections);
  const writes = [];
  let afterLock = () => {};

  function records(name, session) {
    return (session?.working ?? stored)[name] ?? [];
  }
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === "object" && "$in" in value) {
        return value.$in.includes(row[key]);
      }
      return row[key] === value;
    });
  }
  const db = {
    databaseName: "test-siriranee",
    collection(name) {
      return {
        async findOne(filter, options = {}) {
          return structuredClone(records(name, options.session).find((row) => matches(row, filter)) ?? null);
        },
        find(filter, options = {}) {
          return {
            async toArray() {
              return structuredClone(records(name, options.session).filter((row) => matches(row, filter)));
            },
          };
        },
        async updateOne(filter, update, options = {}) {
          assert.equal(name, "cmsTherapistLocks");
          const rows = records(name, options.session);
          let row = rows.find((candidate) => matches(candidate, filter));
          if (!row) {
            assert.equal(options.upsert, true);
            row = { ...filter, ...update.$setOnInsert };
            rows.push(row);
          }
          for (const [key, value] of Object.entries(update.$inc ?? {})) {
            row[key] = (row[key] ?? 0) + value;
          }
          Object.assign(row, update.$set ?? {});
          writes.push({ operation: "lock" });
          afterLock(options.session);
          return { matchedCount: 1 };
        },
        async deleteMany(filter, options = {}) {
          const rows = records(name, options.session);
          const retained = rows.filter((row) => !matches(row, filter));
          const deletedCount = rows.length - retained.length;
          (options.session?.working ?? stored)[name] = retained;
          writes.push({ operation: "delete", collection: name, deletedCount });
          return { deletedCount };
        },
        async countDocuments(filter, options = {}) {
          return records(name, options.session).filter((row) => matches(row, filter)).length;
        },
      };
    },
  };
  const client = {
    startSession() {
      const session = {
        working: undefined,
        async withTransaction(work) {
          this.working = structuredClone(stored);
          try {
            const result = await work();
            stored = this.working;
            return result;
          } finally {
            this.working = undefined;
          }
        },
        async endSession() {},
      };
      return session;
    },
  };
  return {
    db,
    client,
    writes,
    snapshot: () => structuredClone(stored),
    mutate: (change) => change(stored),
    onLock: (callback) => { afterLock = callback; },
  };
}

test("dry run reports counts and hash only, preserving active and referenced records", async () => {
  const f = fixture();
  const before = f.snapshot();
  const plan = await inspectOrphanTherapistRecords(f.db);
  const report = publicOrphanTherapistReport(plan);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(plan.eligibleIds, ["free-orphan"]);
  assert.equal(report.deletableContacts, 1);
  assert.equal(report.deletableLocks, 1);
  assert.equal(report.protectedOrphanIdentities, 2);
  assert.equal(report.bookingReferencedOrphanIdentities, 1);
  assert.equal(report.notificationReferencedOrphanIdentities, 1);
  assert.match(report.planHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(report), /current-therapist|free-orphan|booked-orphan|notified-orphan/);
});

test("apply requires the exact plan and deletes only unreferenced orphan records", async () => {
  const f = fixture();
  const plan = await inspectOrphanTherapistRecords(f.db);
  await assert.rejects(
    applyOrphanTherapistCleanup(f.db, f.client, "0".repeat(64)),
    /plan changed/,
  );
  assert.deepEqual(f.writes, []);

  const report = await applyOrphanTherapistCleanup(f.db, f.client, plan.planHash);
  assert.equal(report.mode, "applied");
  assert.deepEqual(f.snapshot().cmsTherapistContacts.map((row) => row._id),
    ["current-therapist", "booked-orphan"]);
  assert.deepEqual(f.snapshot().cmsTherapistLocks.map((row) => row._id),
    ["current-therapist", "notified-orphan"]);
  assert.equal(f.snapshot().cmsBookings.length, 1);
  assert.equal(f.snapshot().cmsBookingNotifications.length, 1);
  const after = await inspectOrphanTherapistRecords(f.db);
  assert.equal(after.counts.deletableContacts, 0);
  assert.equal(after.counts.deletableLocks, 0);
  assert.equal((await applyOrphanTherapistCleanup(f.db, f.client, after.planHash)).mode, "already-clean");
});

test("a new booking reference invalidates an earlier reviewed plan", async () => {
  const f = fixture();
  const plan = await inspectOrphanTherapistRecords(f.db);
  f.mutate((rows) => rows.cmsBookings.push({ _id: "new-booking", assignedStaffId: "free-orphan" }));
  const before = f.snapshot();
  await assert.rejects(
    applyOrphanTherapistCleanup(f.db, f.client, plan.planHash),
    /plan changed/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.writes, []);
});

test("a reference found after locking aborts the whole cleanup transaction", async () => {
  const f = fixture();
  const plan = await inspectOrphanTherapistRecords(f.db);
  const before = f.snapshot();
  f.onLock((session) => {
    session.working.cmsBookingNotifications.push({
      _id: "concurrent-email", targetTeamMemberId: "free-orphan",
    });
  });
  await assert.rejects(
    applyOrphanTherapistCleanup(f.db, f.client, plan.planHash),
    /booking or notification now references/,
  );
  assert.deepEqual(f.snapshot(), before);
});

test("a therapist restored to the current team after locking aborts cleanup", async () => {
  const f = fixture();
  const plan = await inspectOrphanTherapistRecords(f.db);
  const before = f.snapshot();
  f.onLock((session) => {
    session.working.cmsContent[0].revision += 1;
    session.working.cmsContent[0].team.push({ id: "free-orphan" });
  });
  await assert.rejects(
    applyOrphanTherapistCleanup(f.db, f.client, plan.planHash),
    /CMS team changed/,
  );
  assert.deepEqual(f.snapshot(), before);
});

test("missing or malformed current team fails closed", async () => {
  const f = fixture();
  f.mutate((rows) => { rows.cmsContent = []; });
  await assert.rejects(inspectOrphanTherapistRecords(f.db), /team data is missing/);
  assert.deepEqual(f.writes, []);
  assert.throws(() => buildOrphanTherapistPlan({
    content: { revision: 1, team: [{ id: "" }] },
    contacts: [], locks: [], bookingTherapistIds: [], notificationTherapistIds: [],
  }), /Malformed therapist data/);
});
