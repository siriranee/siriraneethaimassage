import assert from "node:assert/strict";
import test from "node:test";

import { assignUnassignedTherapist, isAssignmentCandidate, type AssignmentCandidate, type AssignmentRepository } from "../scripts/assign-unassigned-therapist-lib";
import type { CmsBookingOccupancy, CmsContentState } from "../src/domain/cms/types";

const now = "2099-01-01T10:00:00.000Z";
const therapistId = "siriranee-test-id";

function candidate(id: string, overrides: Partial<AssignmentCandidate> = {}): AssignmentCandidate {
  return {
    id, reference: `SRN-TEST-${id}`, status: "confirmed", serviceId: "treatment", durationMinutes: 60,
    localDate: "2099-01-10", localTime: "11:00", startsAt: "2099-01-10T11:00:00.000Z", endsAt: "2099-01-10T12:00:00.000Z",
    version: 3, assignedStaffId: "", capacityExpiresAt: "", ...overrides,
  };
}

function setup(initial = [candidate("one")]) {
  const content = {
    team: [{ id: therapistId, name: "Siriranee", operationalActive: true, archived: false, serviceIds: ["treatment"] }],
    bookingSettings: {
      timezone: "Europe/Dublin", slotIntervalMinutes: 30, bookingHorizonDays: 365,
      bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 120, maxConcurrentBookings: 2,
    },
    site: { weeklyHours: Array.from({ length: 7 }, () => ({ open: true, opens: "09:00", closes: "19:00" })) },
  } as unknown as CmsContentState;
  let stored = initial.map((booking) => ({ ...booking, internalNotes: "Keep me", customerEncrypted: "unchanged-ciphertext", assignedStaffName: "", emailMetadata: "untouched" }));
  let auditRows: string[] = [];
  const operations: string[] = [];
  const repository: AssignmentRepository = {
    readContent: async () => content,
    listCandidates: async () => stored.map(({ id, reference, status, serviceId, durationMinutes, localDate, localTime, startsAt, endsAt, version, assignedStaffId, capacityExpiresAt }) => ({ id, reference, status, serviceId, durationMinutes, localDate, localTime, startsAt, endsAt, version, assignedStaffId, capacityExpiresAt })),
    lockTherapist: async (id) => { operations.push(`therapist:${id}`); },
    lockBookingDate: async (date) => { operations.push(`date:${date}`); },
    listBookingOccupancy: async (from) => stored.filter((booking) => booking.localDate === from).map((booking) => ({
      id: booking.id, startsAt: booking.startsAt, endsAt: booking.endsAt, localDate: booking.localDate, status: booking.status,
      assignedStaffId: booking.assignedStaffId ?? "", expiresAt: booking.capacityExpiresAt ?? "",
    })),
    listActiveHolds: async () => [],
    listClosures: async () => [],
    assign: async (booking, therapist) => {
      operations.push(`assign:${booking.id}`);
      const index = stored.findIndex((row) => row.id === booking.id && row.version === booking.version && !row.assignedStaffId);
      if (index < 0) return false;
      stored[index] = { ...stored[index], assignedStaffId: therapist.id, assignedStaffName: therapist.name, version: booking.version + 1 };
      return true;
    },
    audit: async (booking) => { auditRows.push(booking.id); },
  };
  return {
    repository, content, operations, records: () => stored, audits: () => auditRows,
    run: async (options: Parameters<typeof assignUnassignedTherapist>[1]) => {
      const previousRecords = structuredClone(stored);
      const previousAudits = [...auditRows];
      try { return await assignUnassignedTherapist(repository, { now, ...options }); }
      catch (error) { stored = previousRecords; auditRows = previousAudits; throw error; }
    },
  };
}

test("assignment dry run is read-only, PII-free and limited to active future unassigned bookings", async () => {
  const fixture = setup([
    candidate("one"), candidate("cancelled", { status: "cancelled" }),
    candidate("past", { endsAt: "2098-01-01T10:00:00.000Z" }),
    candidate("assigned", { assignedStaffId: "another-therapist" }),
    candidate("expired", { status: "pending", capacityExpiresAt: "2098-01-01T10:00:00.000Z" }),
  ]);
  // Irrelevant fixture rows deliberately overlap; only the active assigned row
  // should occupy capacity, which remains available for the one candidate.
  const result = await fixture.run({ therapistId });
  assert.equal(result.count, 1);
  assert.deepEqual(result.bookings.map((booking) => booking.reference), ["SRN-TEST-one"]);
  assert.deepEqual(fixture.operations, []);
  assert.deepEqual(fixture.audits(), []);
  assert.doesNotMatch(JSON.stringify(result), /ciphertext|internalNotes|emailMetadata/);
  assert.equal(result.emailsSent, 0);
});

