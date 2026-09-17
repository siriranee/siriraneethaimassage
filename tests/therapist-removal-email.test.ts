import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test, { after, before } from "node:test";

import type { CreateEmailOptions, CreateEmailRequestOptions, CreateEmailResponse } from "resend";
import type { CmsBooking } from "@/domain/cms/types";
import { captureTherapistRemovedAppointment, readTherapistRemovedAppointment } from "@/domain/booking/therapist-removed-appointment";

registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "server-only"
    ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
    : nextResolve(specifier, context);
} });

const configuration = {
  apiKey: "re_therapist_test_only_12345", from: "Bookings <bookings@example.test>",
  to: "owner@example.test", siteOrigin: "https://example.test",
};
const environment = {
  RESEND_API_KEY: configuration.apiKey, RESEND_FROM_EMAIL: configuration.from,
  RESEND_BOOKING_TO_EMAIL: configuration.to, NEXT_PUBLIC_SITE_URL: configuration.siteOrigin,
  CMS_PII_ENCRYPTION_KEY: "test-only-fingerprint-secret",
};
const originalEnvironment = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
before(() => Object.assign(process.env, environment));
after(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function fixture() {
  const { MockCmsRepository } = await import("@/server/cms/repositories/mock-repository");
  const service = await import("@/server/cms/notification-service");
  const transport = await import("@/server/booking/resend-booking-email");
  const { createSafePublicContentState } = await import("@/server/cms/default-content");
  Reflect.deleteProperty(globalThis, "__siriraneeCmsMockState");
  const repository = new MockCmsRepository();
  const team = (await repository.getContent()).team.slice(0, 2);
  assert.equal(team.length, 2);
  for (const [index, member] of team.entries()) {
    await repository.saveTherapistContact({ id: member.id, notificationEmail: `therapist-${index}@example.test`,
      contactPhone: "", version: 1, updatedAt: new Date().toISOString(), updatedBy: "test" });
  }
  const original: CmsBooking = {
    id: "fictional-removal-booking", reference: "SRN-20261001-TEST01", status: "confirmed", version: 2,
    customer: { name: "Private Customer", email: "private@example.test", phone: "+353855555555", notes: "Private customer note" },
    serviceId: "thai", serviceSlug: "traditional-thai", serviceName: "Original Thai Massage", durationMinutes: 60,
    priceCents: 6500, currency: "EUR", localDate: "2026-10-01", localTime: "11:00", timezone: "Europe/Dublin",
    startsAt: "2026-10-01T10:00:00.000Z", endsAt: "2026-10-01T11:00:00.000Z", source: "website",
    capacityExpiresAt: "", assignedStaffId: team[0].id, assignedStaffName: team[0].name,
    internalNotes: "Private internal note", privacyAcceptedAt: "2026-09-17T10:00:00.000Z", privacyNoticeVersion: "2026-09-01",
    holdTokenHash: "private-hold", idempotencyKeyHash: "private-key", requestFingerprintHash: "private-fingerprint", demo: false,
    createdAt: "2026-09-17T10:00:00.000Z", updatedAt: "2026-09-17T10:00:00.000Z", updatedBy: "test",
  };
  const reassigned: CmsBooking = { ...original, version: 3, assignedStaffId: team[1].id, assignedStaffName: team[1].name,
    serviceId: "oil", serviceName: "New Oil Massage", durationMinutes: 90, localDate: "2026-10-02", localTime: "14:00",
    startsAt: "2026-10-02T13:00:00.000Z", endsAt: "2026-10-02T14:30:00.000Z" };
  await repository.saveBooking(original);
  await repository.saveBooking(reassigned, original.version);
  const notifications = await service.recordTherapistBookingEmailPlans(repository, original, reassigned);
  const plans = service.getTherapistBookingEmailPlans(original, reassigned);
  const removal = plans.find((plan) => plan.event === "removed")!;
  const assignment = plans.find((plan) => plan.event === "assigned")!;
  const publication = await repository.getPublishedContent();
  const business = transport.createCustomerBookingEmailBusiness((publication?.snapshot ?? createSafePublicContentState()).site);
  const requests: { payload: CreateEmailOptions; options?: CreateEmailRequestOptions }[] = [];
  let nextResponse: CreateEmailResponse = { data: { id: "fake-provider-message" }, error: null, headers: null };
  const client = { emails: { async send(payload: CreateEmailOptions, options?: CreateEmailRequestOptions) {
    requests.push({ payload, options });
    return nextResponse;
  } } };
  const options = { business, sender: ((booking, recipient, event, version, business) =>
    transport.sendTherapistBookingEmail(booking, recipient, event, version, business, { configuration, client })) satisfies
      import("@/server/booking/resend-booking-email").TherapistBookingEmailSender };
  return { repository, service, original, reassigned, removal, assignment, notifications, options, requests,
    failNext: () => { nextResponse = { data: null, error: { name: "validation_error", message: "Rejected test message", statusCode: 422 }, headers: null }; },
    succeedNext: () => { nextResponse = { data: { id: "fake-provider-message" }, error: null, headers: null }; } };
}

test("combined reassignment and reschedule sends the previous therapist only the immutable original slot", async () => {
  const f = await fixture();
  const notification = f.notifications.find((item) => item.id === f.removal.notificationId)!;
  assert.deepEqual(notification.therapistRemovedAppointment, captureTherapistRemovedAppointment(f.original));
  assert.deepEqual(Object.keys(notification.therapistRemovedAppointment!).sort(),
    ["assignedStaffId", "durationMinutes", "localDate", "localTime", "serviceName", "timezone"]);
  assert.ok(notification.deliveryPayloadHash, "the original slot fingerprint must be bound when queued");
  assert.equal((await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.removal, f.options))?.status, "sent");
  assert.equal((await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.assignment, f.options))?.status, "sent");
  assert.deepEqual(f.requests[0].payload.to, ["therapist-0@example.test"]);
  assert.match(f.requests[0].payload.text!, /Original appointment removed|Original Thai Massage|11:00|60 minutes/);
  assert.doesNotMatch(f.requests[0].payload.text!, /New Oil Massage|14:00|90 minutes/);
  assert.deepEqual(f.requests[1].payload.to, ["therapist-1@example.test"]);
  assert.match(f.requests[1].payload.text!, /New Oil Massage|14:00|90 minutes/);
  assert.doesNotMatch(JSON.stringify(f.notifications), /Private Customer|private@example|Private internal|Private customer|private-hold/);
  assert.doesNotMatch(JSON.stringify(f.requests), /Private Customer|private@example|Private internal|Private customer|private-hold/);
  await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.removal, f.options);
  assert.equal(f.requests.length, 2, "accepted removal must not be sent twice");
});

