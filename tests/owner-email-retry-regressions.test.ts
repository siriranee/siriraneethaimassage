import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { CreateEmailOptions, CreateEmailRequestOptions } from "resend";
import type { CmsBooking, CmsBookingNotification } from "@/domain/cms/types";
import type { BookingEmailSendResult } from "@/server/booking/resend-booking-email";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return {
      shortCircuit: true,
      url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href,
    };
    return nextResolve(specifier, context);
  },
});

const configuration = {
  apiKey: "re_test_owner_retry_regressions_only",
  from: "Bookings <bookings@siriranee.example>",
  to: "owner@siriranee.example",
  siteOrigin: "https://siriranee.example",
};
const dependencies = { configuration, fingerprintSecret: "local-test-owner-retry-key" };

function booking(): CmsBooking {
  return {
    id: randomUUID(), reference: "SRN-20260919-RETRY1",
    customer: { name: "Test Guest", email: "guest@example.com", phone: "+353851234567", notes: "Quiet room." },
    serviceId: "traditional-thai", serviceSlug: "traditional-thai-massage",
    serviceName: "Traditional Thai Massage", durationMinutes: 60, priceCents: 6500, currency: "EUR",
    startsAt: "2026-09-19T10:00:00.000Z", endsAt: "2026-09-19T11:00:00.000Z",
    localDate: "2026-09-19", localTime: "11:00", timezone: "Europe/Dublin",
    status: "pending", source: "website", capacityExpiresAt: "2026-09-17T10:30:00.000Z",
    assignedStaffId: "therapist-a", assignedStaffName: "Therapist A", internalNotes: "",
    privacyAcceptedAt: "2026-09-17T10:00:00.000Z", privacyNoticeVersion: "2026-09-03",
    holdTokenHash: "", idempotencyKeyHash: "test-hash", requestFingerprintHash: "test-fingerprint",
    demo: false, version: 1, createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z", updatedBy: "public-booking",
  };
}

async function capturedRequest(current: CmsBooking, recipient = configuration.to) {
  const { sendOwnerBookingRequestedEmail } = await import("@/server/booking/resend-booking-email");
  let request: { payload: CreateEmailOptions; options?: CreateEmailRequestOptions } | undefined;
  await sendOwnerBookingRequestedEmail(current, {
    configuration: { ...configuration, to: recipient },
    client: { emails: { async send(payload, options) {
      request = { options, payload };
      return { data: { id: "simulated-owner-message" }, error: null, headers: null };
    } } },
  });
  assert.ok(request);
  return request;
}

async function legacyFingerprint(current: CmsBooking) {
  const request = await capturedRequest(current);
  const key = createHmac("sha256", dependencies.fingerprintSecret)
    .update("siriranee/resend-booking-email/fingerprint/v1").digest();
  return createHmac("sha256", key).update(JSON.stringify({
    request, bookingStatus: current.status, bookingVersion: current.version,
  })).digest("base64url");
}

async function setup(initial = booking()) {
  const { MockCmsRepository } = await import("@/server/cms/repositories/mock-repository");
  const { deliverOwnerBookingRequestEmail, ownerBookingRequestEmailNotificationId } =
    await import("@/server/cms/notification-service");
  const { getOwnerBookingEmailDeliveryFingerprint, isOwnerBookingEmailDeliveryFingerprintCompatible } =
    await import("@/server/booking/resend-booking-email");
  const repository = new MockCmsRepository();
  await repository.saveBooking(initial);
  const id = ownerBookingRequestEmailNotificationId(initial.id);
  const fingerprint = (current: CmsBooking) => getOwnerBookingEmailDeliveryFingerprint(current, dependencies);
  const compatible = (current: CmsBooking, hash: string, version?: number) =>
    isOwnerBookingEmailDeliveryFingerprintCompatible(current, hash, version, dependencies);
  const base: CmsBookingNotification = {
    id, bookingId: initial.id, bookingReference: initial.reference,
    audience: "owner", channel: "email", kind: "booking-requested", provider: "resend",
    status: "queued", attemptCount: 0, deliveryPayloadHash: fingerprint(initial)!,
    lastError: "", createdAt: initial.createdAt, updatedAt: initial.updatedAt,
  };
  await repository.saveNotification(base);
  const deliver = (sender: (current: CmsBooking) => Promise<BookingEmailSendResult>) =>
    deliverOwnerBookingRequestEmail(repository, initial, sender, fingerprint, compatible);
  return { repository, id, base, initial, fingerprint, compatible, deliver };
}

