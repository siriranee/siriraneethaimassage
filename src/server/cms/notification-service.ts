import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CmsBooking,
  CmsBookingNotification,
  CmsNotificationChannel,
  CmsNotificationKind,
} from "@/domain/cms/types";
import type {
  CustomerBookingCancellationEmailOutcome,
  CustomerBookingConfirmationEmailOutcome,
} from "@/domain/booking/confirmation-email";
import type { CustomerBookingEmailBusiness } from "@/server/booking/booking-email";
import { createSafePublicContentState } from "@/server/cms/default-content";
import type { CmsRepository } from "@/server/cms/repositories";
import {
  createCustomerBookingEmailBusiness,
  getCustomerBookingCancellationEmailDeliveryFingerprint,
  getCustomerBookingEmailDeliveryFingerprint,
  getOwnerBookingEmailDeliveryFingerprint,
  sendCustomerBookingCancelledEmail,
  sendCustomerBookingConfirmedEmail,
  sendOwnerBookingRequestedEmail,
  type BookingEmailSendResult,
  type CustomerBookingEmailFingerprinter,
  type CustomerBookingEmailSender,
  type OwnerBookingEmailFingerprinter,
  type OwnerBookingEmailSender,
  type OwnerBookingEmailSendResult,
} from "@/server/booking/resend-booking-email";

const maximumBookingEmailAttempts = 3;
const activeBookingEmailClaimLeaseMs = 30_000;
const resendIdempotencyWindowMs = 23 * 60 * 60 * 1_000;
const retryableFailedBookingEmailErrors = new Set([
  "booking-state-unavailable",
  "resend-configuration-missing",
  "resend-configuration-invalid",
  "resend-authentication-failed",
  "resend-rate-limited",
  "resend-provider-unavailable",
  "resend-message-rejected",
  "resend-provider-error",
]);
const retryableKnownUnsentBookingEmailErrors = new Set([
  "booking-state-unavailable",
  "resend-configuration-missing",
  "resend-configuration-invalid",
  "resend-authentication-failed",
  "resend-rate-limited",
  "resend-message-rejected",
  "resend-provider-error",
]);
const indeterminateBookingEmailErrors = new Set([
  "resend-timeout",
  "resend-network-error",
  "resend-unexpected-error",
  "resend-concurrent-idempotency",
]);
const immediateBookingEmailRetryErrors = new Set([
  "resend-rate-limited",
  "resend-provider-unavailable",
]);

export function ownerBookingRequestEmailNotificationId(bookingId: string) {
  return `owner-booking-requested:${bookingId}`;
}

export function customerBookingConfirmationEmailNotificationId(
  bookingId: string,
) {
  return `customer-booking-confirmed:${bookingId}`;
}

export function customerBookingCancellationEmailNotificationId(
  bookingId: string,
) {
  return `customer-booking-cancelled:${bookingId}`;
}

async function getCustomerBookingEmailBusiness(
  repository: CmsRepository,
): Promise<CustomerBookingEmailBusiness> {
  const publication = await repository.getPublishedContent();
  const content = publication?.snapshot ?? createSafePublicContentState();
  return createCustomerBookingEmailBusiness(content.site);
}

export function bookingNotificationKind(
  current: Pick<CmsBooking, "status" | "localDate" | "localTime"> | null,
  next: Pick<CmsBooking, "status" | "localDate" | "localTime">,
): CmsNotificationKind | null {
  if (!current) {
    return next.status === "confirmed" ? "booking-confirmed" : "booking-requested";
  }
  if (next.status !== current.status) {
    if (next.status === "confirmed") return "booking-confirmed";
    if (next.status === "cancelled") return "booking-cancelled";
    if (next.status === "completed") return "booking-completed";
    if (next.status === "no-show") return "booking-no-show";
  }
  if (next.localDate !== current.localDate || next.localTime !== current.localTime) {
    return "booking-rescheduled";
  }
  return null;
}

