import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
} from "resend";

import type { CmsBooking, CmsBookingNotification } from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories/repository";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: pathToFileURL(
          `${process.cwd()}/tests/support/server-only-stub.mjs`,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

function booking(customerEmail = "nok@example.com"): CmsBooking {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    reference: "SRN-20260910-ABC123",
    customer: {
      name: "Nok Example",
      phone: "+353 85 123 4567",
      email: customerEmail,
      notes: "Quiet room if possible.",
    },
    serviceId: "traditional-thai",
    serviceSlug: "traditional-thai-massage",
    serviceName: "Traditional Thai Massage",
    durationMinutes: 60,
    priceCents: 6500,
    currency: "EUR",
    startsAt: "2026-09-10T09:00:00.000Z",
    endsAt: "2026-09-10T10:00:00.000Z",
    localDate: "2026-09-10",
    localTime: "10:00",
    timezone: "Europe/Dublin",
    status: "pending",
    source: "website",
    assignedStaffId: "",
    assignedStaffName: "",
    internalNotes: "",
    privacyAcceptedAt: "2026-09-03T10:00:00.000Z",
    privacyNoticeVersion: "2026-09-03",
    idempotencyKeyHash: "hash",
    requestFingerprintHash: "fingerprint",
    demo: false,
    version: 1,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    updatedBy: "public-booking",
  };
}

const configuration = {
  apiKey: "re_test_booking_notifications_123456",
  from: "Siriranee Bookings <bookings@siriranee.example>",
  to: "owner@siriranee.example",
  siteOrigin: "https://siriranee.example",
};

const customerEmailBusiness = {
  name: "Siriranee Thai Massage",
  address: "Floor 3, Harbour House, Harbour Road, Howth, Dublin, Ireland",
  phone: "+353899484585",
  email: "hello@siriranee.com",
  arrivalGuidance: "Please arrive five minutes early.",
  directionsUrl: "https://maps.example/directions",
};

test("Resend owner booking email uses the owner address, reply-to and stable idempotency key", async () => {
  const {
    getOwnerBookingEmailDeliveryFingerprint,
    sendOwnerBookingRequestedEmail,
  } = await import(
    "@/server/booking/resend-booking-email"
  );
  let capturedPayload: Record<string, unknown> | undefined;
  let capturedOptions: Record<string, unknown> | undefined;
  const client = {
    emails: {
      async send(
        payload: CreateEmailOptions,
        options?: CreateEmailRequestOptions,
      ): Promise<CreateEmailResponse> {
        capturedPayload = payload as unknown as Record<string, unknown>;
        capturedOptions = options as Record<string, unknown> | undefined;
        return {
          data: { id: "resend-email-id" },
          error: null,
          headers: null,
        };
      },
    },
  };

  const result = await sendOwnerBookingRequestedEmail(booking(), {
    configuration,
    client,
  });

  assert.deepEqual(result, {
    status: "sent",
    attempted: true,
    providerMessageId: "resend-email-id",
  });
  assert.deepEqual(capturedPayload?.to, ["owner@siriranee.example"]);
  assert.equal(capturedPayload?.from, configuration.from);
  assert.equal(capturedPayload?.replyTo, "nok@example.com");
  assert.equal(
    capturedOptions?.idempotencyKey,
    "owner-booking-requested/11111111-2222-4333-8444-555555555555",
  );
  assert.match(String(capturedPayload?.html), /มีคำขอจองใหม่/);
  assert.match(String(capturedPayload?.text), /NEW BOOKING REQUEST/);
  const fingerprintOptions = {
    configuration,
    fingerprintSecret: "test-only-booking-fingerprint-secret",
  };
  const fingerprint = getOwnerBookingEmailDeliveryFingerprint(
    booking(),
    fingerprintOptions,
  );
  assert.equal(
    fingerprint,
    getOwnerBookingEmailDeliveryFingerprint(booking(), fingerprintOptions),
  );
  assert.notEqual(
    fingerprint,
    getOwnerBookingEmailDeliveryFingerprint(
      { ...booking(), version: 2, status: "confirmed" },
      fingerprintOptions,
    ),
  );
  assert.notEqual(
    fingerprint,
    getOwnerBookingEmailDeliveryFingerprint(booking(), {
      ...fingerprintOptions,
      configuration: {
        ...configuration,
        to: "another-owner@siriranee.example",
      },
    }),
  );
  assert.doesNotMatch(
    String(fingerprint),
    /Nok Example|nok@example\.com|353 85 123 4567/,
  );
});

