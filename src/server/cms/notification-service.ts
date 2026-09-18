import "server-only";

import { randomUUID } from "node:crypto";

import {
  captureTherapistRemovedAppointment,
  readTherapistRemovedAppointment,
  withTherapistRemovedAppointment,
} from "@/domain/booking/therapist-removed-appointment";

import {
  bookingEmailMaximumAttempts,
  bookingEmailClaimLeaseMs,
  bookingEmailIdempotencyWindowMs,
  bookingEmailRetryableFailureCodes,
  bookingEmailKnownUnsentFailureCodes,
  bookingEmailIndeterminateFailureCodes,
  isBookingEmailDeliveryUncertain,
} from "@/domain/booking/email-retry-policy";

import type {
  CmsBooking,
  CmsBookingNotification,
  CmsNotificationChannel,
  CmsNotificationKind,
} from "@/domain/cms/types";
import type {
  CustomerBookingCancellationEmailOutcome,
  CustomerBookingConfirmationEmailOutcome,
  CustomerBookingRescheduleEmailOutcome,
} from "@/domain/booking/confirmation-email";
import type { CustomerBookingEmailBusiness } from "@/server/booking/booking-email";
import type { TherapistBookingEmailEvent } from "@/server/booking/booking-email";
import { createSafePublicContentState } from "@/server/cms/default-content";
import type { CmsRepository } from "@/server/cms/repositories";
import {
  createCustomerBookingEmailBusiness,
  getCustomerBookingCancellationEmailDeliveryFingerprint,
  getCustomerBookingEmailDeliveryFingerprint,
  getCustomerBookingRescheduleEmailDeliveryFingerprint,
  getOwnerBookingEmailDeliveryFingerprint,
  isOwnerBookingEmailDeliveryFingerprintCompatible,
  getTherapistBookingEmailDeliveryFingerprint,
  isOwnerBookingEmailRecipient,
  sendCustomerBookingCancelledEmail,
  sendCustomerBookingConfirmedEmail,
  sendCustomerBookingRescheduledEmail,
  sendOwnerBookingRequestedEmail,
  sendTherapistBookingEmail,
  type BookingEmailSendResult,
  type CustomerBookingEmailFingerprinter,
  type CustomerBookingEmailSender,
  type CustomerBookingRescheduleEmailSender,
  type CustomerBookingRescheduleEmailFingerprinter,
  type OwnerBookingEmailFingerprinter,
  type OwnerBookingEmailFingerprintCompatibility,
  type OwnerBookingEmailSender,
  type OwnerBookingEmailSendResult,
  type TherapistBookingEmailRecipient,
  type TherapistBookingEmailSender,
  type TherapistBookingEmailFingerprinter,
} from "@/server/booking/resend-booking-email";

const retryableFailedBookingEmailErrors = new Set<string>(bookingEmailRetryableFailureCodes);
const retryableKnownUnsentBookingEmailErrors = new Set<string>(bookingEmailKnownUnsentFailureCodes);
const indeterminateBookingEmailErrors = new Set<string>(bookingEmailIndeterminateFailureCodes);
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

export function customerBookingRescheduleEmailNotificationId(
  bookingId: string,
  bookingVersion: number,
) {
  return `customer-booking-rescheduled:${bookingId}:${bookingVersion}`;
}

export type TherapistBookingEmailPlan = {
  readonly event: TherapistBookingEmailEvent;
  readonly targetTeamMemberId: string;
  readonly bookingVersion: number;
  readonly notificationId: string;
};

export type TherapistBookingEmailOutcome = TherapistBookingEmailPlan & {
  readonly status:
    | "sent"
    | "pending"
    | "failed"
    | "indeterminate"
    | "skipped";
  readonly reason?:
    | "mock-mode"
    | "therapist-contact-unavailable"
    | "booking-state-changed";
};

export function therapistBookingEmailNotificationId(
  event: TherapistBookingEmailEvent,
  bookingId: string,
  therapistId: string,
  bookingVersion: number,
) {
  return `therapist-booking-${event}:${bookingId}:${therapistId}:${bookingVersion}`;
}

function therapistNotificationKind(
  event: TherapistBookingEmailEvent,
): CmsNotificationKind {
  if (event === "requested") return "booking-requested";
  if (event === "request-updated") return "booking-request-updated";
  if (event === "request-withdrawn") return "booking-request-withdrawn";
  if (event === "assigned") return "booking-assigned";
  if (event === "removed") return "booking-unassigned";
  if (event === "rescheduled") return "booking-rescheduled";
  return "booking-cancelled";
}