export async function recordBookingNotificationPlan(
  repository: CmsRepository,
  booking: CmsBooking,
  kind: CmsNotificationKind,
  options: {
    readonly channels?: readonly CmsNotificationChannel[];
  } = {},
) {
  const channels = options.channels ?? [
    "dashboard" as const,
    ...(booking.customer.email ? (["email"] as const) : []),
    ...(booking.customer.phone ? (["sms"] as const) : []),
  ];
  const now = new Date().toISOString();
  const notifications: CmsBookingNotification[] = [];
  for (const channel of channels) {
    if (
      channel === "email" &&
      (kind === "booking-confirmed" || kind === "booking-cancelled")
    ) {
      if (!booking.customer.email) continue;
      const business = await getCustomerBookingEmailBusiness(repository);
      const deliveryPayloadHash =
        kind === "booking-confirmed"
          ? getCustomerBookingEmailDeliveryFingerprint(booking, business)
          : getCustomerBookingCancellationEmailDeliveryFingerprint(
              booking,
              business,
            );
      const notification: CmsBookingNotification = {
        id:
          kind === "booking-confirmed"
            ? customerBookingConfirmationEmailNotificationId(booking.id)
            : customerBookingCancellationEmailNotificationId(booking.id),
        bookingId: booking.id,
        bookingReference: booking.reference,
        channel,
        audience: "customer",
        kind,
        status: "queued",
        provider: "resend",
        attemptCount: 0,
        ...(deliveryPayloadHash ? { deliveryPayloadHash } : {}),
        lastError: "",
        createdAt: now,
        updatedAt: now,
      };
      notifications.push(
        await repository.saveNotificationIfAbsent(notification),
      );
      continue;
    }

    const notification: CmsBookingNotification = {
      id: randomUUID(),
      bookingId: booking.id,
      bookingReference: booking.reference,
      channel,
      audience: channel === "dashboard" ? "owner" : "customer",
      kind,
      status: "preview",
      attemptCount: 0,
      lastError: "",
      createdAt: now,
      updatedAt: now,
    };
    await repository.saveNotification(notification);
    notifications.push(notification);
  }
  return notifications;
}

export async function recordOwnerBookingRequestEmail(
  repository: CmsRepository,
  booking: CmsBooking,
) {
  const deliveryPayloadHash = getOwnerBookingEmailDeliveryFingerprint(booking);
  if (!deliveryPayloadHash) {
    throw new Error("Resend booking email configuration is incomplete.");
  }
  const notification: CmsBookingNotification = {
    id: ownerBookingRequestEmailNotificationId(booking.id),
    bookingId: booking.id,
    bookingReference: booking.reference,
    channel: "email",
    audience: "owner",
    kind: "booking-requested",
    status: "queued",
    provider: "resend",
    attemptCount: 0,
    deliveryPayloadHash,
    lastError: "",
    createdAt: booking.createdAt,
    updatedAt: booking.createdAt,
  };
  return repository.saveNotificationIfAbsent(notification);
}

export async function ensureOwnerBookingRequestEmail(
  repository: CmsRepository,
  booking: CmsBooking,
) {
  const existing = await repository.getNotification(
    ownerBookingRequestEmailNotificationId(booking.id),
  );
  return existing ?? recordOwnerBookingRequestEmail(repository, booking);
}

function isWithinResendIdempotencyWindow(
  notification: CmsBookingNotification,
  now: number,
) {
  const lastAttempt = Date.parse(
    notification.firstAttemptedAt ?? "",
  );
  return (
    Number.isFinite(lastAttempt) &&
    now >= lastAttempt &&
    now - lastAttempt < resendIdempotencyWindowMs
  );
}

function canAttemptBookingEmail(
  notification: CmsBookingNotification,
  now: number,
) {
  if (
    notification.attemptCount >= maximumBookingEmailAttempts ||
    notification.status === "preview" ||
    notification.status === "sent"
  ) {
    return false;
  }
  if (notification.status === "queued" && notification.attemptCount === 0) {
    return true;
  }
  if (notification.status === "sending") {
    const claimedAt = Date.parse(notification.deliveryClaimedAt ?? "");
    return (
      isWithinResendIdempotencyWindow(notification, now) &&
      Number.isFinite(claimedAt) &&
      now - claimedAt >= activeBookingEmailClaimLeaseMs
    );
  }
  if (notification.status === "indeterminate") {
    return (
      isWithinResendIdempotencyWindow(notification, now) &&
      indeterminateBookingEmailErrors.has(notification.lastError)
    );
  }
  return (
    notification.status === "failed" &&
    retryableFailedBookingEmailErrors.has(notification.lastError) &&
    (isWithinResendIdempotencyWindow(notification, now) ||
      retryableKnownUnsentBookingEmailErrors.has(notification.lastError))
  );
}

export function shouldRetryOwnerBookingEmail(
  result: OwnerBookingEmailSendResult | null,
) {
  return (
    result?.status === "failed" &&
    immediateBookingEmailRetryErrors.has(result.errorCode)
  );
}

export function shouldRetryCustomerBookingEmail(
  result: BookingEmailSendResult | null,
) {
  return (
    result?.status === "failed" &&
    immediateBookingEmailRetryErrors.has(result.errorCode)
  );
}

type BookingEmailSender = (
  booking: CmsBooking,
) => Promise<BookingEmailSendResult>;

type BookingEmailFingerprinter = (booking: CmsBooking) => string | null;

type BookingEmailBookingRefresher = () => Promise<CmsBooking | null>;

type BookingEmailBookingValidator = (booking: CmsBooking) => string | null;

