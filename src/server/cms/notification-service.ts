import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CmsBooking,
  CmsBookingNotification,
  CmsNotificationChannel,
  CmsNotificationKind,
} from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories";
import {
  getOwnerBookingEmailDeliveryFingerprint,
  sendOwnerBookingRequestedEmail,
  type OwnerBookingEmailFingerprinter,
  type OwnerBookingEmailSender,
  type OwnerBookingEmailSendResult,
} from "@/server/booking/resend-booking-email";

const maximumAutomaticOwnerEmailAttempts = 3;
const activeOwnerEmailClaimLeaseMs = 10_000;
const resendIdempotencyWindowMs = 23 * 60 * 60 * 1_000;
const retryableOwnerEmailErrors = new Set([
  "resend-rate-limited",
  "resend-provider-unavailable",
  "resend-timeout",
  "resend-network-error",
  "resend-unexpected-error",
  "resend-concurrent-idempotency",
]);
const indeterminateOwnerEmailErrors = new Set([
  "resend-timeout",
  "resend-network-error",
  "resend-unexpected-error",
  "resend-concurrent-idempotency",
]);
const immediateOwnerEmailRetryErrors = new Set([
  "resend-rate-limited",
  "resend-provider-unavailable",
]);

export function ownerBookingRequestEmailNotificationId(bookingId: string) {
  return `owner-booking-requested:${bookingId}`;
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
  const notifications: CmsBookingNotification[] = channels.map((channel) => ({
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
  }));
  for (const notification of notifications) {
    await repository.saveNotification(notification);
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

function canAttemptOwnerEmail(
  notification: CmsBookingNotification,
  now: number,
) {
  if (
    notification.attemptCount >= maximumAutomaticOwnerEmailAttempts ||
    notification.status === "preview" ||
    notification.status === "sent"
  ) {
    return false;
  }
  if (notification.status === "queued" && notification.attemptCount === 0) {
    return true;
  }
  if (!isWithinResendIdempotencyWindow(notification, now)) return false;
  if (notification.status === "sending") {
    const claimedAt = Date.parse(notification.deliveryClaimedAt ?? "");
    return (
      Number.isFinite(claimedAt) &&
      now - claimedAt >= activeOwnerEmailClaimLeaseMs
    );
  }
  return (
    (notification.status === "failed" ||
      notification.status === "indeterminate") &&
    retryableOwnerEmailErrors.has(notification.lastError)
  );
}

export function shouldRetryOwnerBookingEmail(
  result: OwnerBookingEmailSendResult | null,
) {
  return (
    result?.status === "failed" &&
    immediateOwnerEmailRetryErrors.has(result.errorCode)
  );
}

export async function deliverOwnerBookingRequestEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  sender: OwnerBookingEmailSender = sendOwnerBookingRequestedEmail,
  fingerprinter: OwnerBookingEmailFingerprinter =
    getOwnerBookingEmailDeliveryFingerprint,
): Promise<OwnerBookingEmailSendResult | null> {
  const current = await repository.getNotification(
    ownerBookingRequestEmailNotificationId(booking.id),
  );
  const now = Date.now();
  if (!current || !canAttemptOwnerEmail(current, now)) return null;

  const claimId = randomUUID();
  const attemptedAt = new Date(now).toISOString();
  const firstAttemptedAt = current.firstAttemptedAt ?? attemptedAt;
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

  let result: OwnerBookingEmailSendResult;
  const currentPayloadHash = fingerprinter(booking);
  if (
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
      result = await sender(booking);
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
        : indeterminateOwnerEmailErrors.has(result.errorCode)
          ? ("indeterminate" as const)
          : ("failed" as const),
    ...(result.status === "sent"
      ? {
          providerMessageId: result.providerMessageId,
          sentAt: timestamp,
          lastError: "",
        }
      : { lastError: result.errorCode.slice(0, 120) }),
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
        `Ignored a stale owner booking email result for booking ${booking.id}.`,
      );
    }
  } catch {
    console.error(
      `Failed to persist owner booking email status for booking ${booking.id}.`,
    );
  }

  return result;
}