test("missing and null assignment qualify, while expired pending and terminal bookings do not", () => {
  assert.equal(isAssignmentCandidate(candidate("a", { assignedStaffId: null }), now), true);
  assert.equal(isAssignmentCandidate(candidate("a", { assignedStaffId: undefined }), now), true);
  assert.equal(isAssignmentCandidate(candidate("a", { status: "pending", capacityExpiresAt: now }), now), false);
  assert.equal(isAssignmentCandidate(candidate("a", { status: "completed" }), now), false);
});

test("apply requires a matching reviewed plan; successful assignment preserves notes and email metadata", async () => {
  const fixture = setup();
  const plan = await fixture.run({ therapistId });
  await assert.rejects(fixture.run({ therapistId, apply: true }), /expected-plan/);
  await assert.rejects(fixture.run({ therapistId, apply: true, expectedPlan: "0".repeat(64) }), /plan changed/);
  const result = await fixture.run({ therapistId, apply: true, expectedPlan: plan.planHash });
  assert.equal(result.count, 1);
  assert.deepEqual(fixture.operations.slice(-3), [`therapist:${therapistId}`, "date:2099-01-10", "assign:one"]);
  assert.equal(fixture.records()[0].assignedStaffId, therapistId);
  assert.equal(fixture.records()[0].version, 4);
  assert.equal(fixture.records()[0].internalNotes, "Keep me");
  assert.equal(fixture.records()[0].customerEncrypted, "unchanged-ciphertext");
  assert.equal(fixture.records()[0].emailMetadata, "untouched");
  assert.deepEqual(fixture.audits(), ["one"]);
  assert.equal((await fixture.run({ therapistId })).count, 0);
});

test("two unassigned overlapping appointments cannot both be assigned to one therapist even at capacity two", async () => {
  const fixture = setup([candidate("one"), candidate("two")]);
  await assert.rejects(fixture.run({ therapistId }), /conflicts/);
  assert.deepEqual(fixture.operations, []);
  assert.ok(fixture.records().every((booking) => !booking.assignedStaffId));
});

test("existing therapist occupancy, closures, and unqualified therapist stop the whole batch", async (t) => {
  await t.test("existing occupancy", async () => {
    const fixture = setup([candidate("one"), candidate("existing", { assignedStaffId: therapistId })]);
    await assert.rejects(fixture.run({ therapistId }), /conflicts/);
  });
  await t.test("closure", async () => {
    const fixture = setup();
    fixture.repository.listClosures = async () => [{ id: "closure", localDate: "2099-01-10", active: true, closedAllDay: true }] as never;
    await assert.rejects(fixture.run({ therapistId }), /conflicts/);
  });
  await t.test("eligibility", async () => {
    const fixture = setup([candidate("one", { serviceId: "other-treatment" })]);
    await assert.rejects(fixture.run({ therapistId }), /not qualified/);
  });
});

test("transaction caller can roll back every assignment and audit when a later CAS fails", async () => {
  const fixture = setup([candidate("one"), candidate("two", { localTime: "13:00", startsAt: "2099-01-10T13:00:00.000Z", endsAt: "2099-01-10T14:00:00.000Z" })]);
  const plan = await fixture.run({ therapistId });
  const originalAssign = fixture.repository.assign;
  fixture.repository.assign = async (booking, therapist, timestamp) => booking.id === "two" ? false : originalAssign(booking, therapist, timestamp);
  await assert.rejects(fixture.run({ therapistId, apply: true, expectedPlan: plan.planHash }), /changed concurrently/);
  assert.ok(fixture.records().every((booking) => !booking.assignedStaffId && booking.version === 3));
  assert.deepEqual(fixture.audits(), []);
});

test("the entire batch is revalidated before writes if availability changed after dry run", async () => {
  const fixture = setup();
  const plan = await fixture.run({ therapistId });
  fixture.repository.listBookingOccupancy = async () => [
    { id: "other", localDate: "2099-01-10", startsAt: "2099-01-10T11:00:00Z", endsAt: "2099-01-10T12:00:00Z", status: "confirmed", assignedStaffId: therapistId, expiresAt: "" },
  ] satisfies CmsBookingOccupancy[];
  await assert.rejects(fixture.run({ therapistId, apply: true, expectedPlan: plan.planHash }), /conflicts/);
  assert.ok(!fixture.operations.some((operation) => operation.startsWith("assign:")));
});
