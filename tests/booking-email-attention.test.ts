import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { bookingEmailAttentionText, bookingEmailDeliveryFeedback, bookingEmailNeedsAttention } from "../src/domain/cms/notification-presentation";
import type { CmsBooking, CmsBookingNotification } from "../src/domain/cms/types";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".module.css")) return { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/css-module-stub.mjs`).href };
    return specifier === "server-only"
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

const failed: CmsBookingNotification = {
  id: "attention-customer", bookingId: "attention-booking", bookingReference: "SRN-ATTENTION-TEST",
  channel: "email", audience: "customer", kind: "booking-confirmed", status: "failed",
  provider: "resend", attemptCount: 1, lastError: "resend-rate-limited",
  deliveryPayloadHash: "private-payload-hash", deliveryClaimId: "private-claim",
  createdAt: "2026-09-17T10:00:00.000Z", updatedAt: "2026-09-17T10:00:00.000Z",
};

async function setup(status: CmsBooking["status"] = "confirmed") {
  Reflect.deleteProperty(globalThis, "__siriraneeCmsMockState");
  const { MockCmsRepository } = await import("../src/server/cms/repositories/mock-repository");
  const repository = new MockCmsRepository();
  const booking = await repository.saveBooking({
    id: failed.bookingId, reference: failed.bookingReference, status, demo: false, version: 1,
    customer: { name: "Fictional Customer", phone: "+353000000", email: "private@example.test", notes: "Private customer note" },
    serviceId: "test-service", serviceSlug: "test-service", serviceName: "Test Treatment", durationMinutes: 60, priceCents: 6500, currency: "EUR",
    startsAt: "2026-09-19T10:00:00.000Z", endsAt: "2026-09-19T11:00:00.000Z", localDate: "2026-09-19", localTime: "11:00", timezone: "Europe/Dublin",
    source: "website", assignedStaffId: "test-therapist", assignedStaffName: "Test Therapist", internalNotes: "Private internal note",
    privacyAcceptedAt: "", privacyNoticeVersion: "", idempotencyKeyHash: "", requestFingerprintHash: "",
    createdAt: failed.createdAt, updatedAt: failed.updatedAt, updatedBy: "test",
  });
  await repository.saveNotification(failed);
  return { repository, booking };
}

test("attention records distinguish unsent and uncertain emails from accepted and preview-only events", () => {
  const booking = { status: "confirmed" as const, demo: false };
  for (const status of ["queued", "sending", "failed", "indeterminate"] as const) {
    assert.equal(bookingEmailNeedsAttention({ ...failed, status }, booking), true);
  }
  for (const status of ["preview", "sent"] as const) {
    assert.equal(bookingEmailNeedsAttention({ ...failed, status }, booking), false);
  }
  for (const deliveryStatus of ["bounced", "failed", "delayed", "complained", "suppressed"] as const) {
    assert.equal(bookingEmailNeedsAttention({ ...failed, status: "sent", deliveryStatus }, booking), true);
  }
  assert.equal(bookingEmailNeedsAttention({ ...failed, status: "sent", deliveryStatus: "delivered" }, booking), false);
  assert.equal(bookingEmailNeedsAttention(failed, { ...booking, demo: true }), false);
  assert.equal(bookingEmailNeedsAttention(failed, null), false);
  assert.equal(bookingEmailNeedsAttention({ ...failed, channel: "dashboard" }, booking), false);
});

test("saved customer and therapist failures survive confirmation, remount and cancellation", async () => {
  const { repository, booking } = await setup("pending");
  await repository.saveNotification({ ...failed, id: "attention-therapist", audience: "therapist", kind: "booking-cancelled" });
  for (const status of ["confirmed", "cancelled"] as const) {
    const current = (await repository.getBooking(booking.id))!;
    await repository.saveBooking({ ...current, version: current.version + 1, status }, current.version);
    const attention = await repository.listBookingEmailAttention();
    assert.equal(attention.length, 1);
    assert.equal(attention[0].count, 2);
    assert.deepEqual([...attention[0].audiences].sort(), ["customer", "therapist"]);
    assert.match(bookingEmailAttentionText(attention[0]), /Customer \/ Therapist email needs attention/);
  }
  const { CmsBookingQuickActions } = await import("../src/components/cms/CmsBookingQuickActions");
  const attention = (await repository.listBookingEmailAttention())[0];
  const router = { refresh() {}, back() {}, forward() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "test" } as AppRouterInstance;
  for (const status of ["confirmed", "cancelled"] as const) {
    // A fresh render has no transient feedback state, exactly as after the keyed remount.
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
      createElement(CmsBookingQuickActions, { booking: { ...booking, status, version: booking.version + 1 }, hasCustomerEmail: true, isMock: false, emailAttention: attention }),
    ));
    assert.match(html, /Customer \/ Therapist email needs attention/);
    assert.match(html, /href="\/cms\/bookings\/attention-booking"/);
    assert.match(html, /Review emails/);
  }
});

test("successful manual retry removes stored attention, but a later bounce restores it", async () => {
  const { repository } = await setup();
  assert.equal((await repository.listBookingEmailAttention()).length, 1);
  await repository.saveNotification({ ...failed, status: "sent", providerMessageId: "accepted-email", lastError: "" });
  assert.deepEqual(await repository.listBookingEmailAttention(), []);
  await repository.saveNotification({ ...failed, status: "sent", providerMessageId: "accepted-email", deliveryStatus: "bounced", lastError: "" });
  assert.equal((await repository.listBookingEmailAttention()).length, 1);
});

test("obsolete owner request errors are hidden without hiding previous-therapist removal errors", async () => {
  const { repository, booking } = await setup("pending");
  await repository.saveNotification({ ...failed, status: "sent" });
  await repository.saveNotification({ ...failed, id: "attention-owner", audience: "owner", kind: "booking-requested" });
  assert.equal((await repository.listBookingEmailAttention())[0].count, 1);
  await repository.saveBooking({ ...booking, version: booking.version + 1, status: "cancelled" }, booking.version);
  assert.deepEqual(await repository.listBookingEmailAttention(), []);
  await repository.saveNotification({ ...failed, id: "attention-removal", audience: "therapist", kind: "booking-cancelled", lastError: "therapist-booking-state-invalid" });
  assert.deepEqual((await repository.listBookingEmailAttention())[0].audiences, ["therapist"]);
});

test("legacy removal failures explain that staff must contact the previous therapist directly", () => {
  const feedback = bookingEmailDeliveryFeedback({ ...failed, lastError: "therapist-removal-snapshot-unavailable" });
  assert.equal(feedback.tone, "warning");
  assert.equal(feedback.label, "Original appointment details unavailable");
  assert.match(feedback.text, /No removal email was sent/);
  assert.match(feedback.text, /Contact the previous therapist directly/);
});

test("legacy provider failures retain uncertain delivery guidance rather than claiming no send", () => {
  for (const lastError of ["resend-provider-error", "resend-provider-unavailable", "resend-network-error"]) {
    const feedback = bookingEmailDeliveryFeedback({ ...failed, lastError });
    assert.equal(feedback.label, "Delivery uncertain");
    assert.equal(feedback.tone, "warning");
    assert.match(feedback.text, /may have accepted/);
    assert.match(feedback.text, /avoid a duplicate/);
    assert.equal(bookingEmailDeliveryFeedback({ ...failed, lastError, deliveryStatus: "delivered" }).label, "Delivered");
  }
  assert.equal(bookingEmailDeliveryFeedback(failed).label, "Could not send");
});

test("booking detail retry confirmation uses shared legacy-aware uncertainty policy", async () => {
  const source = await readFile("src/app/cms/(protected)/bookings/[bookingId]/page.tsx", "utf8");
  assert.match(source, /deliveryUncertain=\{isBookingEmailDeliveryUncertain\(notification\)\}/);
  assert.match(source, /bookingEmailDeliveryFeedback\(latestCustomerEmail, canRetryBookingEmailNotification\(latestCustomerEmail\)\)/);
  assert.match(source, /const retryAllowed = !booking\.demo && canRetryBookingEmailNotification\(notification\)/);
  assert.match(source, /bookingEmailDeliveryFeedback\(notification, retryAllowed\)/);
  assert.match(source, /\{retryAllowed \? \(/);
});

test("expired, exhausted and unsupported email retries give a next step without promising a retry button", async () => {
  const { canRetryBookingEmailNotification } = await import("../src/server/cms/notification-service");
  const validId = `customer-booking-confirmed:${failed.bookingId}`;
  const notifications: CmsBookingNotification[] = [
    { ...failed, id: validId, lastError: "resend-provider-error", firstAttemptedAt: new Date(Date.now() - 25 * 3600_000).toISOString() },
    { ...failed, id: validId, status: "indeterminate", lastError: "resend-timeout", attemptCount: 3, firstAttemptedAt: new Date().toISOString() },
    { ...failed, id: validId, attemptCount: 3 },
    { ...failed, id: "unsupported-notification", status: "queued", attemptCount: 0 },
  ];
  for (const notification of notifications) {
    const retryAllowed = canRetryBookingEmailNotification(notification);
    assert.equal(retryAllowed, false);
    const feedback = bookingEmailDeliveryFeedback(notification, retryAllowed);
    assert.match(feedback.text, /No (?:safe )?retry is available here/);
    assert.match(feedback.text, /contact the recipient directly/);
    assert.doesNotMatch(feedback.text, /retried below|before retrying/);
    if (feedback.label === "Delivery uncertain") {
      assert.match(feedback.text, /may have accepted/);
      assert.match(feedback.text, /avoid sending a duplicate/);
    }
  }
});

test("retry eligibility never overrides authoritative delivery or acceptance feedback", () => {
  const notifications: CmsBookingNotification[] = [
    { ...failed, status: "sent", lastError: "" },
    ...(["delivered", "bounced", "failed", "delayed", "complained", "suppressed"] as const)
      .map((deliveryStatus) => ({ ...failed, status: "sent" as const, deliveryStatus })),
  ];
  for (const notification of notifications) {
    assert.deepEqual(bookingEmailDeliveryFeedback(notification, false), bookingEmailDeliveryFeedback(notification));
  }
  assert.deepEqual(bookingEmailDeliveryFeedback(failed, true), bookingEmailDeliveryFeedback(failed));
});

test("in-progress or unrecoverable send claims explain that retry is not currently available", () => {
  const feedback = bookingEmailDeliveryFeedback({ ...failed, status: "sending" }, false);
  assert.match(feedback.text, /Retry is not currently available/);
  assert.match(feedback.text, /Wait briefly and refresh/);
  assert.match(feedback.text, /review Resend/);
  assert.doesNotMatch(feedback.text, /was not sent/);
});

test("attention reads are bounded, booking-scoped and expose no delivery secrets or customer details", async () => {
  const { repository, booking } = await setup();
  await repository.saveBooking({ ...booking, id: "other-booking", reference: "SRN-OTHER" });
  await repository.saveNotification({ ...failed, id: "other-failure", bookingId: "other-booking", bookingReference: "SRN-OTHER", updatedAt: "2026-09-17T11:00:00.000Z" });
  const latest = await repository.listBookingEmailAttention(undefined, 1);
  assert.equal(latest[0].bookingId, "other-booking");
  assert.equal(latest.length, 1);
  const scoped = await repository.listBookingEmailAttention([booking.id], 500);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].bookingId, booking.id);
  assert.deepEqual(Object.keys(scoped[0]).sort(), ["audiences", "bookingId", "bookingReference", "count", "updatedAt"]);
  assert.doesNotMatch(JSON.stringify(scoped), /private-|customerName|customerPhone|payload|claim/i);
  assert.deepEqual(await repository.listBookingEmailAttention([]), []);
});

test("all quick-action surfaces retain version keys and durable warnings even when cancelled cards disappear", async () => {
  for (const path of ["src/app/cms/(protected)/page.tsx", "src/app/cms/(protected)/bookings/page.tsx", "src/app/cms/(protected)/calendar/page.tsx"]) {
    assert.match(await readFile(path, "utf8"), /<CmsBookingEmailAttentionNotice items=\{emailAttention\}/);
  }
  for (const path of ["src/app/cms/(protected)/page.tsx", "src/app/cms/(protected)/bookings/page.tsx", "src/components/cms/CmsCalendar.tsx"]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /key=\{`\$\{booking\.id\}:\$\{booking\.version\}`\}/);
    assert.match(source, /emailAttention=\{/);
  }
});
