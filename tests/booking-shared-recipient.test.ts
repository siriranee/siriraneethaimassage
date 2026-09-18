import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";
import type { CustomerBookingEmailSender, TherapistBookingEmailSender } from "@/server/booking/resend-booking-email";

registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "server-only"
    ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
    : nextResolve(specifier, context);
} });

test("a shared owner/therapist inbox receives one message per event, with customer updates kept separate", async () => {
  Object.assign(process.env, {
    CMS_MODE: "mock", NODE_ENV: "test", RESEND_API_KEY: "re_test_shared_recipient_only",
    RESEND_FROM_EMAIL: "Test Spa <spa@example.invalid>", RESEND_BOOKING_TO_EMAIL: "owner@example.invalid",
    CMS_PII_ENCRYPTION_KEY: "22".repeat(32), NEXT_PUBLIC_SITE_URL: "https://example.invalid",
    RESEND_BASE_URL: "http://127.0.0.1:1",
  });
  for (const key of ["CI", "VERCEL", "NETLIFY"]) delete process.env[key];
  for (const key of ["__siriraneeCmsRepository", "__siriraneeCmsMockState", "__siriraneeCmsMockQueue"]) Reflect.deleteProperty(globalThis, key);
  const { getCmsRepository } = await import("@/server/cms/repositories");
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  const notifications = await import("@/server/cms/notification-service");
  const fixture = await prepareBookingSafetyFixture(getCmsRepository());
  await fixture.repository.saveTherapistContact({
    id: fixture.therapist.id, notificationEmail: " OWNER@EXAMPLE.INVALID ", contactPhone: "",
    version: 2, updatedAt: new Date().toISOString(), updatedBy: fixture.actor.id,
  }, 1);
  let booking = await createAdminBooking(fixture.input, fixture.context);
  booking = await fixture.repository.saveBooking({ ...booking, source: "website" }, booking.version);
  const calls: Array<{ audience: string; event: string; to: string }> = [];
  const sent = () => ({ status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() });
  const customer: CustomerBookingEmailSender = async (current) => {
    calls.push({ audience: "customer", event: current.status, to: current.customer.email.trim().toLowerCase() });
    return sent();
  };
  const therapist: TherapistBookingEmailSender = async (_current, recipient, event) => {
    calls.push({ audience: "therapist", event, to: recipient.notificationEmail.trim().toLowerCase() });
    return sent();
  };
  const options = {
    confirmation: { sender: customer }, cancellation: { sender: customer },
    reschedule: { sender: customer }, therapist: { sender: therapist },
  };
  await notifications.recordOwnerBookingRequestEmail(fixture.repository, booking);
  assert.deepEqual(
    await notifications.recordTherapistBookingEmailPlans(
      fixture.repository,
      null,
      booking,
    ),
    [],
  );
  const ownerSender = async () => {
    calls.push({ audience: "owner", event: "requested", to: "owner@example.invalid" });
    return sent();
  };
  await notifications.deliverOwnerBookingRequestEmail(fixture.repository, booking, ownerSender);
  await notifications.deliverOwnerBookingRequestEmail(fixture.repository, booking, ownerSender);
  await notifications.dispatchBookingMutationEmails(
    fixture.repository,
    null,
    booking,
    options,
  );
  assert.deepEqual(calls.map((call) => call.event), ["requested"]);
  let previous = booking;
  booking = await updateAdminBooking(booking.id, { status: "confirmed", changeReason: "customer-request" }, booking.version, fixture.context);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  assert.equal(calls.filter((call) => call.to === "owner@example.invalid").length, 2);
  assert.equal(calls.filter((call) => call.audience === "customer").length, 1);
  previous = booking;
  booking = await updateAdminBooking(booking.id, { internalNotes: "Private note only" }, booking.version, fixture.context);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  assert.equal(calls.length, 3);
  previous = booking;
  booking = await updateAdminBooking(booking.id, { localTime: "14:00", changeReason: "customer-request" }, booking.version, fixture.context);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  previous = booking;
  booking = await updateAdminBooking(booking.id, { status: "cancelled", changeReason: "customer-request" }, booking.version, fixture.context);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  await notifications.dispatchBookingMutationEmails(fixture.repository, previous, booking, options);
  assert.deepEqual(calls.filter((call) => call.to === "owner@example.invalid").map((call) => call.event), [
    "requested", "assigned", "rescheduled", "cancelled",
  ]);
  assert.equal(calls.filter((call) => call.audience === "customer").length, 3);
});
