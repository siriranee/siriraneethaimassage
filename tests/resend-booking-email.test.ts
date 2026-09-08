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
    capacityExpiresAt: "2026-09-03T10:30:00.000Z",
    assignedStaffId: "",
    internalNotes: "",
    privacyAcceptedAt: "2026-09-03T10:00:00.000Z",
    privacyNoticeVersion: "2026-09-03",
    holdTokenHash: "",
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
  } as CmsRepository;

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