for (const status of ["confirmed", "cancelled"] as const) {
  test(`known-unsent removal retries with identical payload after later ${status} update for another therapist`, async () => {
    const f = await fixture();
    f.failNext();
    assert.equal((await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.removal, f.options))?.status, "failed");
    const attempted = (await f.repository.getNotification(f.removal.notificationId))!;
    assert.equal(attempted.lastError, "resend-message-rejected");
    await f.repository.saveNotification({ ...attempted,
      firstAttemptedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString() });
    const later = { ...f.reassigned, status, version: 4, localTime: "16:00", serviceName: "Later treatment" };
    await f.repository.saveBooking(later, 3);
    await f.service.recordTherapistBookingEmailPlans(f.repository, f.reassigned, later);
    f.succeedNext();
    assert.equal((await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.removal, f.options))?.status, "sent");
    assert.deepEqual(f.requests[1], f.requests[0], "retry must retain old slot, recipient and provider idempotency key");
  });
}

test("a missing contact may recover on first removal send after the other therapist's booking is cancelled", async () => {
  const f = await fixture();
  const notification = (await f.repository.getNotification(f.removal.notificationId))!;
  const unbound = { ...notification, deliveryPayloadHash: undefined };
  await f.repository.saveNotification(unbound);
  const later: CmsBooking = { ...f.reassigned, status: "cancelled", version: 4 };
  await f.repository.saveBooking(later, 3);
  assert.equal((await f.service.deliverTherapistBookingEmail(f.repository, later, f.removal, f.options))?.status, "sent");
  assert.match(f.requests[0].payload.text!, /11:00/);
  assert.ok((await f.repository.getNotification(f.removal.notificationId))?.deliveryPayloadHash);
});