const accepted = async (): Promise<BookingEmailSendResult> => ({
  status: "sent", attempted: true, providerMessageId: "simulated-owner-message",
});

test("owner v2 fingerprints follow the actual request, not internal notes or version", async () => {
  const { initial, fingerprint } = await setup();
  const notes = { ...initial, version: 8, internalNotes: "Staff-only notes", updatedBy: "admin" };
  assert.deepEqual(await capturedRequest(initial), await capturedRequest(notes));
  assert.match(fingerprint(initial)!, /^owner-v2:/);
  assert.equal(fingerprint(initial), fingerprint(notes));
  assert.notEqual(fingerprint(initial), fingerprint({ ...notes, status: "confirmed" }));
  assert.notEqual(fingerprint(initial), fingerprint({ ...notes, localTime: "14:00" }));
  assert.notEqual(fingerprint(initial), fingerprint({
    ...notes, customer: { ...notes.customer, email: "different@example.com" },
  }));
  const { getOwnerBookingEmailDeliveryFingerprint } = await import("@/server/booking/resend-booking-email");
  assert.notEqual(fingerprint(initial), getOwnerBookingEmailDeliveryFingerprint(notes, {
    ...dependencies, configuration: { ...configuration, to: "different-owner@example.com" },
  }));
});

test("a rate-limited owner alert retries after a notes-only save, then never resends", async () => {
  const { repository, initial, id, deliver, fingerprint } = await setup();
  let calls = 0;
  await deliver(async () => {
    calls += 1;
    return { status: "failed", attempted: true, errorCode: "resend-rate-limited" };
  });
  const changed = { ...initial, version: 2, internalNotes: "New private note" };
  await repository.saveBooking(changed);
  const result = await deliver(async (latest) => {
    calls += 1;
    assert.equal(latest.version, 2);
    assert.deepEqual(await capturedRequest(latest), await capturedRequest(initial));
    return accepted();
  });
  assert.equal(result?.status, "sent");
  assert.equal((await repository.getNotification(id))?.deliveryPayloadHash, fingerprint(initial));
  assert.equal(await deliver(async () => { calls += 1; return accepted(); }), null);
  assert.equal(calls, 2);
});

test("legacy original-version fingerprints migrate before sending without extending uncertainty", async () => {
  const { repository, initial, base, id, deliver, fingerprint } = await setup();
  const hash = await legacyFingerprint(initial);
  const firstAttemptedAt = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
  await repository.saveNotification({
    ...base, status: "indeterminate", attemptCount: 1, lastError: "resend-timeout",
    firstAttemptedAt, attemptedAt: firstAttemptedAt, deliveryPayloadHash: hash,
  });
  await repository.saveBooking({ ...initial, version: 6, internalNotes: "Updated notes" });
  const result = await deliver(async () => {
    const saved = await repository.getNotification(id);
    assert.equal(saved?.deliveryPayloadHash, fingerprint(initial));
    assert.equal(saved?.firstAttemptedAt, firstAttemptedAt);
    return { status: "failed", attempted: true, errorCode: "resend-timeout" };
  });
  assert.equal(result?.status, "failed");
  const saved = await repository.getNotification(id);
  assert.equal(saved?.status, "indeterminate");
  assert.equal(saved?.firstAttemptedAt, firstAttemptedAt);
  assert.equal(saved?.deliveryPayloadHash, fingerprint(initial));
});

