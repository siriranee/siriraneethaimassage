import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

async function setup() {
  process.env.CMS_MODE = "mock";
  Reflect.set(process.env, "NODE_ENV", "test");
  delete process.env.CI;
  delete process.env.VERCEL;
  delete process.env.NETLIFY;
  for (const key of ["__siriraneeCmsRepository", "__siriraneeCmsMockState", "__siriraneeCmsMockQueue"]) {
    Reflect.deleteProperty(globalThis, key);
  }
  const { getCmsRepository } = await import("@/server/cms/repositories");
  return prepareBookingSafetyFixture(getCmsRepository());
}

test("quick confirmation and cancellation preserve notes; an explicit empty value clears them", async () => {
  const fixture = await setup();
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  let booking = await createAdminBooking(fixture.input, fixture.context);
  for (const status of ["confirmed", "cancelled"]) {
    booking = await updateAdminBooking(booking.id, { status, changeReason: "customer-request" }, booking.version, fixture.context);
    assert.equal(booking.internalNotes, "Important operational note");
  }
  booking = await updateAdminBooking(booking.id, { internalNotes: "" }, booking.version, fixture.context);
  assert.equal(booking.internalNotes, "");
  assert.equal((await fixture.repository.getBooking(booking.id))?.internalNotes, "");
});

test("notes-only changes preserve legacy unassigned appointments even when scheduling is no longer available", async () => {
  const fixture = await setup();
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  let booking = await createAdminBooking({ ...fixture.input, status: "confirmed" }, fixture.context);
  booking = await fixture.repository.saveBooking({ ...booking, assignedStaffId: "", assignedStaffName: "" }, booking.version);
  const content = await fixture.repository.getContent();
  await fixture.repository.saveContent({
    ...content,
    revision: content.revision + 1,
    services: [],
    site: { ...content.site, weeklyHours: content.site.weeklyHours.map((day) => ({ ...day, open: false })) },
    bookingSettings: { ...content.bookingSettings, minimumNoticeMinutes: 48 * 60 },
  }, content.revision);
  const updated = await updateAdminBooking(booking.id, {
    status: booking.status,
    localDate: booking.localDate,
    localTime: booking.localTime,
    therapistId: "",
    internalNotes: "Staff can update an existing record.",
  }, booking.version, fixture.context);
  assert.equal(updated.status, "confirmed");
  assert.equal(updated.assignedStaffId, "");
  assert.equal(updated.startsAt, booking.startsAt);
  assert.equal(updated.internalNotes, "Staff can update an existing record.");
});

test("existing future requests confirm inside the notice window, but a reschedule and a new request still obey it", async () => {
  const fixture = await setup();
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  const booking = await createAdminBooking(fixture.input, fixture.context);
  const content = await fixture.repository.getContent();
  await fixture.repository.saveContent({ ...content, revision: content.revision + 1, bookingSettings: { ...content.bookingSettings, minimumNoticeMinutes: 48 * 60 } }, content.revision);
  const confirmed = await updateAdminBooking(booking.id, { status: "confirmed", changeReason: "customer-request" }, booking.version, fixture.context);
  assert.equal(confirmed.status, "confirmed");
  await assert.rejects(
    updateAdminBooking(booking.id, { localTime: "14:00", changeReason: "customer-request" }, confirmed.version, fixture.context),
    /outside opening hours, blocked or fully booked/,
  );
  await assert.rejects(createAdminBooking({ ...fixture.input, localTime: "14:00" }, fixture.context), /outside opening hours, blocked or fully booked/);
});

test("confirmation still rejects past appointments, therapist conflicts, closures and unavailable therapists", async (t) => {
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  for (const blocker of ["past", "therapist-conflict", "closure", "inactive-therapist"]) {
    await t.test(blocker, async () => {
      const fixture = await setup();
      let booking = await createAdminBooking(fixture.input, fixture.context);
      if (blocker === "past") {
        booking = await fixture.repository.saveBooking({ ...booking, localDate: "2000-01-01", startsAt: "2000-01-01T12:00:00Z", endsAt: "2000-01-01T13:00:00Z" }, booking.version);
      } else if (blocker === "therapist-conflict") {
        await fixture.repository.saveBooking({ ...booking, id: "conflicting-booking", reference: "SRN-CONFLICT", status: "confirmed", idempotencyKeyHash: "conflicting-idempotency" });
      } else if (blocker === "closure") {
        await fixture.repository.saveClosure({ id: "safety-closure", localDate: fixture.localDate, closedAllDay: true, startsAtLocal: "", endsAtLocal: "", reason: "Test closure", publicLabel: "Closed", active: true, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: fixture.actor.id });
      } else {
        const content = await fixture.repository.getContent();
        await fixture.repository.saveContent({ ...content, revision: content.revision + 1, team: content.team.map((member) => ({ ...member, operationalActive: false })) }, content.revision);
      }
      await assert.rejects(updateAdminBooking(booking.id, { status: "confirmed", changeReason: "customer-request" }, booking.version, fixture.context));
      assert.equal((await fixture.repository.getBooking(booking.id))?.status, "pending");
    });
  }
});

test("therapist deactivation and booking creation are rejected in both serialized operation orders", async () => {
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const { updateCmsTeamMember } = await import("@/server/cms/content-service");
  let fixture = await setup();
  await createAdminBooking(fixture.input, fixture.context);
  await assert.rejects(updateCmsTeamMember(fixture.therapist.id, { ...fixture.therapist, operationalActive: false }, fixture.therapist.version, fixture.context), /Reassign future booking/);
  fixture = await setup();
  await updateCmsTeamMember(fixture.therapist.id, { ...fixture.therapist, operationalActive: false }, fixture.therapist.version, fixture.context);
  await assert.rejects(createAdminBooking(fixture.input, fixture.context), /Choose an active massage therapist/);
  assert.equal((await fixture.repository.listBookings()).length, 0);
});
