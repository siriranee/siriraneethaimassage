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

test("overlapping pending requests can both be confirmed for their original time", async () => {
  const fixture = await setup();
  const {
    createAdminBooking,
    getAdminAvailability,
    updateAdminBooking,
  } = await import("@/server/cms/booking-service");
  const first = await createAdminBooking(fixture.input, fixture.context);
  const second = await createAdminBooking(
    { ...fixture.input, customerName: "Demo Second Safety Guest" },
    fixture.context,
  );

  const firstConfirmed = await updateAdminBooking(
    first.id,
    { status: "confirmed", changeReason: "customer-request" },
    first.version,
    fixture.context,
  );
  const secondConfirmed = await updateAdminBooking(
    second.id,
    { status: "confirmed", changeReason: "customer-request" },
    second.version,
    fixture.context,
  );

  assert.equal(firstConfirmed.status, "confirmed");
  assert.equal(secondConfirmed.status, "confirmed");
  assert.equal(firstConfirmed.startsAt, secondConfirmed.startsAt);
  assert.equal(firstConfirmed.assignedStaffId, secondConfirmed.assignedStaffId);
  const availability = await getAdminAvailability({
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate: fixture.localDate,
  });
  assert.ok(!availability.some((slot) => slot.localTime === fixture.input.localTime));
});