test("legacy compatibility supports recorded and exact current versions but not unknown versions", async () => {
  const { initial, compatible } = await setup();
  const versionFour = { ...initial, version: 4 };
  const versionFive = { ...initial, version: 5, internalNotes: "Notes only" };
  const hash = await legacyFingerprint(versionFour);
  assert.equal(compatible(versionFour, hash), true);
  assert.equal(compatible(versionFive, hash, 4), true);
  assert.equal(compatible(versionFive, hash), false);
  assert.equal(compatible(versionFive, hash, 6), false);
});

test("legacy changed content and recipient hashes remain blocked even after a definite rejection", async () => {
  for (const state of ["failed", "indeterminate"] as const) {
    const { repository, initial, base, id, deliver, compatible } = await setup();
    const hash = await legacyFingerprint(initial);
    const firstAttemptedAt = new Date(Date.now() - 60_000).toISOString();
    await repository.saveNotification({
      ...base, status: state, attemptCount: 1, deliveryPayloadHash: hash,
      firstAttemptedAt, attemptedAt: firstAttemptedAt,
      lastError: state === "failed" ? "resend-rate-limited" : "resend-timeout",
    });
    const changed = { ...initial, version: 2, customer: { ...initial.customer, email: "new@example.com" } };
    await repository.saveBooking(changed);
    assert.equal(compatible(changed, hash), false);
    let calls = 0;
    const result = await deliver(async () => { calls += 1; return accepted(); });
    assert.deepEqual(result, { status: "failed", attempted: false, errorCode: "resend-payload-changed" });
    assert.equal(calls, 0);
    const saved = await repository.getNotification(id);
    assert.equal(saved?.deliveryPayloadHash, hash);
    if (state === "indeterminate") {
      assert.equal(saved?.firstAttemptedAt, firstAttemptedAt);
      assert.equal(saved?.status, "indeterminate");
    }
  }
});

test("owner retry rechecks current status before accepting a compatible legacy payload", async () => {
  const { repository, initial, base, deliver } = await setup();
  await repository.saveNotification({ ...base, deliveryPayloadHash: await legacyFingerprint(initial) });
  await repository.saveBooking({ ...initial, version: 2, status: "confirmed" });
  let calls = 0;
  assert.deepEqual(await deliver(async () => { calls += 1; return accepted(); }), {
    status: "failed", attempted: false, errorCode: "booking-not-pending",
  });
  assert.equal(calls, 0);
});

test("legacy migration cannot revive an expired uncertain attempt", async () => {
  const { repository, initial, base, id, deliver } = await setup();
  const firstAttemptedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hash = await legacyFingerprint(initial);
  await repository.saveNotification({
    ...base, status: "indeterminate", attemptCount: 1, lastError: "resend-timeout",
    firstAttemptedAt, attemptedAt: firstAttemptedAt, deliveryPayloadHash: hash,
  });
  await repository.saveBooking({ ...initial, version: 2, internalNotes: "New notes" });
  let calls = 0;
  assert.equal(await deliver(async () => { calls += 1; return accepted(); }), null);
  assert.equal(calls, 0);
  assert.equal((await repository.getNotification(id))?.deliveryPayloadHash, hash);
  assert.equal((await repository.getNotification(id))?.firstAttemptedAt, firstAttemptedAt);
});

test("legacy migration never contacts the provider if binding the new hash fails", async () => {
  const { repository, initial, base, id, deliver } = await setup();
  const hash = await legacyFingerprint(initial);
  await repository.saveNotification({ ...base, deliveryPayloadHash: hash });
  await repository.saveBooking({ ...initial, version: 2, internalNotes: "New notes" });
  const complete = repository.completeNotificationDelivery.bind(repository);
  repository.completeNotificationDelivery = async (notification, claim) => {
    if (notification.status === "sending") return false;
    return complete(notification, claim);
  };
  let calls = 0;
  assert.deepEqual(await deliver(async () => { calls += 1; return accepted(); }), {
    status: "failed", attempted: false, errorCode: "booking-email-payload-not-saved",
  });
  assert.equal(calls, 0);
  assert.equal((await repository.getNotification(id))?.deliveryPayloadHash, hash);
});