test("removal retry rejects a reassignment back to the original therapist observed after claiming", async () => {
  const f = await fixture();
  const claim = f.repository.claimNotificationDelivery.bind(f.repository);
  f.repository.claimNotificationDelivery = async (...args) => {
    const result = await claim(...args);
    await f.repository.saveBooking({ ...f.reassigned, assignedStaffId: f.original.assignedStaffId, version: 4 }, 3);
    return result;
  };
  const result = await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.removal, f.options);
  assert.deepEqual(result, { status: "failed", attempted: false, errorCode: "therapist-booking-state-invalid" });
  assert.equal(f.requests.length, 0);
});

test("later events for the same therapist supersede the old removal even if they have since been removed again", async () => {
  const f = await fixture();
  const restored = { ...f.reassigned, assignedStaffId: f.original.assignedStaffId, version: 4 };
  await f.repository.saveBooking(restored, 3);
  await f.service.recordTherapistBookingEmailPlans(f.repository, f.reassigned, restored);
  const removedAgain = { ...f.reassigned, version: 5 };
  await f.repository.saveBooking(removedAgain, 4);
  await f.service.recordTherapistBookingEmailPlans(f.repository, restored, removedAgain);
  const result = await f.service.deliverTherapistBookingEmail(f.repository, removedAgain, f.removal, f.options);
  assert.deepEqual(result, { status: "failed", attempted: false, errorCode: "booking-event-superseded" });
  assert.equal(f.requests.length, 0);
});

test("legacy or mismatched removal snapshots fail closed without guessing from the current appointment", async () => {
  for (const malformed of [undefined, { assignedStaffId: "other" }]) {
    const f = await fixture();
    const notification = (await f.repository.getNotification(f.removal.notificationId))!;
    await f.repository.saveNotification({ ...notification,
      therapistRemovedAppointment: malformed as typeof notification.therapistRemovedAppointment });
    const result = await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned, f.removal, f.options);
    assert.deepEqual(result, { status: "failed", attempted: false, errorCode: "therapist-removal-snapshot-unavailable" });
    assert.equal(f.requests.length, 0);
    assert.equal(f.service.canRetryBookingEmailNotification((await f.repository.getNotification(notification.id))!), false);
  }
  const f = await fixture();
  assert.equal(readTherapistRemovedAppointment({ ...captureTherapistRemovedAppointment(f.original), localDate: "2026-02-30" }, f.original.assignedStaffId), null);
});

test("delivery uses authoritative stored recipient and event rather than caller-supplied plan details", async () => {
  const f = await fixture();
  await f.service.deliverTherapistBookingEmail(f.repository, f.reassigned,
    { ...f.removal, event: "assigned", targetTeamMemberId: f.reassigned.assignedStaffId, bookingVersion: 99 }, f.options);
  assert.deepEqual(f.requests[0].payload.to, ["therapist-0@example.test"]);
  assert.equal(f.requests[0].options?.idempotencyKey,
    `therapist-booking-removed/${f.original.id}/${f.original.assignedStaffId}/3`);
  assert.match(f.requests[0].payload.text!, /Original appointment removed/);
});

test("uncertain removal retains its original retry window and immutable payload after cancellation", async () => {
  const f = await fixture();
  const originalAttempt = new Date(Date.now() - 22 * 60 * 60 * 1_000).toISOString();
  const notification = (await f.repository.getNotification(f.removal.notificationId))!;
  await f.repository.saveNotification({ ...notification, status: "indeterminate", attemptCount: 1,
    firstAttemptedAt: originalAttempt, attemptedAt: originalAttempt, lastError: "resend-timeout" });
  const later: CmsBooking = { ...f.reassigned, status: "cancelled", version: 4, localTime: "16:00" };
  await f.repository.saveBooking(later, 3);
  const retry = await f.service.deliverTherapistBookingEmail(f.repository, later, f.removal, {
    ...f.options, sender: async () => ({ status: "failed", attempted: false, errorCode: "resend-configuration-missing" }),
  });
  assert.equal(retry?.status, "failed");
  const saved = (await f.repository.getNotification(notification.id))!;
  assert.equal(saved.status, "indeterminate");
  assert.equal(saved.lastError, "resend-timeout");
  assert.equal(saved.firstAttemptedAt, originalAttempt);
  await f.repository.saveNotification({ ...saved, firstAttemptedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString() });
  assert.equal(await f.service.deliverTherapistBookingEmail(f.repository, later, f.removal, f.options), null);
  assert.equal(f.requests.length, 0);
});