test("confirmation still rejects past appointments, closures and unavailable therapists", async (t) => {
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  for (const blocker of ["past", "closure", "inactive-therapist"]) {
    await t.test(blocker, async () => {
      const fixture = await setup();
      let booking = await createAdminBooking(fixture.input, fixture.context);
      if (blocker === "past") {
        booking = await fixture.repository.saveBooking({ ...booking, localDate: "2000-01-01", startsAt: "2000-01-01T12:00:00Z", endsAt: "2000-01-01T13:00:00Z" }, booking.version);
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

test("therapist deletion removes every assigned booking atomically and preserves unrelated records", async () => {
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const { deleteCmsTeamMember, getCmsTeamDeletionImpact } = await import(
    "@/server/cms/content-service"
  );
  const fixture = await setup();
  const initialContent = await fixture.repository.getContent();
  const otherTherapist = {
    ...fixture.therapist,
    id: "unrelated-therapist",
    slug: "unrelated-therapist",
    name: "Unrelated Therapist",
    fullName: "Unrelated Therapist",
  };
  const contentWithOther = {
    ...initialContent,
    revision: initialContent.revision + 1,
    team: [...initialContent.team, otherTherapist],
  };
  await fixture.repository.saveContent(contentWithOther, initialContent.revision);
  await fixture.repository.savePublication({
    id: "deletion-test-publication",
    revision: contentWithOther.revision,
    publishedAt: new Date().toISOString(),
    publishedBy: fixture.actor.id,
    snapshot: contentWithOther,
  });

  const assigned = await createAdminBooking(fixture.input, fixture.context);
  const historical = {
    ...assigned,
    id: "historical-assigned-booking",
    reference: "SRN-20000101-DELETE",
    status: "cancelled" as const,
    startsAt: "2000-01-01T12:00:00.000Z",
    endsAt: "2000-01-01T13:00:00.000Z",
    localDate: "2000-01-01",
    idempotencyKeyHash: "historical-delete-idempotency",
    requestFingerprintHash: "historical-delete-fingerprint",
  };
  const unrelated = {
    ...assigned,
    id: "unrelated-booking",
    reference: "SRN-20990101-KEEP",
    assignedStaffId: otherTherapist.id,
    assignedStaffName: otherTherapist.name,
    idempotencyKeyHash: "unrelated-idempotency",
    requestFingerprintHash: "unrelated-fingerprint",
  };
  await fixture.repository.saveBooking(historical);
  await fixture.repository.saveBooking(unrelated);

  const notificationBase = {
    channel: "email" as const,
    audience: "therapist" as const,
    bookingVersion: 1,
    kind: "booking-assigned" as const,
    status: "sent" as const,
    provider: "resend" as const,
    attemptCount: 1,
    lastError: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await fixture.repository.saveNotification({
    ...notificationBase,
    id: "assigned-booking-notification",
    bookingId: assigned.id,
    bookingReference: assigned.reference,
    targetTeamMemberId: fixture.therapist.id,
    providerMessageId: "assigned-provider-message",
  });
  await fixture.repository.saveNotification({
    ...notificationBase,
    id: "unrelated-booking-notification",
    bookingId: unrelated.id,
    bookingReference: unrelated.reference,
    targetTeamMemberId: otherTherapist.id,
    providerMessageId: "unrelated-provider-message",
  });
  const expectedReferences = [historical.reference, assigned.reference];
  assert.deepEqual(
    await getCmsTeamDeletionImpact(fixture.therapist.id),
    { bookingCount: 2, bookingReferences: expectedReferences },
  );
  await assert.rejects(
    deleteCmsTeamMember(
      fixture.therapist.id,
      fixture.therapist.version + 1,
      fixture.context,
    ),
    /changed by another request/,
  );
  assert.ok(await fixture.repository.getBooking(assigned.id));

  const deleted = await deleteCmsTeamMember(
    fixture.therapist.id,
    fixture.therapist.version,
    fixture.context,
  );
  assert.deepEqual(deleted, {
    memberId: fixture.therapist.id,
    name: fixture.therapist.name,
    bookingCount: 2,
    bookingReferences: expectedReferences,
  });
  assert.equal((await fixture.repository.getContent()).team.some(
    (member) => member.id === fixture.therapist.id,
  ), false);
  assert.equal((await fixture.repository.getContent()).team.some(
    (member) => member.id === otherTherapist.id,
  ), true);
  assert.equal(await fixture.repository.getBooking(assigned.id), null);
  assert.equal(await fixture.repository.getBooking(historical.id), null);
  assert.equal((await fixture.repository.getBooking(unrelated.id))?.assignedStaffId, otherTherapist.id);
  assert.deepEqual(await fixture.repository.listNotifications(assigned.id), []);
  assert.equal((await fixture.repository.listNotifications(unrelated.id)).length, 1);
  // Separate therapist contact data is retained until the owner explicitly
  // authorizes deleting that private operational record too.
  assert.equal(
    (await fixture.repository.getTherapistContact(fixture.therapist.id))
      ?.notificationEmail,
    "demo.therapist@example.invalid",
  );
  const published = await fixture.repository.getPublishedContent();
  assert.equal(published?.snapshot.team.some(
    (member) => member.id === fixture.therapist.id,
  ), false);
  assert.equal(published?.snapshot.team.some(
    (member) => member.id === otherTherapist.id,
  ), true);
  const audits = await fixture.repository.listAuditForEntity(
    "team-member",
    fixture.therapist.id,
  );
  assert.equal(audits[0]?.action, "team.deleted");
  assert.match(audits[0]?.summary ?? "", /2 related bookings/);
  assert.deepEqual(
    await getCmsTeamDeletionImpact(fixture.therapist.id),
    { bookingCount: 0, bookingReferences: [] },
  );
});

test("an archived therapist can still be permanently deleted with assigned bookings", async () => {
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const { deleteCmsTeamMember } = await import("@/server/cms/content-service");
  const fixture = await setup();
  const assigned = await createAdminBooking(fixture.input, fixture.context);
  const current = await fixture.repository.getContent();
  const archived = {
    ...fixture.therapist,
    publicProfile: false,
    operationalActive: false,
    archived: true,
    version: fixture.therapist.version + 1,
  };
  await fixture.repository.saveContent({
    ...current,
    revision: current.revision + 1,
    team: current.team.map((member) =>
      member.id === archived.id ? archived : member,
    ),
  }, current.revision);

  const deleted = await deleteCmsTeamMember(
    archived.id,
    archived.version,
    fixture.context,
  );
  assert.equal(deleted.memberId, archived.id);
  assert.equal(deleted.bookingCount, 1);
  assert.deepEqual(deleted.bookingReferences, [assigned.reference]);
  assert.equal(await fixture.repository.getBooking(assigned.id), null);
  assert.equal((await fixture.repository.getContent()).team.length, 0);
});