export function getTherapistBookingEmailPlans(
  current: CmsBooking | null,
  next: CmsBooking,
): readonly TherapistBookingEmailPlan[] {
  const createPlan = (
    event: TherapistBookingEmailEvent,
    targetTeamMemberId: string,
  ): TherapistBookingEmailPlan => ({
    event,
    targetTeamMemberId,
    bookingVersion: next.version,
    notificationId: therapistBookingEmailNotificationId(
      event,
      next.id,
      targetTeamMemberId,
      next.version,
    ),
  });
  const currentTherapistId = current?.assignedStaffId.trim() ?? "";
  const nextTherapistId = next.assignedStaffId.trim();

  if (!current) {
    if (!nextTherapistId) return [];
    if (next.source === "website" && next.status === "pending") {
      return [createPlan("requested", nextTherapistId)];
    }
    return next.status === "confirmed"
      ? [createPlan("assigned", nextTherapistId)]
      : [];
  }

  if (current.source === "website" && current.status === "pending") {
    const reassigned = currentTherapistId !== nextTherapistId;
    const withdrawCurrent = currentTherapistId
      ? [createPlan("request-withdrawn", currentTherapistId)]
      : [];

    if (next.status === "cancelled") return withdrawCurrent;

    if (next.status === "pending") {
      if (reassigned) {
        return [
          ...withdrawCurrent,
          ...(nextTherapistId
            ? [createPlan("requested", nextTherapistId)]
            : []),
        ];
      }
      return bookingAppointmentDetailsChanged(current, next) && nextTherapistId
        ? [createPlan("request-updated", nextTherapistId)]
        : [];
    }

    if (next.status === "confirmed") {
      return [
        ...(reassigned ? withdrawCurrent : []),
        ...(nextTherapistId
          ? [createPlan("assigned", nextTherapistId)]
          : []),
      ];
    }
  }

  if (current.status === "confirmed" && next.status === "cancelled") {
    return currentTherapistId
      ? [createPlan("cancelled", currentTherapistId)]
      : [];
  }

  if (next.status !== "confirmed") return [];

  if (current.status !== "confirmed") {
    return nextTherapistId
      ? [createPlan("assigned", nextTherapistId)]
      : [];
  }

  if (currentTherapistId !== nextTherapistId) {
    return [
      ...(currentTherapistId
        ? [createPlan("removed", currentTherapistId)]
        : []),
      ...(nextTherapistId
        ? [createPlan("assigned", nextTherapistId)]
        : []),
    ];
  }

  const rescheduled = bookingAppointmentDetailsChanged(current, next);
  return rescheduled && nextTherapistId
    ? [createPlan("rescheduled", nextTherapistId)]
    : [];
}

async function getCustomerBookingEmailBusiness(
  repository: CmsRepository,
): Promise<CustomerBookingEmailBusiness> {
  const publication = await repository.getPublishedContent();
  const content = publication?.snapshot ?? createSafePublicContentState();
  return createCustomerBookingEmailBusiness(content.site);
}

async function getTherapistBookingEmailRecipient(
  repository: CmsRepository,
  teamMemberId: string,
): Promise<TherapistBookingEmailRecipient | null> {
  const [content, contact] = await Promise.all([
    repository.getContent(),
    repository.getTherapistContact(teamMemberId),
  ]);
  const member = content.team.find((candidate) => candidate.id === teamMemberId);
  if (!member || !contact) return null;

  return {
    id: member.id,
    name: member.name,
    notificationEmail: contact.notificationEmail,
  };
}