test("Resend customer confirmation targets the customer with a stable, private payload", async () => {
  const {
    getCustomerBookingEmailDeliveryFingerprint,
    sendCustomerBookingConfirmedEmail,
  } = await import("@/server/booking/resend-booking-email");
  const confirmed = { ...booking(), status: "confirmed" as const };
  let capturedPayload: Record<string, unknown> | undefined;
  let capturedOptions: Record<string, unknown> | undefined;

  const result = await sendCustomerBookingConfirmedEmail(
    confirmed,
    customerEmailBusiness,
    {
      configuration,
      client: {
        emails: {
          async send(payload, options): Promise<CreateEmailResponse> {
            capturedPayload = payload as unknown as Record<string, unknown>;
            capturedOptions = options as Record<string, unknown> | undefined;
            return {
              data: { id: "customer-confirmation-id" },
              error: null,
              headers: null,
            };
          },
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "sent",
    attempted: true,
    providerMessageId: "customer-confirmation-id",
  });
  assert.deepEqual(capturedPayload?.to, ["nok@example.com"]);
  assert.equal(capturedPayload?.from, configuration.from);
  assert.equal(capturedPayload?.replyTo, "hello@siriranee.com");
  assert.equal(
    capturedOptions?.idempotencyKey,
    "customer-booking-confirmed/11111111-2222-4333-8444-555555555555",
  );
  assert.deepEqual(capturedPayload?.tags, [
    { name: "event", value: "booking-confirmed" },
    { name: "audience", value: "customer" },
  ]);
  assert.match(String(capturedPayload?.html), /Your appointment is confirmed/);
  assert.match(String(capturedPayload?.html), /https:\/\/siriranee\.example\/book\/status/);
  assert.doesNotMatch(
    `${String(capturedPayload?.html)}\n${String(capturedPayload?.text)}`,
    /Quiet room if possible|11111111-2222-4333-8444-555555555555/,
  );

  const fingerprintOptions = {
    configuration,
    fingerprintSecret: "test-only-customer-confirmation-secret",
  };
  const fingerprint = getCustomerBookingEmailDeliveryFingerprint(
    confirmed,
    customerEmailBusiness,
    fingerprintOptions,
  );
  assert.equal(
    fingerprint,
    getCustomerBookingEmailDeliveryFingerprint(
      {
        ...confirmed,
        version: 99,
        internalNotes: "Changed internally",
        customer: { ...confirmed.customer, notes: "Changed customer note" },
      },
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.notEqual(
    fingerprint,
    getCustomerBookingEmailDeliveryFingerprint(
      { ...confirmed, localTime: "10:30" },
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.doesNotMatch(String(fingerprint), /nok@example\.com|Nok Example/);
});

test("Resend customer cancellation uses its own stable idempotency key and private payload", async () => {
  const {
    getCustomerBookingCancellationEmailDeliveryFingerprint,
    getCustomerBookingEmailDeliveryFingerprint,
    sendCustomerBookingCancelledEmail,
  } = await import("@/server/booking/resend-booking-email");
  const cancelled = { ...booking(), status: "cancelled" as const };
  let capturedPayload: Record<string, unknown> | undefined;
  let capturedOptions: Record<string, unknown> | undefined;

  const result = await sendCustomerBookingCancelledEmail(
    cancelled,
    customerEmailBusiness,
    {
      configuration,
      client: {
        emails: {
          async send(payload, options): Promise<CreateEmailResponse> {
            capturedPayload = payload as unknown as Record<string, unknown>;
            capturedOptions = options as Record<string, unknown> | undefined;
            return {
              data: { id: "customer-cancellation-id" },
              error: null,
              headers: null,
            };
          },
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "sent",
    attempted: true,
    providerMessageId: "customer-cancellation-id",
  });
  assert.deepEqual(capturedPayload?.to, ["nok@example.com"]);
  assert.equal(capturedPayload?.from, configuration.from);
  assert.equal(capturedPayload?.replyTo, "hello@siriranee.com");
  assert.equal(
    capturedOptions?.idempotencyKey,
    "customer-booking-cancelled/11111111-2222-4333-8444-555555555555",
  );
  assert.deepEqual(capturedPayload?.tags, [
    { name: "event", value: "booking-cancelled" },
    { name: "audience", value: "customer" },
  ]);
  assert.match(String(capturedPayload?.html), /Your booking has been cancelled/);
  assert.match(
    String(capturedPayload?.html),
    /https:\/\/siriranee\.example\/book\/status\?reference=SRN-20260910-ABC123/,
  );
  assert.doesNotMatch(
    `${String(capturedPayload?.html)}\n${String(capturedPayload?.text)}`,
    /Quiet room if possible|11111111-2222-4333-8444-555555555555/,
  );

  const fingerprintOptions = {
    configuration,
    fingerprintSecret: "test-only-customer-cancellation-secret",
  };
  const fingerprint = getCustomerBookingCancellationEmailDeliveryFingerprint(
    cancelled,
    customerEmailBusiness,
    fingerprintOptions,
  );
  assert.equal(
    fingerprint,
    getCustomerBookingCancellationEmailDeliveryFingerprint(
      {
        ...cancelled,
        version: 99,
        internalNotes: "Changed internally",
        customer: { ...cancelled.customer, notes: "Changed customer note" },
      },
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.notEqual(
    fingerprint,
    getCustomerBookingCancellationEmailDeliveryFingerprint(
      { ...cancelled, localTime: "10:30" },
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.notEqual(
    fingerprint,
    getCustomerBookingEmailDeliveryFingerprint(
      { ...cancelled, status: "confirmed" },
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.doesNotMatch(String(fingerprint), /nok@example\.com|Nok Example/);
});

test("Resend therapist emails use a separate recipient, event key and privacy-minimised payload", async () => {
  const {
    getTherapistBookingEmailDeliveryFingerprint,
    sendTherapistBookingEmail,
  } = await import("@/server/booking/resend-booking-email");
  const confirmed = {
    ...booking(),
    status: "confirmed" as const,
    assignedStaffId: "therapist-waen",
    assignedStaffName: "Waen",
    internalNotes: "Private internal handling note.",
  };
  const recipient = {
    id: "therapist-waen",
    name: "Waen",
    notificationEmail: "waen.therapist@example.com",
  };
  const captured: Array<{
    payload: Record<string, unknown>;
    options: Record<string, unknown> | undefined;
  }> = [];
  const client = {
    emails: {
      async send(
        payload: CreateEmailOptions,
        options?: CreateEmailRequestOptions,
      ): Promise<CreateEmailResponse> {
        captured.push({
          payload: payload as unknown as Record<string, unknown>,
          options: options as Record<string, unknown> | undefined,
        });
        return {
          data: { id: `therapist-email-${captured.length}` },
          error: null,
          headers: null,
        };
      },
    },
  };

  assert.equal(
    (await sendTherapistBookingEmail(
      confirmed,
      recipient,
      "assigned",
      4,
      customerEmailBusiness,
      { configuration, client },
    )).status,
    "sent",
  );
  assert.equal(
    (await sendTherapistBookingEmail(
      { ...confirmed, localTime: "10:30" },
      recipient,
      "rescheduled",
      5,
      customerEmailBusiness,
      { configuration, client },
    )).status,
    "sent",
  );

  assert.equal(captured.length, 2);
  assert.deepEqual(captured[0]?.payload.to, [recipient.notificationEmail]);
  assert.equal(captured[0]?.payload.from, configuration.from);
  assert.equal(captured[0]?.payload.replyTo, customerEmailBusiness.email);
  assert.deepEqual(captured[0]?.payload.tags, [
    { name: "event", value: "booking-assigned" },
    { name: "audience", value: "therapist" },
  ]);
  assert.equal(
    captured[0]?.options?.idempotencyKey,
    "therapist-booking-assigned/11111111-2222-4333-8444-555555555555/therapist-waen/4",
  );
  assert.equal(
    captured[1]?.options?.idempotencyKey,
    "therapist-booking-rescheduled/11111111-2222-4333-8444-555555555555/therapist-waen/5",
  );
  assert.notEqual(
    captured[0]?.options?.idempotencyKey,
    captured[1]?.options?.idempotencyKey,
  );
  const rendered = `${String(captured[0]?.payload.html)}\n${String(captured[0]?.payload.text)}`;
  for (const expected of [
    "SRN-20260910-ABC123",
    "Traditional Thai Massage",
    "60 minutes",
    "Thursday 10 September 2026",
    "10:00 (Dublin time)",
    "https://siriranee.example/cms",
  ]) {
    assert.match(
      rendered,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  for (const forbidden of [
    "Nok Example",
    "nok@example.com",
    "+353 85 123 4567",
    "Quiet room if possible.",
    "Private internal handling note.",
  ]) {
    assert.doesNotMatch(
      rendered,
      new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  const fingerprintOptions = {
    configuration,
    fingerprintSecret: "test-only-therapist-email-secret",
  };
  const assignedFingerprint = getTherapistBookingEmailDeliveryFingerprint(
    confirmed,
    recipient,
    "assigned",
    4,
    customerEmailBusiness,
    fingerprintOptions,
  );
  assert.equal(
    assignedFingerprint,
    getTherapistBookingEmailDeliveryFingerprint(
      {
        ...confirmed,
        customer: {
          name: "Different customer",
          phone: "+353 1 000 0000",
          email: "different@example.com",
          notes: "Different private note",
        },
        internalNotes: "Different internal note",
      },
      recipient,
      "assigned",
      4,
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.notEqual(
    assignedFingerprint,
    getTherapistBookingEmailDeliveryFingerprint(
      confirmed,
      recipient,
      "rescheduled",
      4,
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.notEqual(
    assignedFingerprint,
    getTherapistBookingEmailDeliveryFingerprint(
      confirmed,
      recipient,
      "assigned",
      5,
      customerEmailBusiness,
      fingerprintOptions,
    ),
  );
  assert.doesNotMatch(
    String(assignedFingerprint),
    /waen\.therapist@example\.com|Nok Example|nok@example\.com/,
  );
});

test("customer confirmation refuses missing recipients and unconfirmed bookings", async () => {
  const { sendCustomerBookingConfirmedEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  let calls = 0;
  const client = {
    emails: {
      async send(): Promise<CreateEmailResponse> {
        calls += 1;
        return { data: { id: "must-not-send" }, error: null, headers: null };
      },
    },
  };

  assert.deepEqual(
    await sendCustomerBookingConfirmedEmail(
      { ...booking(""), status: "confirmed" },
      customerEmailBusiness,
      { configuration, client },
    ),
    {
      status: "failed",
      attempted: false,
      errorCode: "customer-email-missing",
    },
  );
  assert.deepEqual(
    await sendCustomerBookingConfirmedEmail(
      { ...booking("not-an-email"), status: "confirmed" },
      customerEmailBusiness,
      { configuration, client },
    ),
    {
      status: "failed",
      attempted: false,
      errorCode: "customer-email-invalid",
    },
  );
  assert.deepEqual(
    await sendCustomerBookingConfirmedEmail(
      booking(),
      customerEmailBusiness,
      { configuration, client },
    ),
    {
      status: "failed",
      attempted: false,
      errorCode: "booking-not-confirmed",
    },
  );
  assert.equal(calls, 0);
});

test("customer cancellation refuses missing recipients and active bookings", async () => {
  const { sendCustomerBookingCancelledEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  let calls = 0;
  const client = {
    emails: {
      async send(): Promise<CreateEmailResponse> {
        calls += 1;
        return { data: { id: "must-not-send" }, error: null, headers: null };
      },
    },
  };

  assert.deepEqual(
    await sendCustomerBookingCancelledEmail(
      { ...booking(""), status: "cancelled" },
      customerEmailBusiness,
      { configuration, client },
    ),
    {
      status: "failed",
      attempted: false,
      errorCode: "customer-email-missing",
    },
  );
  assert.deepEqual(
    await sendCustomerBookingCancelledEmail(
      { ...booking("not-an-email"), status: "cancelled" },
      customerEmailBusiness,
      { configuration, client },
    ),
    {
      status: "failed",
      attempted: false,
      errorCode: "customer-email-invalid",
    },
  );
  assert.deepEqual(
    await sendCustomerBookingCancelledEmail(
      booking(),
      customerEmailBusiness,
      { configuration, client },
    ),
    {
      status: "failed",
      attempted: false,
      errorCode: "booking-not-cancelled",
    },
  );
  assert.equal(calls, 0);
});

test("owner email is still sent when the customer did not provide an email", async () => {
  const { sendOwnerBookingRequestedEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  let capturedPayload: Record<string, unknown> | undefined;
  const result = await sendOwnerBookingRequestedEmail(booking(""), {
    configuration,
    client: {
      emails: {
        async send(payload: CreateEmailOptions): Promise<CreateEmailResponse> {
          capturedPayload = payload as unknown as Record<string, unknown>;
          return { data: { id: "owner-email-id" }, error: null, headers: null };
        },
      },
    },
  });

  assert.equal(result.status, "sent");
  assert.deepEqual(capturedPayload?.to, [configuration.to]);
  assert.equal("replyTo" in (capturedPayload ?? {}), false);
});

test("owner email links to the public site when the local CMS origin differs", async () => {
  const { sendOwnerBookingRequestedEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  let capturedPayload: Record<string, unknown> | undefined;

  const result = await sendOwnerBookingRequestedEmail(booking(), {
    environment: {
      RESEND_API_KEY: configuration.apiKey,
      RESEND_FROM_EMAIL: configuration.from,
      RESEND_BOOKING_TO_EMAIL: configuration.to,
      NEXT_PUBLIC_SITE_URL: "https://siriranee.example",
      CMS_ORIGIN: "http://localhost:3110",
    },
    client: {
      emails: {
        async send(payload: CreateEmailOptions): Promise<CreateEmailResponse> {
          capturedPayload = payload as unknown as Record<string, unknown>;
          return { data: { id: "owner-email-id" }, error: null, headers: null };
        },
      },
    },
  });

  assert.equal(result.status, "sent");
  assert.match(
    String(capturedPayload?.html),
    /https:\/\/siriranee\.example\/cms\/bookings\/11111111-2222-4333-8444-555555555555/,
  );
  assert.doesNotMatch(String(capturedPayload?.html), /localhost:3110/);
});

test("configuration and provider failures return safe codes without exposing provider messages", async () => {
  const { getResendBookingEmailReadiness, sendOwnerBookingRequestedEmail } =
    await import("@/server/booking/resend-booking-email");

  const readiness = getResendBookingEmailReadiness({
    RESEND_API_KEY: configuration.apiKey,
  });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing, [
    "RESEND_FROM_EMAIL",
    "RESEND_BOOKING_TO_EMAIL",
  ]);

  const result = await sendOwnerBookingRequestedEmail(booking(), {
    configuration,
    client: {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: {
              name: "invalid_api_key" as const,
              statusCode: 403,
              message: "Sensitive provider detail that must not be persisted",
            },
            headers: null,
          };
        },
      },
    },
  });

  assert.deepEqual(result, {
    status: "failed",
    attempted: true,
    errorCode: "resend-authentication-failed",
  });
  assert.doesNotMatch(JSON.stringify(result), /Sensitive provider detail/);

  const concurrent = await sendOwnerBookingRequestedEmail(booking(), {
    configuration,
    client: {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return {
            data: null,
            error: {
              name: "concurrent_idempotent_requests",
              statusCode: 409,
              message: "Another request with this key is still processing.",
            },
            headers: null,
          };
        },
      },
    },
  });
  assert.deepEqual(concurrent, {
    status: "failed",
    attempted: true,
    errorCode: "resend-concurrent-idempotency",
  });
});

test("missing configuration never contacts Resend and provider calls have a bounded wait", async () => {
  const { sendOwnerBookingRequestedEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  let called = false;
  const client = {
    emails: {
      async send(): Promise<CreateEmailResponse> {
        called = true;
        return { data: { id: "must-not-send" }, error: null, headers: null };
      },
    },
  };

  const unconfigured = await sendOwnerBookingRequestedEmail(booking(), {
    environment: {},
    client,
  });
  assert.deepEqual(unconfigured, {
    status: "failed",
    attempted: false,
    errorCode: "resend-configuration-missing",
  });
  assert.equal(called, false);

  const startedAt = Date.now();
  const timedOut = await sendOwnerBookingRequestedEmail(booking(), {
    configuration,
    timeoutMs: 10,
    client: {
      emails: {
        async send(): Promise<CreateEmailResponse> {
          return new Promise(() => undefined);
        },
      },
    },
  });
  assert.deepEqual(timedOut, {
    status: "failed",
    attempted: true,
    errorCode: "resend-timeout",
  });
  assert.ok(Date.now() - startedAt < 1_000);
});

test("delivery stores metadata only, recovers once, and never resends a sent alert", async () => {
  const { deliverOwnerBookingRequestEmail } = await import(
    "@/server/cms/notification-service"
  );
  const initial: CmsBookingNotification = {
    id: "owner-booking-requested:11111111-2222-4333-8444-555555555555",
    bookingId: "11111111-2222-4333-8444-555555555555",
    bookingReference: "SRN-20260910-ABC123",
    channel: "email",
    audience: "owner",
    kind: "booking-requested",
    status: "queued",
    provider: "resend",
    attemptCount: 0,
    lastError: "",
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
  };
  let saved: CmsBookingNotification = initial;
  const repository = {
    async getBooking() { return booking(); },
    async getNotification(id: string) {
      return saved.id === id ? saved : null;
    },
    async claimNotificationDelivery(
      id: string,
      expectedStatus: CmsBookingNotification["status"],
      expectedAttemptCount: number,
      expectedClaimId: string | undefined,
      claimId: string,
      attemptedAt: string,
      firstAttemptedAt: string,
    ) {
      if (
        saved.id !== id ||
        saved.status !== expectedStatus ||
        saved.attemptCount !== expectedAttemptCount ||
        saved.deliveryClaimId !== expectedClaimId
      ) {
        return null;
      }
      saved = {
        ...saved,
        status: "sending",
        attemptCount: saved.attemptCount + 1,
        firstAttemptedAt,
        attemptedAt,
        deliveryClaimId: claimId,
        deliveryClaimedAt: attemptedAt,
        updatedAt: attemptedAt,
      };
      return saved;
    },
    async completeNotificationDelivery(
      notification: CmsBookingNotification,
      claimId: string,
    ) {
      if (saved.deliveryClaimId !== claimId) return false;
      saved = notification;
      return true;
    },
  } as unknown as CmsRepository;

  const result = await deliverOwnerBookingRequestEmail(
    repository,
    booking(),
    async () => {
      throw new Error("owner@siriranee.example must not leak");
    },
  );

  assert.deepEqual(result, {
    status: "failed",
    attempted: true,
    errorCode: "resend-unexpected-error",
  });
  assert.equal(saved.status, "indeterminate");
  assert.equal(saved.attemptCount, 1);
  assert.equal(saved.lastError, "resend-unexpected-error");
  assert.doesNotMatch(JSON.stringify(saved), /owner@siriranee\.example|Nok Example|Quiet room/);

  const recovered = await deliverOwnerBookingRequestEmail(
    repository,
    booking(),
    async () => ({
      status: "sent",
      attempted: true,
      providerMessageId: "recovered-resend-id",
    }),
  );
  assert.deepEqual(recovered, {
    status: "sent",
    attempted: true,
    providerMessageId: "recovered-resend-id",
  });
  assert.equal(saved.status, "sent");
  assert.equal(saved.attemptCount, 2);
  assert.equal(saved.providerMessageId, "recovered-resend-id");

  let replaySenderCalled = false;
  const replay = await deliverOwnerBookingRequestEmail(
    repository,
    booking(),
    async () => {
      replaySenderCalled = true;
      return {
        status: "sent",
        attempted: true,
        providerMessageId: "must-not-send",
      };
    },
  );
  assert.equal(replay, null);
  assert.equal(replaySenderCalled, false);
});

test("delivery respects an active claim, the original idempotency window, and payload identity", async () => {
  const { MockCmsRepository } = await import(
    "@/server/cms/repositories/mock-repository"
  );
  const { deliverOwnerBookingRequestEmail } = await import(
    "@/server/cms/notification-service"
  );
  const repository = new MockCmsRepository();
  const currentBooking = booking();
  await repository.saveBooking(currentBooking);
  const now = new Date().toISOString();
  const notification: CmsBookingNotification = {
    id: `owner-booking-requested:${currentBooking.id}`,
    bookingId: currentBooking.id,
    bookingReference: currentBooking.reference,
    channel: "email",
    audience: "owner",
    kind: "booking-requested",
    status: "sending",
    provider: "resend",
    attemptCount: 1,
    firstAttemptedAt: now,
    attemptedAt: now,
    deliveryClaimId: "active-claim",
    deliveryClaimedAt: now,
    deliveryPayloadHash: "original-payload",
    lastError: "",
    createdAt: currentBooking.createdAt,
    updatedAt: now,
  };
  await repository.saveNotification(notification);

  let senderCalls = 0;
  const sender = async () => {
    senderCalls += 1;
    return {
      status: "sent" as const,
      attempted: true as const,
      providerMessageId: "unexpected-send",
    };
  };
  const activeClaimResult = await deliverOwnerBookingRequestEmail(
    repository,
    currentBooking,
    sender,
    () => "original-payload",
  );
  assert.equal(activeClaimResult, null);
  assert.equal(senderCalls, 0);

  await repository.saveNotification({
    ...notification,
    status: "indeterminate",
    attemptCount: 2,
    firstAttemptedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
    attemptedAt: now,
    deliveryClaimId: undefined,
    deliveryClaimedAt: undefined,
    lastError: "resend-timeout",
  });
  const expiredWindowResult = await deliverOwnerBookingRequestEmail(
    repository,
    currentBooking,
    sender,
    () => "original-payload",
  );
  assert.equal(expiredWindowResult, null);
  assert.equal(senderCalls, 0);

  await repository.saveNotification({
    ...notification,
    status: "queued",
    attemptCount: 0,
    firstAttemptedAt: undefined,
    attemptedAt: undefined,
    deliveryClaimId: undefined,
    deliveryClaimedAt: undefined,
    lastError: "",
  });
  const changedPayloadResult = await deliverOwnerBookingRequestEmail(
    repository,
    currentBooking,
    sender,
    () => "changed-payload",
  );
  assert.deepEqual(changedPayloadResult, {
    status: "failed",
    attempted: false,
    errorCode: "resend-payload-changed",
  });
  assert.equal(senderCalls, 0);
  const changedPayloadNotification = await repository.getNotification(
    notification.id,
  );
  assert.equal(changedPayloadNotification?.status, "failed");
  assert.equal(changedPayloadNotification?.lastError, "resend-payload-changed");
  assert.equal(changedPayloadNotification?.attemptCount, 1);
  assert.equal(changedPayloadNotification?.deliveryPayloadHash, "original-payload");
});

test("confirmed customer email uses one durable outbox record and cannot resend after acceptance", async () => {
  const { MockCmsRepository } = await import(
    "@/server/cms/repositories/mock-repository"
  );
  const {
    attemptCustomerBookingConfirmationEmail,
    customerBookingConfirmationEmailNotificationId,
    recordBookingNotificationPlan,
  } = await import("@/server/cms/notification-service");
  const repository = new MockCmsRepository();
  const confirmed: CmsBooking = {
    ...booking(),
    id: "88888888-2222-4333-8444-555555555555",
    reference: "SRN-20260910-OUTBOX1",
    status: "confirmed",
  };
  await repository.saveBooking(confirmed);

  await recordBookingNotificationPlan(
    repository,
    confirmed,
    "booking-confirmed",
  );
  await recordBookingNotificationPlan(
    repository,
    confirmed,
    "booking-confirmed",
  );
  const notificationId = customerBookingConfirmationEmailNotificationId(
    confirmed.id,
  );
  const planned = (await repository.listNotifications(confirmed.id, 100)).filter(
    (item) => item.id === notificationId,
  );
  assert.equal(planned.length, 1);
  assert.equal(planned[0]?.status, "queued");
  assert.equal(planned[0]?.audience, "customer");
  assert.equal(planned[0]?.provider, "resend");

  let senderCalls = 0;
  const options = {
    business: customerEmailBusiness,
    sender: async () => {
      senderCalls += 1;
      return {
        status: "sent" as const,
        attempted: true as const,
        providerMessageId: "accepted-once",
      };
    },
    fingerprinter: () => "customer-payload-fingerprint",
    retryDelayMs: 0,
  };
  assert.deepEqual(
    await attemptCustomerBookingConfirmationEmail(
      repository,
      confirmed,
      options,
    ),
    { status: "sent" },
  );
  assert.deepEqual(
    await attemptCustomerBookingConfirmationEmail(
      repository,
      confirmed,
      options,
    ),
    { status: "sent" },
  );
  assert.equal(senderCalls, 1);

  const saved = await repository.getNotification(notificationId);
  assert.equal(saved?.status, "sent");
  assert.equal(saved?.attemptCount, 1);
  assert.equal(saved?.providerMessageId, "accepted-once");
  assert.doesNotMatch(
    JSON.stringify(saved),
    /nok@example\.com|Nok Example|Quiet room if possible/,
  );
});

test("cancelled customer email has an independent durable outbox and cannot resend after acceptance", async () => {
  const { MockCmsRepository } = await import(
    "@/server/cms/repositories/mock-repository"
  );
  const {
    attemptCustomerBookingCancellationEmail,
    customerBookingCancellationEmailNotificationId,
    customerBookingConfirmationEmailNotificationId,
    recordBookingNotificationPlan,
  } = await import("@/server/cms/notification-service");
  const repository = new MockCmsRepository();
  const confirmed: CmsBooking = {
    ...booking(),
    id: "66666666-2222-4333-8444-555555555555",
    reference: "SRN-20260910-CANCEL1",
    status: "confirmed",
  };
  await repository.saveBooking(confirmed);
  await recordBookingNotificationPlan(
    repository,
    confirmed,
    "booking-confirmed",
  );

  const cancelled: CmsBooking = {
    ...confirmed,
    status: "cancelled",
    version: confirmed.version + 1,
  };
  await repository.saveBooking(cancelled, confirmed.version);
  await recordBookingNotificationPlan(
    repository,
    cancelled,
    "booking-cancelled",
  );
  await recordBookingNotificationPlan(
    repository,
    cancelled,
    "booking-cancelled",
  );

  const cancellationId = customerBookingCancellationEmailNotificationId(
    cancelled.id,
  );
  const notifications = await repository.listNotifications(cancelled.id, 100);
  assert.equal(
    notifications.filter((item) => item.id === cancellationId).length,
    1,
  );
  assert.ok(
    notifications.some(
      (item) =>
        item.id === customerBookingConfirmationEmailNotificationId(cancelled.id),
    ),
  );
  const planned = await repository.getNotification(cancellationId);
  assert.equal(planned?.status, "queued");
  assert.equal(planned?.kind, "booking-cancelled");
  assert.equal(planned?.audience, "customer");
  assert.equal(planned?.provider, "resend");

  let senderCalls = 0;
  const options = {
    business: customerEmailBusiness,
    sender: async () => {
      senderCalls += 1;
      return {
        status: "sent" as const,
        attempted: true as const,
        providerMessageId: "accepted-cancellation-once",
      };
    },
    fingerprinter: () => "customer-cancellation-payload-fingerprint",
    retryDelayMs: 0,
  };
  assert.deepEqual(
    await attemptCustomerBookingCancellationEmail(
      repository,
      cancelled,
      options,
    ),
    { status: "sent" },
  );
  assert.deepEqual(
    await attemptCustomerBookingCancellationEmail(
      repository,
      cancelled,
      options,
    ),
    { status: "sent" },
  );
  assert.equal(senderCalls, 1);

  const saved = await repository.getNotification(cancellationId);
  assert.equal(saved?.status, "sent");
  assert.equal(saved?.attemptCount, 1);
  assert.equal(saved?.providerMessageId, "accepted-cancellation-once");
  assert.doesNotMatch(
    JSON.stringify(saved),
    /nok@example\.com|Nok Example|Quiet room if possible/,
  );
});

test("customer delivery rechecks the stored booking after claiming the outbox", async () => {
  const { MockCmsRepository } = await import(
    "@/server/cms/repositories/mock-repository"
  );
  const {
    attemptCustomerBookingConfirmationEmail,
    customerBookingConfirmationEmailNotificationId,
    recordBookingNotificationPlan,
  } = await import("@/server/cms/notification-service");
  const repository = new MockCmsRepository();
  const confirmed: CmsBooking = {
    ...booking(),
    id: "77777777-2222-4333-8444-555555555555",
    reference: "SRN-20260910-STALE1",
    status: "confirmed",
  };
  await repository.saveBooking(confirmed);
  await recordBookingNotificationPlan(
    repository,
    confirmed,
    "booking-confirmed",
  );
  const claimThenCancelRepository = new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "claimNotificationDelivery") {
        return async (
          ...args: Parameters<CmsRepository["claimNotificationDelivery"]>
        ) => {
          const claimed = await target.claimNotificationDelivery(...args);
          if (claimed) {
            await target.saveBooking(
              {
                ...confirmed,
                status: "cancelled",
                version: confirmed.version + 1,
              },
              confirmed.version,
            );
          }
          return claimed;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as CmsRepository;

  let senderCalls = 0;
  const outcome = await attemptCustomerBookingConfirmationEmail(
    claimThenCancelRepository,
    confirmed,
    {
      business: customerEmailBusiness,
      sender: async () => {
        senderCalls += 1;
        return {
          status: "sent" as const,
          attempted: true as const,
          providerMessageId: "must-not-send-stale-booking",
        };
      },
      fingerprinter: () => "customer-payload-fingerprint",
      retryDelayMs: 0,
    },
  );

  assert.deepEqual(outcome, { status: "failed" });
  assert.equal(senderCalls, 0);
  const saved = await repository.getNotification(
    customerBookingConfirmationEmailNotificationId(confirmed.id),
  );
  assert.equal(saved?.status, "failed");
  assert.equal(saved?.lastError, "booking-not-confirmed");
});

test("a known-unsent retry starts a fresh uncertain-delivery window", async () => {
  const { MockCmsRepository } = await import(
    "@/server/cms/repositories/mock-repository"
  );
  const { deliverOwnerBookingRequestEmail } = await import(
    "@/server/cms/notification-service"
  );
  const repository = new MockCmsRepository();
  await repository.saveBooking(booking());
  const currentBooking = booking();
  const oldAttempt = "2026-01-01T00:00:00.000Z";
  await repository.saveNotification({
    id: `owner-booking-requested:${currentBooking.id}`,
    bookingId: currentBooking.id,
    bookingReference: currentBooking.reference,
    channel: "email",
    audience: "owner",
    kind: "booking-requested",
    status: "failed",
    provider: "resend",
    attemptCount: 1,
    firstAttemptedAt: oldAttempt,
    attemptedAt: oldAttempt,
    deliveryPayloadHash: "original-payload",
    lastError: "resend-message-rejected",
    createdAt: oldAttempt,
    updatedAt: oldAttempt,
  });

  const startedAt = Date.now();
  const result = await deliverOwnerBookingRequestEmail(
    repository,
    currentBooking,
    async () => ({
      status: "failed",
      attempted: true,
      errorCode: "resend-timeout",
    }),
    () => "original-payload",
  );
  assert.deepEqual(result, {
    status: "failed",
    attempted: true,
    errorCode: "resend-timeout",
  });
  const saved = await repository.getNotification(
    `owner-booking-requested:${currentBooking.id}`,
  );
  assert.equal(saved?.status, "indeterminate");
  assert.ok(Date.parse(saved?.firstAttemptedAt ?? "") >= startedAt);
});

test("installed Resend SDK keeps lost responses uncertain and distinguishes explicit rejections", async (t) => {
  const { sendOwnerBookingRequestedEmail } = await import("@/server/booking/resend-booking-email");
  const { canRetryBookingEmailNotification } = await import("@/server/cms/notification-service");
  const { isBookingEmailDeliveryUncertain } = await import("@/domain/booking/email-retry-policy");
  const expiredAt = new Date(Date.now() - 25 * 3600_000).toISOString();
  const cases = [
    { label: "lost socket", response: () => { throw new TypeError("Simulated response loss"); }, code: "resend-unexpected-error", retryExpired: false },
    { label: "truncated accepted JSON", response: () => new Response("{", { status: 200 }), code: "resend-unexpected-error", retryExpired: false },
    { label: "missing accepted ID", response: () => Response.json({}), code: "resend-unexpected-error", retryExpired: false },
    { label: "empty accepted ID", response: () => Response.json({ id: "  " }), code: "resend-unexpected-error", retryExpired: false },
    { label: "server failure", response: () => Response.json({ name: "application_error", statusCode: 503 }, { status: 503 }), code: "resend-provider-unavailable", retryExpired: false },
    { label: "generic provider failure", response: () => Response.json({ name: "application_error", statusCode: 409 }, { status: 409 }), code: "resend-provider-error", retryExpired: false },
    { label: "authentication rejected", response: () => Response.json({ name: "invalid_api_key", statusCode: 401 }, { status: 401 }), code: "resend-authentication-failed", retryExpired: true },
    { label: "rate limited", response: () => Response.json({ name: "rate_limit_exceeded", statusCode: 429 }, { status: 429 }), code: "resend-rate-limited", retryExpired: true },
    { label: "message rejected", response: () => Response.json({ name: "validation_error", statusCode: 422 }, { status: 422 }), code: "resend-message-rejected", retryExpired: true },
  ];
  let response: () => Response = () => { throw new Error("Unconfigured test response"); };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    // No real fetch is retained or called: every SDK request is intercepted.
    assert.equal(new URL(String(input)).pathname, "/emails");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${configuration.apiKey}`);
    calls += 1;
    return response();
  });
  for (const scenario of cases) {
    response = scenario.response;
    const result = await sendOwnerBookingRequestedEmail(booking(), { configuration });
    assert.equal(result.status, "failed", scenario.label);
    if (result.status !== "failed") assert.fail("Unexpected SDK result");
    assert.equal(result.errorCode, scenario.code, scenario.label);
    const notification: CmsBookingNotification = {
      id: `owner-booking-requested:${booking().id}`, bookingId: booking().id,
      bookingReference: booking().reference, channel: "email", audience: "owner",
      kind: "booking-requested", provider: "resend", status: "failed", attemptCount: 1,
      lastError: result.errorCode, firstAttemptedAt: expiredAt,
      createdAt: expiredAt, updatedAt: expiredAt,
    };
    assert.equal(canRetryBookingEmailNotification(notification), scenario.retryExpired, scenario.label);
    assert.equal(isBookingEmailDeliveryUncertain(notification), !scenario.retryExpired, scenario.label);
  }
  assert.equal(calls, cases.length);
});

test("SDK-shaped errors without an HTTP status cannot prove that a message was rejected", async () => {
  const { sendOwnerBookingRequestedEmail } = await import("@/server/booking/resend-booking-email");
  for (const statusCode of [null, undefined]) {
    const result = await sendOwnerBookingRequestedEmail(booking(), {
      configuration,
      client: { emails: { async send() {
        return { data: null, error: { name: "application_error", message: "Response unavailable", statusCode }, headers: null } as CreateEmailResponse;
      } } },
    });
    assert.deepEqual(result, { status: "failed", attempted: true, errorCode: "resend-unexpected-error" });
  }
});

test("actual SDK response loss persists an uncertain outbox until a safe retry returns its accepted ID", async (t) => {
  const { MockCmsRepository } = await import("@/server/cms/repositories/mock-repository");
  const { sendOwnerBookingRequestedEmail } = await import("@/server/booking/resend-booking-email");
  const { deliverOwnerBookingRequestEmail, canRetryBookingEmailNotification } = await import("@/server/cms/notification-service");
  const repository = new MockCmsRepository();
  const currentBooking = booking();
  await repository.saveBooking(currentBooking);
  const id = `owner-booking-requested:${currentBooking.id}`;
  await repository.saveNotification({
    id, bookingId: currentBooking.id, bookingReference: currentBooking.reference,
    channel: "email", audience: "owner", kind: "booking-requested", provider: "resend",
    status: "queued", attemptCount: 0, lastError: "", deliveryPayloadHash: "fixed-payload",
    createdAt: currentBooking.createdAt, updatedAt: currentBooking.createdAt,
  });
  const requests: { body: RequestInit["body"]; key: string | null }[] = [];
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    // Actual SDK, fully intercepted transport; never call a real provider.
    requests.push({ body: init?.body, key: new Headers(init?.headers).get("idempotency-key") });
    if (requests.length === 1) return new Response("{", { status: 200 });
    if (requests.length === 2) return Response.json({ name: "rate_limit_exceeded", statusCode: 429 }, { status: 429 });
    return Response.json({ id: "original-provider-message" });
  });
  const deliver = () => deliverOwnerBookingRequestEmail(repository, currentBooking,
    (latest) => sendOwnerBookingRequestedEmail(latest, { configuration }), () => "fixed-payload");
  await deliver();
  const uncertain = (await repository.getNotification(id))!;
  assert.equal(uncertain.status, "indeterminate");
  assert.equal(uncertain.lastError, "resend-unexpected-error");
  assert.equal(canRetryBookingEmailNotification(uncertain), true);
  await deliver();
  const rateLimited = (await repository.getNotification(id))!;
  assert.equal(rateLimited.status, "indeterminate");
  assert.equal(rateLimited.lastError, uncertain.lastError);
  assert.equal(rateLimited.firstAttemptedAt, uncertain.firstAttemptedAt);
  assert.equal(canRetryBookingEmailNotification({ ...rateLimited,
    firstAttemptedAt: new Date(Date.now() - 25 * 3600_000).toISOString() }), false);
  assert.equal((await deliver())?.status, "sent");
  const accepted = (await repository.getNotification(id))!;
  assert.equal(accepted.providerMessageId, "original-provider-message");
  assert.equal(accepted.lastError, "");
  assert.equal(accepted.firstAttemptedAt, uncertain.firstAttemptedAt);
  assert.equal(canRetryBookingEmailNotification(accepted), false);
  assert.equal(await deliver(), null);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(requests[2], requests[0]);
});

test("legacy generic SDK failures retain uncertainty and the original retry window across later failures", async () => {
  const { MockCmsRepository } = await import("@/server/cms/repositories/mock-repository");
  const { deliverOwnerBookingRequestEmail, canRetryBookingEmailNotification } = await import("@/server/cms/notification-service");
  const originalAttempt = new Date(Date.now() - 22 * 3600_000).toISOString();
  for (const laterError of ["resend-rate-limited", "resend-authentication-failed", "resend-message-rejected", "resend-configuration-missing", "booking-state-unavailable"]) {
    const repository = new MockCmsRepository();
    const currentBooking = booking();
    await repository.saveBooking(currentBooking);
    const initial: CmsBookingNotification = {
      id: `owner-booking-requested:${currentBooking.id}`, bookingId: currentBooking.id,
      bookingReference: currentBooking.reference, channel: "email", audience: "owner",
      kind: "booking-requested", provider: "resend", status: "failed", attemptCount: 1,
      firstAttemptedAt: originalAttempt, attemptedAt: originalAttempt,
      deliveryPayloadHash: "original-payload", lastError: "resend-provider-error",
      createdAt: originalAttempt, updatedAt: originalAttempt,
    };
    await repository.saveNotification(initial);
    assert.equal(canRetryBookingEmailNotification(initial), true);
    let calls = 0;
    if (laterError === "booking-state-unavailable") repository.getBooking = async () => null;
    await deliverOwnerBookingRequestEmail(repository, currentBooking, async () => {
      calls += 1;
      return { status: "failed", attempted: laterError !== "resend-configuration-missing", errorCode: laterError };
    }, () => "original-payload");
    const saved = (await repository.getNotification(initial.id))!;
    assert.equal(calls, laterError === "booking-state-unavailable" ? 0 : 1);
    assert.equal(saved.status, "indeterminate", laterError);
    assert.equal(saved.lastError, "resend-provider-error", laterError);
    assert.equal(saved.firstAttemptedAt, originalAttempt, laterError);
    assert.equal(saved.deliveryPayloadHash, initial.deliveryPayloadHash, laterError);
    assert.equal(canRetryBookingEmailNotification(saved), true);
    const expired = { ...saved, firstAttemptedAt: new Date(Date.now() - 25 * 3600_000).toISOString() };
    assert.equal(canRetryBookingEmailNotification(expired), false);
    await repository.saveNotification(expired);
    assert.equal(await deliverOwnerBookingRequestEmail(repository, currentBooking, async () => {
      assert.fail("Expired uncertain events must not reach a sender");
    }, () => "original-payload"), null);
  }
});

test("retry permits known-unsent failures but expires uncertain Resend outcomes", async () => {
  const { canRetryCustomerBookingConfirmationEmail } = await import(
    "@/server/cms/notification-service"
  );
  const oldAttempt = new Date(
    Date.now() - 24 * 60 * 60 * 1_000,
  ).toISOString();
  const base: CmsBookingNotification = {
    id: "customer-booking-confirmed:retry-policy",
    bookingId: "99999999-2222-4333-8444-555555555555",
    bookingReference: "SRN-20260910-RETRY1",
    channel: "email",
    audience: "customer",
    kind: "booking-confirmed",
    status: "failed",
    provider: "resend",
    attemptCount: 1,
    firstAttemptedAt: oldAttempt,
    attemptedAt: oldAttempt,
    lastError: "resend-message-rejected",
    createdAt: oldAttempt,
    updatedAt: oldAttempt,
  };

  assert.equal(canRetryCustomerBookingConfirmationEmail(base), true);
  assert.equal(
    canRetryCustomerBookingConfirmationEmail({
      ...base,
      status: "indeterminate",
      lastError: "resend-timeout",
    }),
    false,
  );
  assert.equal(
    canRetryCustomerBookingConfirmationEmail({
      ...base,
      status: "sent",
      lastError: "",
    }),
    false,
  );
});

test("customer appointment updates have their own versioned provider key and safe latest details", async () => {
  const { sendCustomerBookingRescheduledEmail, getCustomerBookingRescheduleEmailDeliveryFingerprint } =
    await import("@/server/booking/resend-booking-email");
  const updated = { ...booking(), status: "confirmed" as const, version: 3, localTime: "14:00", assignedStaffName: "Siriranee" };
  const requests: { payload: CreateEmailOptions; options?: CreateEmailRequestOptions }[] = [];
  for (const version of [3, 4]) {
    await sendCustomerBookingRescheduledEmail(updated, customerEmailBusiness, version, {
      configuration,
      client: { emails: { async send(payload, options) {
        requests.push({ payload, options });
        return { data: { id: `update-${version}` }, error: null, headers: null };
      } } },
    });
  }
  assert.deepEqual(requests.map((request) => request.options?.idempotencyKey), [
    `customer-booking-rescheduled/${updated.id}/3`, `customer-booking-rescheduled/${updated.id}/4`,
  ]);
  assert.deepEqual(requests[0].payload.to, [updated.customer.email]);
  assert.match(String(requests[0].payload.html), /details have changed/);
  assert.match(String(requests[0].payload.text), /replace the details in any earlier email/);
  assert.match(String(requests[0].payload.text), /14:00|Siriranee/);
  assert.doesNotMatch(String(requests[0].payload.text), /Quiet room|353 85|11111111-2222/);
  const dependencies = { configuration, fingerprintSecret: "safe-test-secret" };
  const hash = getCustomerBookingRescheduleEmailDeliveryFingerprint(updated, customerEmailBusiness, 3, dependencies);
  assert.notEqual(hash, getCustomerBookingRescheduleEmailDeliveryFingerprint(updated, customerEmailBusiness, 4, dependencies));
  assert.notEqual(hash, getCustomerBookingRescheduleEmailDeliveryFingerprint({ ...updated, localTime: "15:00" }, customerEmailBusiness, 3, dependencies));
});

async function emailWorkflowFixture() {
  const { MockCmsRepository } = await import("@/server/cms/repositories/mock-repository");
  delete (globalThis as { __siriraneeCmsMockState?: unknown }).__siriraneeCmsMockState;
  const repository = new MockCmsRepository();
  const content = await repository.getContent();
  const therapists = content.team.slice(0, 2);
  assert.equal(therapists.length, 2);
  for (const member of therapists) {
    await repository.saveTherapistContact({
      id: member.id, notificationEmail: `${member.id}@example.com`, contactPhone: "",
      version: 1, updatedAt: new Date().toISOString(), updatedBy: "test",
    });
  }
  const initial: CmsBooking = {
    ...booking(), assignedStaffId: therapists[0].id, assignedStaffName: therapists[0].name,
  };
  await repository.saveBooking(initial);
  const sent: string[] = [];
  const sender = (label: string) => async (current: CmsBooking) => {
    assert.equal((await repository.getBooking(current.id))?.status, current.status);
    sent.push(label);
    return { status: "sent" as const, attempted: true as const, providerMessageId: `fake-${sent.length}` };
  };
  const options = {
    confirmation: { business: customerEmailBusiness, sender: sender("customer-confirmed"), fingerprinter: () => "confirmation" },
    cancellation: { business: customerEmailBusiness, sender: sender("customer-cancelled"), fingerprinter: () => "cancellation" },
    reschedule: {
      business: customerEmailBusiness, sender: sender("customer-updated"),
      fingerprinter: (current: CmsBooking) => `update:${current.localDate}:${current.localTime}:${current.assignedStaffId}`,
    },
    therapist: {
      business: customerEmailBusiness,
      sender: async (current: CmsBooking, recipient: { id: string }, event: string) =>
        sender(`therapist-${event}:${recipient.id}`)(current),
      fingerprinter: (current: CmsBooking, recipient: { id: string }, event: string, version: number) =>
        `${event}:${version}:${recipient.id}:${current.localDate}:${current.localTime}`,
    },
  };
  return { repository, initial, therapists, options, sent };
}

test("post-commit dispatch sends separate customer and therapist updates for the full lifecycle exactly once", async () => {
  const { repository, initial, therapists, options, sent } = await emailWorkflowFixture();
  const { bookingNotificationKind, recordBookingNotificationPlan, recordTherapistBookingEmailPlans,
    dispatchBookingMutationEmails } = await import("@/server/cms/notification-service");
  async function transition(current: CmsBooking, next: CmsBooking) {
    await repository.saveBooking(next, current.version);
    const kind = bookingNotificationKind(current, next);
    assert.ok(kind);
    await recordBookingNotificationPlan(repository, next, kind);
    await recordTherapistBookingEmailPlans(repository, current, next);
    const outcome = await dispatchBookingMutationEmails(repository, current, next, options);
    assert.ok(outcome.therapistEmails.every((email) => email.status === "sent"));
    const count = sent.length;
    await dispatchBookingMutationEmails(repository, current, next, options);
    assert.equal(sent.length, count, "replaying a saved mutation must not resend accepted emails");
  }
  const confirmed: CmsBooking = { ...initial, status: "confirmed", version: 2 };
  await transition(initial, confirmed);
  const rescheduled = { ...confirmed, version: 3, localTime: "13:00" };
  await transition(confirmed, rescheduled);
  const reassigned = { ...rescheduled, version: 4, assignedStaffId: therapists[1].id, assignedStaffName: therapists[1].name };
  await transition(rescheduled, reassigned);
  const cancelled: CmsBooking = { ...reassigned, version: 5, status: "cancelled" };
  await transition(reassigned, cancelled);
  assert.deepEqual(sent, [
    "customer-confirmed", `therapist-assigned:${therapists[0].id}`,
    "customer-updated", `therapist-rescheduled:${therapists[0].id}`,
    "customer-updated", `therapist-removed:${therapists[0].id}`, `therapist-assigned:${therapists[1].id}`,
    "customer-cancelled", `therapist-cancelled:${therapists[1].id}`,
  ]);
  assert.doesNotMatch(JSON.stringify(await repository.listNotifications(initial.id, 100)), /nok@example|Nok Example|Quiet room|notificationEmail/);
});

test("owner retry rechecks status after claiming and cannot send an old request after confirmation", async () => {
  const { repository, initial } = await emailWorkflowFixture();
  const { deliverOwnerBookingRequestEmail, ownerBookingRequestEmailNotificationId } = await import("@/server/cms/notification-service");
  await repository.saveNotification({
    id: ownerBookingRequestEmailNotificationId(initial.id), bookingId: initial.id, bookingReference: initial.reference,
    channel: "email", audience: "owner", kind: "booking-requested", provider: "resend", status: "queued",
    attemptCount: 0, deliveryPayloadHash: "original", lastError: "", createdAt: initial.createdAt, updatedAt: initial.updatedAt,
  });
  const originalClaim = repository.claimNotificationDelivery.bind(repository);
  repository.claimNotificationDelivery = async (...args) => {
    const claim = await originalClaim(...args);
    await repository.saveBooking({ ...initial, status: "confirmed", version: 2 }, 1);
    return claim;
  };
  let calls = 0;
  const result = await deliverOwnerBookingRequestEmail(repository, initial, async () => {
    calls += 1;
    return { status: "sent", attempted: true, providerMessageId: "must-not-send" };
  }, () => "original");
  assert.equal(calls, 0);
  assert.deepEqual(result, { status: "failed", attempted: false, errorCode: "booking-not-pending" });
});

test("superseded customer and therapist events never send stale appointments", async () => {
  const { repository, initial, options, sent } = await emailWorkflowFixture();
  const { recordBookingNotificationPlan, recordTherapistBookingEmailPlans, deliverCustomerBookingRescheduleEmail,
    deliverTherapistBookingEmail } = await import("@/server/cms/notification-service");
  const first: CmsBooking = { ...initial, status: "confirmed", version: 2, localTime: "11:00" };
  const second = { ...first, version: 3, localTime: "12:00" };
  await repository.saveBooking(first, 1);
  await recordBookingNotificationPlan(repository, first, "booking-rescheduled");
  const [oldTherapistEvent] = await recordTherapistBookingEmailPlans(repository, initial, first);
  await repository.saveBooking(second, 2);
  await recordBookingNotificationPlan(repository, second, "booking-rescheduled");
  await recordTherapistBookingEmailPlans(repository, first, second);
  const customerResult = await deliverCustomerBookingRescheduleEmail(repository, first, 2, options.reschedule);
  const therapistResult = await deliverTherapistBookingEmail(repository, first, {
    event: "assigned", bookingVersion: 2, notificationId: oldTherapistEvent.id, targetTeamMemberId: initial.assignedStaffId,
  }, options.therapist);
  assert.equal(customerResult?.status === "failed" ? customerResult.errorCode : "", "booking-event-superseded");
  assert.equal(therapistResult?.status === "failed" ? therapistResult.errorCode : "", "booking-event-superseded");
  assert.equal(sent.length, 0);
});

test("new payload fingerprints persist before provider delivery and unchanged notes do not suppress a valid update", async () => {
  const { repository, initial, options } = await emailWorkflowFixture();
  const { recordBookingNotificationPlan, customerBookingRescheduleEmailNotificationId, deliverCustomerBookingRescheduleEmail } =
    await import("@/server/cms/notification-service");
  const updated: CmsBooking = { ...initial, status: "confirmed", version: 2, localTime: "14:00" };
  await repository.saveBooking(updated, 1);
  await recordBookingNotificationPlan(repository, updated, "booking-rescheduled");
  const id = customerBookingRescheduleEmailNotificationId(updated.id, 2);
  let sends = 0;
  const first = await deliverCustomerBookingRescheduleEmail(repository, updated, 2, {
    ...options.reschedule,
    sender: async () => {
      sends += 1;
      assert.equal((await repository.getNotification(id))?.deliveryPayloadHash, options.reschedule.fingerprinter(updated));
      return { status: "failed", attempted: true, errorCode: "resend-rate-limited" };
    },
  });
  assert.equal(first?.status, "failed");
  await repository.saveBooking({ ...updated, version: 3, internalNotes: "Staff note only" }, 2);
  const retry = await deliverCustomerBookingRescheduleEmail(repository, updated, 2, {
    ...options.reschedule,
    sender: async () => {
      sends += 1;
      return { status: "sent", attempted: true, providerMessageId: "notes-retry" };
    },
  });
  assert.equal(retry?.status, "sent");
  assert.equal(sends, 2);
});

test("uncertain delivery stays within its original window after a later booking lookup failure", async () => {
  const { repository, initial } = await emailWorkflowFixture();
  const { deliverOwnerBookingRequestEmail, ownerBookingRequestEmailNotificationId, canRetryBookingEmailNotification } =
    await import("@/server/cms/notification-service");
  const firstAttemptedAt = new Date(Date.now() - 22 * 60 * 60 * 1_000).toISOString();
  const id = ownerBookingRequestEmailNotificationId(initial.id);
  await repository.saveNotification({
    id, bookingId: initial.id, bookingReference: initial.reference, channel: "email", audience: "owner",
    kind: "booking-requested", status: "indeterminate", provider: "resend", attemptCount: 1,
    firstAttemptedAt, attemptedAt: firstAttemptedAt, lastError: "resend-timeout", deliveryPayloadHash: "bound",
    createdAt: firstAttemptedAt, updatedAt: firstAttemptedAt,
  });
  repository.getBooking = async () => { throw new Error("temporary lookup failure"); };
  await deliverOwnerBookingRequestEmail(repository, initial, async () => {
    assert.fail("lookup failure must not send");
  }, () => "bound");
  const saved = (await repository.getNotification(id))!;
  assert.equal(saved.status, "indeterminate");
  assert.equal(saved.firstAttemptedAt, firstAttemptedAt);
  assert.equal(saved.lastError, "resend-timeout");
  assert.equal(canRetryBookingEmailNotification({ ...saved, firstAttemptedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString() }), false);
  assert.equal(canRetryBookingEmailNotification({ ...saved, status: "failed", lastError: "resend-rate-limited", providerMessageId: "already-accepted" }), false);
});

test("therapist contact recovery binds the recipient and rejects recipient changes after an uncertain send", async () => {
  const { repository, initial, options } = await emailWorkflowFixture();
  const { recordTherapistBookingEmailPlans, getTherapistBookingEmailPlans, deliverTherapistBookingEmail } =
    await import("@/server/cms/notification-service");
  const confirmed: CmsBooking = { ...initial, version: 2, status: "confirmed" };
  await repository.saveBooking(confirmed, 1);
  const [notification] = await recordTherapistBookingEmailPlans(repository, initial, confirmed);
  const [plan] = getTherapistBookingEmailPlans(initial, confirmed);
  const originalGetContact = repository.getTherapistContact.bind(repository);
  repository.getTherapistContact = async () => null;
  let calls = 0;
  const deliveryOptions = {
    ...options.therapist,
    fingerprinter: (_booking: CmsBooking, recipient: { notificationEmail: string }) => `recipient:${recipient.notificationEmail}`,
    sender: async () => {
      calls += 1;
      assert.ok((await repository.getNotification(notification.id))?.deliveryPayloadHash);
      return { status: "failed" as const, attempted: true, errorCode: "resend-timeout" };
    },
  };
  const missing = await deliverTherapistBookingEmail(repository, confirmed, plan, deliveryOptions);
  assert.equal(missing?.status === "failed" ? missing.errorCode : "", "therapist-contact-unavailable");
  assert.equal(calls, 0);
  repository.getTherapistContact = originalGetContact;
  await deliverTherapistBookingEmail(repository, confirmed, plan, deliveryOptions);
  assert.equal(calls, 1);
  const contact = (await originalGetContact(initial.assignedStaffId))!;
  await repository.saveTherapistContact({ ...contact, notificationEmail: "changed@example.com", version: contact.version + 1 }, contact.version);
  const changed = await deliverTherapistBookingEmail(repository, confirmed, plan, deliveryOptions);
  assert.equal(changed?.status === "failed" ? changed.errorCode : "", "resend-payload-changed");
  assert.equal(calls, 1);
  assert.equal((await repository.getNotification(notification.id))?.status, "indeterminate");
});