async function deliverBookingEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  notificationId: string,
  sender: BookingEmailSender,
  fingerprinter: BookingEmailFingerprinter,
  logLabel: string,
  refreshBooking?: BookingEmailBookingRefresher,
  validateBooking?: BookingEmailBookingValidator,
): Promise<BookingEmailSendResult | null> {
  const current = await repository.getNotification(notificationId);
  const now = Date.now();
  if (!current || !canAttemptBookingEmail(current, now)) return null;

  const claimId = randomUUID();
  const attemptedAt = new Date(now).toISOString();
  const firstAttemptedAt =
    current.status === "failed" &&
    retryableKnownUnsentBookingEmailErrors.has(current.lastError)
      ? attemptedAt
      : current.firstAttemptedAt ?? attemptedAt;
  const claimed = await repository.claimNotificationDelivery(
    current.id,
    current.status,
    current.attemptCount,
    current.deliveryClaimId,
    claimId,
    attemptedAt,
    firstAttemptedAt,
  );
  if (!claimed) return null;

  let result: BookingEmailSendResult;
  let deliveryBooking: CmsBooking | null = booking;
  if (refreshBooking) {
    try {
      deliveryBooking = await refreshBooking();
    } catch {
      deliveryBooking = null;
    }
  }
  const validationError = deliveryBooking
    ? validateBooking?.(deliveryBooking) ?? null
    : null;
  const currentPayloadHash = deliveryBooking && !validationError
    ? fingerprinter(deliveryBooking)
    : null;
  if (!deliveryBooking) {
    result = {
      status: "failed",
      attempted: false,
      errorCode: "booking-state-unavailable",
    };
  } else if (validationError) {
    result = {
      status: "failed",
      attempted: false,
      errorCode: validationError,
    };
  } else if (
    current.deliveryPayloadHash &&
    currentPayloadHash &&
    current.deliveryPayloadHash !== currentPayloadHash
  ) {
    result = {
      status: "failed",
      attempted: false,
      errorCode: "resend-payload-changed",
    };
  } else {
    try {
      result = await sender(deliveryBooking);
    } catch {
      result = {
        status: "failed",
        attempted: true,
        errorCode: "resend-unexpected-error",
      };
    }
  }

  const timestamp = new Date().toISOString();
  const updated = {
    ...claimed,
    status:
      result.status === "sent"
        ? ("sent" as const)
        : indeterminateBookingEmailErrors.has(result.errorCode)
          ? ("indeterminate" as const)
          : ("failed" as const),
    ...(result.status === "sent"
      ? {
          providerMessageId: result.providerMessageId,
          sentAt: timestamp,
          lastError: "",
        }
      : { lastError: result.errorCode.slice(0, 120) }),
    ...(!current.deliveryPayloadHash && currentPayloadHash
      ? { deliveryPayloadHash: currentPayloadHash }
      : {}),
    updatedAt: timestamp,
  };
  delete updated.deliveryClaimId;
  delete updated.deliveryClaimedAt;

  try {
    const completed = await repository.completeNotificationDelivery(
      updated,
      claimId,
    );
    if (!completed) {
      console.error(
        `Ignored a stale ${logLabel} result for booking ${booking.id}.`,
      );
    }
  } catch {
    console.error(
      `Failed to persist ${logLabel} status for booking ${booking.id}.`,
    );
  }

  return result;
}

export async function deliverOwnerBookingRequestEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  sender: OwnerBookingEmailSender = sendOwnerBookingRequestedEmail,
  fingerprinter: OwnerBookingEmailFingerprinter =
    getOwnerBookingEmailDeliveryFingerprint,
): Promise<OwnerBookingEmailSendResult | null> {
  return deliverBookingEmail(
    repository,
    booking,
    ownerBookingRequestEmailNotificationId(booking.id),
    sender,
    fingerprinter,
    "owner booking email",
  );
}

type CustomerBookingEmailDeliveryOptions = {
  readonly business?: CustomerBookingEmailBusiness;
  readonly sender?: CustomerBookingEmailSender;
  readonly fingerprinter?: CustomerBookingEmailFingerprinter;
};

export async function deliverCustomerBookingConfirmationEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  options: CustomerBookingEmailDeliveryOptions = {},
) {
  const business =
    options.business ?? (await getCustomerBookingEmailBusiness(repository));
  const sender = options.sender ?? sendCustomerBookingConfirmedEmail;
  const fingerprinter =
    options.fingerprinter ?? getCustomerBookingEmailDeliveryFingerprint;

  return deliverBookingEmail(
    repository,
    booking,
    customerBookingConfirmationEmailNotificationId(booking.id),
    (current) => sender(current, business),
    (current) => fingerprinter(current, business),
    "customer booking confirmation email",
    () => repository.getBooking(booking.id),
    (latest) => {
      if (latest.status !== "confirmed") return "booking-not-confirmed";
      if (!latest.customer.email) return "customer-email-missing";
      return null;
    },
  );
}

export async function deliverCustomerBookingCancellationEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  options: CustomerBookingEmailDeliveryOptions = {},
) {
  const business =
    options.business ?? (await getCustomerBookingEmailBusiness(repository));
  const sender = options.sender ?? sendCustomerBookingCancelledEmail;
  const fingerprinter =
    options.fingerprinter ??
    getCustomerBookingCancellationEmailDeliveryFingerprint;

  return deliverBookingEmail(
    repository,
    booking,
    customerBookingCancellationEmailNotificationId(booking.id),
    (current) => sender(current, business),
    (current) => fingerprinter(current, business),
    "customer booking cancellation email",
    () => repository.getBooking(booking.id),
    (latest) => {
      if (latest.status !== "cancelled") return "booking-not-cancelled";
      if (!latest.customer.email) return "customer-email-missing";
      return null;
    },
  );
}

export async function attemptCustomerBookingConfirmationEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  options: CustomerBookingEmailDeliveryOptions & {
    readonly retryDelayMs?: number;
  } = {},
): Promise<CustomerBookingConfirmationEmailOutcome> {
  if (booking.status !== "confirmed") {
    return { status: "skipped", reason: "booking-not-confirmed" };
  }
  if (!booking.customer.email) {
    return { status: "skipped", reason: "missing-customer-email" };
  }
  if (repository.mode === "mock" && !options.sender) {
    return { status: "skipped", reason: "mock-mode" };
  }

  try {
    let result = await deliverCustomerBookingConfirmationEmail(
      repository,
      booking,
      options,
    );
    if (shouldRetryCustomerBookingEmail(result)) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.max(0, options.retryDelayMs ?? 1_000));
      });
      result = await deliverCustomerBookingConfirmationEmail(
        repository,
        booking,
        options,
      );
    }

    if (result?.status === "sent") return { status: "sent" };
    const notification = await repository.getNotification(
      customerBookingConfirmationEmailNotificationId(booking.id),
    );
    if (notification?.status === "sent") return { status: "sent" };
    if (
      notification?.status === "indeterminate" ||
      notification?.status === "sending"
    ) {
      return { status: "indeterminate" };
    }
    if (notification?.status === "queued") return { status: "pending" };
    return { status: "failed" };
  } catch {
    console.error(
      `Failed to process the customer booking confirmation email for booking ${booking.id}.`,
    );
    return { status: "failed" };
  }
}

export async function attemptCustomerBookingCancellationEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  options: CustomerBookingEmailDeliveryOptions & {
    readonly retryDelayMs?: number;
  } = {},
): Promise<CustomerBookingCancellationEmailOutcome> {
  if (booking.status !== "cancelled") {
    return { status: "skipped", reason: "booking-not-cancelled" };
  }
  if (!booking.customer.email) {
    return { status: "skipped", reason: "missing-customer-email" };
  }
  if (repository.mode === "mock" && !options.sender) {
    return { status: "skipped", reason: "mock-mode" };
  }

  try {
    let result = await deliverCustomerBookingCancellationEmail(
      repository,
      booking,
      options,
    );
    if (shouldRetryCustomerBookingEmail(result)) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.max(0, options.retryDelayMs ?? 1_000));
      });
      result = await deliverCustomerBookingCancellationEmail(
        repository,
        booking,
        options,
      );
    }

    if (result?.status === "sent") return { status: "sent" };
    const notification = await repository.getNotification(
      customerBookingCancellationEmailNotificationId(booking.id),
    );
    if (notification?.status === "sent") return { status: "sent" };
    if (
      notification?.status === "indeterminate" ||
      notification?.status === "sending"
    ) {
      return { status: "indeterminate" };
    }
    if (notification?.status === "queued") return { status: "pending" };
    return { status: "failed" };
  } catch {
    console.error(
      `Failed to process the customer booking cancellation email for booking ${booking.id}.`,
    );
    return { status: "failed" };
  }
}

export function canRetryCustomerBookingConfirmationEmail(
  notification: CmsBookingNotification,
) {
  return (
    notification.audience === "customer" &&
    notification.channel === "email" &&
    notification.kind === "booking-confirmed" &&
    canAttemptBookingEmail(notification, Date.now())
  );
}

export function canRetryCustomerBookingCancellationEmail(
  notification: CmsBookingNotification,
) {
  return (
    notification.audience === "customer" &&
    notification.channel === "email" &&
    notification.kind === "booking-cancelled" &&
    canAttemptBookingEmail(notification, Date.now())
  );
}