export async function recordTherapistBookingEmailPlans(
  repository: CmsRepository,
  current: CmsBooking | null,
  next: CmsBooking,
) {
  const plans = getTherapistBookingEmailPlans(current, next);
  if (!plans.length) return [];

  let business: CustomerBookingEmailBusiness | null = null;
  try {
    business = await getCustomerBookingEmailBusiness(repository);
  } catch {
    // The durable event is still recorded. Delivery can resolve the current
    // public business details after it has claimed the event.
  }
  const now = new Date().toISOString();
  const notifications: CmsBookingNotification[] = [];

  for (const plan of plans) {
    const historicalAppointment =
      (plan.event === "removed" || plan.event === "request-withdrawn") && current
      ? captureTherapistRemovedAppointment(current) : undefined;
    const deliveryBooking = historicalAppointment
      ? withTherapistRemovedAppointment(next, historicalAppointment) : next;
    let recipient: TherapistBookingEmailRecipient | null = null;
    try {
      recipient = await getTherapistBookingEmailRecipient(
        repository,
        plan.targetTeamMemberId,
      );
    } catch {
      // A missing or temporarily unavailable private contact must not erase
      // the booking transition. It will be checked again at delivery time.
    }
    if (
      plan.event === "requested" &&
      !current &&
      recipient &&
      isOwnerBookingEmailRecipient(recipient.notificationEmail)
    ) {
      // The owner message contains the same request plus the secure confirmation
      // action. When both roles share one inbox, keep that richer single email.
      continue;
    }
    const deliveryPayloadHash = recipient && business
      ? getTherapistBookingEmailDeliveryFingerprint(
          deliveryBooking,
          recipient,
          plan.event,
          plan.bookingVersion,
          business,
          { confirmationIssuedAt: now },
        )
      : null;
    const notification: CmsBookingNotification = {
      id: plan.notificationId,
      bookingId: next.id,
      bookingReference: next.reference,
      channel: "email",
      audience: "therapist",
      targetTeamMemberId: plan.targetTeamMemberId,
      bookingVersion: plan.bookingVersion,
      ...(historicalAppointment
        ? { therapistRemovedAppointment: historicalAppointment }
        : {}),
      kind: therapistNotificationKind(plan.event),
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
  }

  return notifications;
}

type BookingNotificationState = Pick<CmsBooking, "status" | "localDate" | "localTime"> &
  Partial<Pick<CmsBooking, "assignedStaffId" | "serviceId" | "durationMinutes">>;

function bookingAppointmentDetailsChanged(
  current: BookingNotificationState,
  next: BookingNotificationState,
) {
  return current.localDate !== next.localDate || current.localTime !== next.localTime ||
    current.assignedStaffId !== next.assignedStaffId ||
    current.serviceId !== next.serviceId || current.durationMinutes !== next.durationMinutes;
}

export function bookingNotificationKind(
  current: BookingNotificationState | null,
  next: BookingNotificationState,
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
  if (bookingAppointmentDetailsChanged(current, next)) {
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
      (kind === "booking-confirmed" || kind === "booking-cancelled" ||
        (kind === "booking-rescheduled" && booking.status === "confirmed"))
    ) {
      if (!booking.customer.email) continue;
      const business = await getCustomerBookingEmailBusiness(repository);
      const deliveryPayloadHash =
        kind === "booking-confirmed"
          ? getCustomerBookingEmailDeliveryFingerprint(booking, business)
          : kind === "booking-rescheduled"
            ? getCustomerBookingRescheduleEmailDeliveryFingerprint(booking, business, booking.version)
            : getCustomerBookingCancellationEmailDeliveryFingerprint(
              booking,
              business,
            );
      const notification: CmsBookingNotification = {
        id:
          kind === "booking-confirmed"
            ? customerBookingConfirmationEmailNotificationId(booking.id)
            : kind === "booking-rescheduled"
              ? customerBookingRescheduleEmailNotificationId(booking.id, booking.version)
              : customerBookingCancellationEmailNotificationId(booking.id),
        bookingId: booking.id,
        bookingReference: booking.reference,
        channel,
        audience: "customer",
        bookingVersion: booking.version,
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
    bookingVersion: booking.version,
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
    now - lastAttempt < bookingEmailIdempotencyWindowMs
  );
}

function canAttemptBookingEmail(
  notification: CmsBookingNotification,
  now: number,
) {
  if (
    notification.attemptCount >= bookingEmailMaximumAttempts ||
    Boolean(notification.providerMessageId) ||
    Boolean(notification.deliveryStatus) ||
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
      now - claimedAt >= bookingEmailClaimLeaseMs
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

type BookingEmailBookingRefresher = () => Promise<CmsBooking | null>;

type BookingEmailBookingValidator = (booking: CmsBooking) => string | null;

type BookingEmailDeliveryOptions<TContext> = {
  readonly refreshBooking?: BookingEmailBookingRefresher;
  readonly validateBooking?: BookingEmailBookingValidator;
  readonly refreshContext?: () => Promise<TContext | null>;
  readonly validateContext?: (
    booking: CmsBooking,
    context: TContext,
  ) => string | null;
  readonly contextUnavailableError?: string;
  readonly isCompatiblePayload?: (
    notification: CmsBookingNotification,
    booking: CmsBooking,
    context: TContext,
  ) => boolean;
};

async function deliverBookingEmail<TContext = undefined>(
  repository: CmsRepository,
  booking: CmsBooking,
  notificationId: string,
  sender: (
    booking: CmsBooking,
    context: TContext,
  ) => Promise<BookingEmailSendResult>,
  fingerprinter: (booking: CmsBooking, context: TContext) => string | null,
  logLabel: string,
  options: BookingEmailDeliveryOptions<TContext> = {},
): Promise<BookingEmailSendResult | null> {
  const current = await repository.getNotification(notificationId);
  const now = Date.now();
  if (!current || !canAttemptBookingEmail(current, now)) return null;

  const claimId = randomUUID();
  const attemptedAt = new Date(now).toISOString();
  const firstAttemptedAt =
    current.status === "failed" &&
    !isBookingEmailDeliveryUncertain(current) &&
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
  if (options.refreshBooking) {
    try {
      deliveryBooking = await options.refreshBooking();
    } catch {
      deliveryBooking = null;
    }
  }

  let deliveryContext: TContext | null = undefined as TContext;
  if (options.refreshContext) {
    try {
      deliveryContext = await options.refreshContext();
    } catch {
      deliveryContext = null;
    }
  }

  const bookingValidationError = deliveryBooking
    ? options.validateBooking?.(deliveryBooking) ?? null
    : null;
  const contextValidationError =
    deliveryBooking && deliveryContext !== null
      ? options.validateContext?.(deliveryBooking, deliveryContext) ?? null
      : null;
  const validationError = bookingValidationError ?? contextValidationError;
  const currentPayloadHash =
    deliveryBooking && deliveryContext !== null && !validationError
      ? fingerprinter(deliveryBooking, deliveryContext)
      : null;
  const payloadHashChanged = Boolean(current.deliveryPayloadHash &&
    currentPayloadHash && current.deliveryPayloadHash !== currentPayloadHash);
  const compatiblePayload = payloadHashChanged && deliveryBooking &&
    deliveryContext !== null && !validationError &&
    options.isCompatiblePayload?.(current, deliveryBooking, deliveryContext) === true;
  let boundPayloadHash = current.deliveryPayloadHash;
  if (!deliveryBooking) {
    result = {
      status: "failed",
      attempted: false,
      errorCode: "booking-state-unavailable",
    };
  } else if (deliveryContext === null) {
    result = {
      status: "failed",
      attempted: false,
      errorCode:
        options.contextUnavailableError ?? "booking-email-context-unavailable",
    };
  } else if (validationError) {
    result = {
      status: "failed",
      attempted: false,
      errorCode: validationError,
    };
  } else if (payloadHashChanged && !compatiblePayload) {
    result = {
      status: "failed",
      attempted: false,
      errorCode: "resend-payload-changed",
    };
  } else {
    try {
      // Bind a newly resolved payload durably before any network call. A worker
      // crash must not allow a different recipient or appointment on retry.
      const payloadSaved = !currentPayloadHash ||
        (Boolean(current.deliveryPayloadHash) && !compatiblePayload) ||
        await repository.completeNotificationDelivery(
          { ...claimed, deliveryPayloadHash: currentPayloadHash }, claimId,
        );
      if (payloadSaved && currentPayloadHash) boundPayloadHash = currentPayloadHash;
      result = payloadSaved
        ? await sender(deliveryBooking, deliveryContext)
        : { status: "failed", attempted: false, errorCode: "booking-email-payload-not-saved" };
    } catch {
      result = {
        status: "failed",
        attempted: true,
        errorCode: "resend-unexpected-error",
      };
    }
  }

  const timestamp = new Date().toISOString();
  // A subsequent lookup/configuration/rate-limit failure does not prove that
  // an earlier uncertain network request was never accepted by Resend.
  const priorDeliveryUncertain = isBookingEmailDeliveryUncertain(current);
  const uncertainFailure = result.status === "failed" &&
    (priorDeliveryUncertain || indeterminateBookingEmailErrors.has(result.errorCode));
  const lastError = result.status === "failed" && priorDeliveryUncertain &&
    !indeterminateBookingEmailErrors.has(result.errorCode)
    ? indeterminateBookingEmailErrors.has(current.lastError)
      ? current.lastError : "resend-unexpected-error"
    : result.status === "failed" ? result.errorCode : "";
  const updated = {
    ...claimed,
    status:
      result.status === "sent"
        ? ("sent" as const)
        : uncertainFailure
          ? ("indeterminate" as const)
          : ("failed" as const),
    ...(result.status === "sent"
      ? {
          providerMessageId: result.providerMessageId,
          sentAt: timestamp,
          lastError: "",
        }
      : { lastError: lastError.slice(0, 120) }),
    ...(boundPayloadHash
      ? { deliveryPayloadHash: boundPayloadHash }
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
  compatibilityVerifier: OwnerBookingEmailFingerprintCompatibility =
    isOwnerBookingEmailDeliveryFingerprintCompatible,
): Promise<OwnerBookingEmailSendResult | null> {
  return deliverBookingEmail(
    repository,
    booking,
    ownerBookingRequestEmailNotificationId(booking.id),
    (current) => sender(current),
    (current) => fingerprinter(current),
    "owner booking email",
    {
      refreshBooking: () => repository.getBooking(booking.id),
      validateBooking: (latest) => latest.status !== "pending"
        ? "booking-not-pending"
        : latest.source !== "website" ? "booking-not-website-request" : null,
      isCompatiblePayload: (notification, latest) => Boolean(
        notification.deliveryPayloadHash && compatibilityVerifier(
          latest, notification.deliveryPayloadHash, notification.bookingVersion,
        ),
      ),
    },
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
  const notification = await repository.getNotification(
    customerBookingConfirmationEmailNotificationId(booking.id),
  );

  return deliverBookingEmail(
    repository,
    booking,
    customerBookingConfirmationEmailNotificationId(booking.id),
    (current) => sender(current, business),
    (current) => fingerprinter(current, business),
    "customer booking confirmation email",
    {
      refreshBooking: () => repository.getBooking(booking.id),
      refreshContext: async () => notification
        ? hasSupersedingBookingEmail(repository, notification) : false,
      validateContext: (_latest, superseded) => superseded ? "booking-event-superseded" : null,
      validateBooking: (latest) => {
        if (latest.status !== "confirmed") return "booking-not-confirmed";
        if (!latest.customer.email) return "customer-email-missing";
        return null;
      },
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
    {
      refreshBooking: () => repository.getBooking(booking.id),
      validateBooking: (latest) => {
        if (latest.status !== "cancelled") return "booking-not-cancelled";
        if (!latest.customer.email) return "customer-email-missing";
        return null;
      },
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
  if ((repository.mode === "mock" || booking.demo) && !options.sender) {
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
      notification && isBookingEmailDeliveryUncertain(notification)
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
  if ((repository.mode === "mock" || booking.demo) && !options.sender) {
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
      notification && isBookingEmailDeliveryUncertain(notification)
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

function therapistEmailPlanFromNotification(
  notification: CmsBookingNotification,
): TherapistBookingEmailPlan | null {
  if (notification.audience !== "therapist" || !notification.targetTeamMemberId ||
    !Number.isInteger(notification.bookingVersion) || (notification.bookingVersion ?? 0) < 1) {
    return null;
  }
  const event: TherapistBookingEmailEvent | null =
    notification.kind === "booking-requested" ? "requested"
      : notification.kind === "booking-request-updated" ? "request-updated"
      : notification.kind === "booking-request-withdrawn" ? "request-withdrawn"
      : notification.kind === "booking-assigned" ? "assigned"
      : notification.kind === "booking-unassigned" ? "removed"
        : notification.kind === "booking-rescheduled" ? "rescheduled"
          : notification.kind === "booking-cancelled" ? "cancelled" : null;
  if (!event) return null;
  const bookingVersion = notification.bookingVersion!;
  const notificationId = therapistBookingEmailNotificationId(
    event, notification.bookingId, notification.targetTeamMemberId, bookingVersion,
  );
  return notification.id === notificationId ? {
    event, notificationId, bookingVersion,
    targetTeamMemberId: notification.targetTeamMemberId,
  } : null;
}

async function hasSupersedingBookingEmail(
  repository: CmsRepository,
  notification: CmsBookingNotification,
) {
  const events = await repository.listNotifications(notification.bookingId, 1_000);
  return events.some((candidate) => candidate.channel === "email" &&
    candidate.audience === notification.audience &&
    candidate.targetTeamMemberId === notification.targetTeamMemberId &&
    (candidate.bookingVersion ?? 0) > (notification.bookingVersion ?? 0) &&
    candidate.status !== "preview");
}

export type TherapistBookingEmailDeliveryOptions = {
  readonly sender?: TherapistBookingEmailSender;
  readonly fingerprinter?: TherapistBookingEmailFingerprinter;
  readonly business?: CustomerBookingEmailBusiness;
};

export async function deliverTherapistBookingEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  requestedPlan: TherapistBookingEmailPlan,
  options: TherapistBookingEmailDeliveryOptions = {},
) {
  const notification = await repository.getNotification(requestedPlan.notificationId);
  const plan = notification ? therapistEmailPlanFromNotification(notification) : null;
  if (!notification || !plan || notification.bookingId !== booking.id) return null;
  const historicalAppointment =
    plan.event === "removed" || plan.event === "request-withdrawn"
    ? readTherapistRemovedAppointment(notification.therapistRemovedAppointment, plan.targetTeamMemberId)
    : null;
  const deliveryBooking = (latest: CmsBooking) => historicalAppointment
    ? withTherapistRemovedAppointment(latest, historicalAppointment) : latest;
  return deliverBookingEmail(
    repository, booking, plan.notificationId,
    (latest, context) => options.sender
      ? options.sender(
          deliveryBooking(latest),
          context.recipient,
          plan.event,
          plan.bookingVersion,
          context.business,
        )
      : sendTherapistBookingEmail(
          deliveryBooking(latest),
          context.recipient,
          plan.event,
          plan.bookingVersion,
          context.business,
          { confirmationIssuedAt: notification.createdAt },
        ),
    (latest, context) => options.fingerprinter
      ? options.fingerprinter(
          deliveryBooking(latest),
          context.recipient,
          plan.event,
          plan.bookingVersion,
          context.business,
        )
      : getTherapistBookingEmailDeliveryFingerprint(
          deliveryBooking(latest),
          context.recipient,
          plan.event,
          plan.bookingVersion,
          context.business,
          { confirmationIssuedAt: notification.createdAt },
        ),
    "therapist booking email",
    {
      refreshBooking: () => repository.getBooking(booking.id),
      refreshContext: async () => {
        const [recipient, business, superseded] = await Promise.all([
          getTherapistBookingEmailRecipient(repository, plan.targetTeamMemberId),
          options.business ?? getCustomerBookingEmailBusiness(repository),
          hasSupersedingBookingEmail(repository, notification),
        ]);
        return recipient ? { recipient, business, superseded } : null;
      },
      contextUnavailableError: "therapist-contact-unavailable",
      validateContext: (latest, context) => {
        if (
          (plan.event === "removed" || plan.event === "request-withdrawn") &&
          !historicalAppointment
        ) {
          return plan.event === "request-withdrawn"
            ? "therapist-request-withdrawal-snapshot-unavailable"
            : "therapist-removal-snapshot-unavailable";
        }
        if (context.superseded || latest.version < plan.bookingVersion ||
          (!historicalAppointment && !notification.deliveryPayloadHash && latest.version !== plan.bookingVersion)) {
          return "booking-event-superseded";
        }
        if (plan.event === "removed") {
          return latest.assignedStaffId !== plan.targetTeamMemberId
            ? null : "therapist-booking-state-invalid";
        }
        if (plan.event === "request-withdrawn") {
          return latest.source === "website" &&
            (latest.status !== "pending" || latest.assignedStaffId !== plan.targetTeamMemberId)
            ? null
            : "therapist-booking-state-invalid";
        }
        const status = plan.event === "requested" || plan.event === "request-updated"
          ? "pending"
          : plan.event === "cancelled"
            ? "cancelled"
            : "confirmed";
        if (
          (plan.event === "requested" || plan.event === "request-updated") &&
          latest.source !== "website"
        ) {
          return "therapist-booking-state-invalid";
        }
        return latest.status === status && latest.assignedStaffId === plan.targetTeamMemberId
          ? null : "therapist-booking-state-invalid";
      },
    },
  );
}

type CustomerBookingRescheduleEmailDeliveryOptions = {
  readonly sender?: CustomerBookingRescheduleEmailSender;
  readonly fingerprinter?: CustomerBookingRescheduleEmailFingerprinter;
  readonly business?: CustomerBookingEmailBusiness;
};

export async function deliverCustomerBookingRescheduleEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  bookingVersion: number,
  options: CustomerBookingRescheduleEmailDeliveryOptions = {},
) {
  const notificationId = customerBookingRescheduleEmailNotificationId(booking.id, bookingVersion);
  const notification = await repository.getNotification(notificationId);
  if (!notification) return null;
  const sender = options.sender ?? sendCustomerBookingRescheduledEmail;
  const fingerprinter = options.fingerprinter ?? getCustomerBookingRescheduleEmailDeliveryFingerprint;
  return deliverBookingEmail(
    repository, booking, notificationId,
    (latest, context) => sender(latest, context.business, bookingVersion),
    (latest, context) => fingerprinter(latest, context.business, bookingVersion),
    "customer booking update email",
    {
      refreshBooking: () => repository.getBooking(booking.id),
      refreshContext: async () => ({
        business: options.business ?? await getCustomerBookingEmailBusiness(repository),
        superseded: await hasSupersedingBookingEmail(repository, notification),
      }),
      validateContext: (latest, context) => {
        if (latest.status !== "confirmed") return "booking-not-confirmed";
        if (!latest.customer.email) return "customer-email-missing";
        if (context.superseded || latest.version < bookingVersion ||
          (!notification.deliveryPayloadHash && latest.version !== bookingVersion)) {
          return "booking-event-superseded";
        }
        return null;
      },
    },
  );
}

export type BookingEmailRetryOutcome = {
  readonly status: "sent" | "pending" | "failed" | "indeterminate" | "skipped";
  readonly reason?: string;
};

async function emailOutcome(
  repository: CmsRepository,
  notificationId: string,
  result: BookingEmailSendResult | null,
): Promise<BookingEmailRetryOutcome> {
  if (result?.status === "sent") return { status: "sent" };
  const notification = await repository.getNotification(notificationId);
  if (!notification) return { status: "skipped", reason: "notification-not-found" };
  if (notification.status === "sent") return { status: "sent" };
  if (notification.status === "queued") return { status: "pending" };
  if (isBookingEmailDeliveryUncertain(notification)) {
    return { status: "indeterminate" };
  }
  return { status: "failed", ...(notification.lastError ? { reason: notification.lastError } : {}) };
}

function isSupportedBookingEmailNotification(notification: CmsBookingNotification) {
  if (notification.channel !== "email" || notification.provider !== "resend") return false;
  if (notification.audience === "owner") {
    return notification.kind === "booking-requested" &&
      notification.id === ownerBookingRequestEmailNotificationId(notification.bookingId);
  }
  if (notification.audience === "therapist") return Boolean(therapistEmailPlanFromNotification(notification));
  if (notification.audience !== "customer") return false;
  if (notification.kind === "booking-confirmed") {
    return notification.id === customerBookingConfirmationEmailNotificationId(notification.bookingId);
  }
  if (notification.kind === "booking-cancelled") {
    return notification.id === customerBookingCancellationEmailNotificationId(notification.bookingId);
  }
  return notification.kind === "booking-rescheduled" &&
    Number.isInteger(notification.bookingVersion) && (notification.bookingVersion ?? 0) > 0 &&
    notification.id === customerBookingRescheduleEmailNotificationId(notification.bookingId, notification.bookingVersion!);
}

export function canRetryBookingEmailNotification(notification: CmsBookingNotification) {
  return isSupportedBookingEmailNotification(notification) && canAttemptBookingEmail(notification, Date.now());
}

export async function retryBookingEmailNotification(
  repository: CmsRepository,
  notificationId: string,
): Promise<BookingEmailRetryOutcome> {
  if (repository.mode === "mock") return { status: "skipped", reason: "mock-mode" };
  try {
    const notification = await repository.getNotification(notificationId);
    if (!notification) return { status: "skipped", reason: "notification-not-found" };
    if (!isSupportedBookingEmailNotification(notification)) {
      return { status: "skipped", reason: "notification-not-supported" };
    }
    if (!canRetryBookingEmailNotification(notification)) return emailOutcome(repository, notificationId, null);
    const booking = await repository.getBooking(notification.bookingId);
    if (!booking) return { status: "skipped", reason: "booking-not-found" };
    if (booking.demo) return { status: "skipped", reason: "mock-mode" };
    let result: BookingEmailSendResult | null;
    if (notification.audience === "owner") {
      result = await deliverOwnerBookingRequestEmail(repository, booking);
    } else if (notification.audience === "therapist") {
      result = await deliverTherapistBookingEmail(repository, booking, therapistEmailPlanFromNotification(notification)!);
    } else if (notification.kind === "booking-confirmed") {
      result = await deliverCustomerBookingConfirmationEmail(repository, booking);
    } else if (notification.kind === "booking-cancelled") {
      result = await deliverCustomerBookingCancellationEmail(repository, booking);
    } else {
      result = await deliverCustomerBookingRescheduleEmail(repository, booking, notification.bookingVersion!);
    }
    return emailOutcome(repository, notificationId, result);
  } catch {
    console.error(`Failed to process booking email notification ${notificationId}.`);
    return { status: "failed", reason: "booking-email-processing-failed" };
  }
}

export async function attemptCustomerBookingRescheduleEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  options: CustomerBookingRescheduleEmailDeliveryOptions = {},
): Promise<CustomerBookingRescheduleEmailOutcome> {
  if (booking.status !== "confirmed") return { status: "skipped", reason: "booking-not-confirmed" };
  if (!booking.customer.email) return { status: "skipped", reason: "missing-customer-email" };
  if ((repository.mode === "mock" || booking.demo) && !options.sender) {
    return { status: "skipped", reason: "mock-mode" };
  }
  try {
    const result = await deliverCustomerBookingRescheduleEmail(repository, booking, booking.version, options);
    const outcome = await emailOutcome(repository, customerBookingRescheduleEmailNotificationId(booking.id, booking.version), result);
    return { status: outcome.status };
  } catch {
    console.error(`Failed to process the customer booking update email for booking ${booking.id}.`);
    return { status: "failed" };
  }
}

export async function attemptTherapistBookingEmail(
  repository: CmsRepository,
  booking: CmsBooking,
  plan: TherapistBookingEmailPlan,
  options: TherapistBookingEmailDeliveryOptions = {},
): Promise<TherapistBookingEmailOutcome> {
  if ((repository.mode === "mock" || booking.demo) && !options.sender) {
    return { ...plan, status: "skipped", reason: "mock-mode" };
  }
  try {
    const result = await deliverTherapistBookingEmail(repository, booking, plan, options);
    const outcome = await emailOutcome(repository, plan.notificationId, result);
    return { ...plan, status: outcome.status };
  } catch {
    console.error(`Failed to process a therapist booking email for booking ${booking.id}.`);
    return { ...plan, status: "failed" };
  }
}

export async function dispatchBookingMutationEmails(
  repository: CmsRepository,
  current: CmsBooking | null,
  booking: CmsBooking,
  options: {
    readonly confirmation?: CustomerBookingEmailDeliveryOptions;
    readonly cancellation?: CustomerBookingEmailDeliveryOptions;
    readonly reschedule?: CustomerBookingRescheduleEmailDeliveryOptions;
    readonly therapist?: TherapistBookingEmailDeliveryOptions;
  } = {},
) {
  // Booking and outbox have already committed. A failed delivery must never
  // undo the booking or cause the mutation response to report a failed save.
  // Owner alerts belong only to the initial website request. Later events send
  // one operational update to the therapist, with no extra owner copy when
  // those roles share an inbox. Customer notifications remain separate.
  const confirmationEmail = current?.status !== "confirmed" && booking.status === "confirmed"
    ? await attemptCustomerBookingConfirmationEmail(repository, booking, options.confirmation) : undefined;
  const cancellationEmail = current?.status !== "cancelled" && booking.status === "cancelled"
    ? await attemptCustomerBookingCancellationEmail(repository, booking, options.cancellation) : undefined;
  const rescheduleEmail = current?.status === "confirmed" && booking.status === "confirmed" &&
    bookingAppointmentDetailsChanged(current, booking)
    ? await attemptCustomerBookingRescheduleEmail(repository, booking, options.reschedule) : undefined;
  const therapistEmails: TherapistBookingEmailOutcome[] = [];
  for (const plan of getTherapistBookingEmailPlans(current, booking)) {
    therapistEmails.push(await attemptTherapistBookingEmail(repository, booking, plan, options.therapist));
  }
  return {
    ...(confirmationEmail ? { confirmationEmail } : {}),
    ...(cancellationEmail ? { cancellationEmail } : {}),
    ...(rescheduleEmail ? { rescheduleEmail } : {}),
    therapistEmails,
  };
}
