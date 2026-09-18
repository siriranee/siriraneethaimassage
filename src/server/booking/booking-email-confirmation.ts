import "server-only";

import type { CmsBooking } from "@/domain/cms/types";
import {
  getBookingConfirmationAppointmentRevision,
  verifyBookingConfirmationToken,
  type BookingConfirmationRole,
  type BookingConfirmationTokenClaims,
} from "@/server/booking/booking-confirmation-token";
import { updateAdminBooking } from "@/server/cms/booking-service";
import { dispatchBookingMutationEmails } from "@/server/cms/notification-service";
import {
  CmsConflictError,
  getCmsRepository,
} from "@/server/cms/repositories";

const emailConfirmationActor = {
  id: "owner-email-confirmation",
  displayName: "Owner email confirmation",
} as const;

const therapistEmailConfirmationActor = {
  id: "therapist-email-confirmation",
  displayName: "Therapist email confirmation",
} as const;

export type BookingConfirmationReviewBooking = Pick<
  CmsBooking,
  | "reference"
  | "serviceName"
  | "durationMinutes"
  | "priceCents"
  | "currency"
  | "localDate"
  | "localTime"
  | "timezone"
  | "assignedStaffName"
  | "status"
>;

export type BookingConfirmationReview =
  | {
      readonly kind: "ready" | "already-confirmed";
      readonly booking: BookingConfirmationReviewBooking;
      readonly expiresAt: number;
      readonly confirmationRole: BookingConfirmationRole;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "invalid-token"
        | "expired"
        | "booking-not-found"
        | "source-not-supported"
        | "stale"
        | "invalid-state";
      readonly confirmationRole?: BookingConfirmationRole;
    };

type BookingConfirmationUnavailableReason = Extract<
  BookingConfirmationReview,
  { kind: "unavailable" }
>["reason"];

type BookingConfirmationEmailStatus =
  | "sent"
  | "pending"
  | "failed"
  | "indeterminate"
  | "skipped";

export type BookingEmailConfirmationResult =
  | {
      readonly kind: "confirmed" | "already-confirmed";
      readonly booking: BookingConfirmationReviewBooking;
      readonly confirmationRole: BookingConfirmationRole;
      readonly customerEmailStatus?: BookingConfirmationEmailStatus;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: BookingConfirmationUnavailableReason;
    };

type BookingConfirmationServiceOptions = {
  readonly secret?: string;
  readonly now?: Date;
};

function safeBooking(booking: CmsBooking): BookingConfirmationReviewBooking {
  return {
    reference: booking.reference,
    serviceName: booking.serviceName,
    durationMinutes: booking.durationMinutes,
    priceCents: booking.priceCents,
    currency: booking.currency,
    localDate: booking.localDate,
    localTime: booking.localTime,
    timezone: booking.timezone,
    assignedStaffName: booking.assignedStaffName,
    status: booking.status,
  };
}

function unavailable(
  reason: BookingConfirmationUnavailableReason,
  confirmationRole?: BookingConfirmationRole,
): Extract<BookingConfirmationReview, { kind: "unavailable" }> {
  return {
    kind: "unavailable",
    reason,
    ...(confirmationRole ? { confirmationRole } : {}),
  };
}

function reviewBookingFromClaims(
  booking: CmsBooking | null,
  claims: BookingConfirmationTokenClaims,
): BookingConfirmationReview {
  const confirmationRole = claims.confirmationRole;
  if (!booking) return unavailable("booking-not-found", confirmationRole);
  if (booking.source !== "website") {
    return unavailable("source-not-supported", confirmationRole);
  }
  if (
    confirmationRole === "therapist" &&
    booking.assignedStaffId !== claims.therapistId
  ) {
    return unavailable("stale", confirmationRole);
  }
  if (
    getBookingConfirmationAppointmentRevision(booking) !==
    claims.appointmentRevision
  ) {
    return unavailable("stale", confirmationRole);
  }
  if (booking.status === "confirmed") {
    return {
      kind: "already-confirmed" as const,
      booking: safeBooking(booking),
      expiresAt: claims.expiresAt,
      confirmationRole,
    };
  }
  if (booking.status !== "pending") {
    return unavailable("invalid-state", confirmationRole);
  }

  return {
    kind: "ready" as const,
    booking: safeBooking(booking),
    expiresAt: claims.expiresAt,
    confirmationRole,
  };
}

async function reviewFromClaims(claims: BookingConfirmationTokenClaims) {
  const booking = await getCmsRepository().getBooking(claims.bookingId);
  return reviewBookingFromClaims(booking, claims);
}

export async function getBookingEmailConfirmationReview(
  token: string,
  options: BookingConfirmationServiceOptions = {},
): Promise<BookingConfirmationReview> {
  const verification = verifyBookingConfirmationToken(token, options);
  if (!verification.ok) {
    return unavailable(
      verification.reason === "expired" ? "expired" : "invalid-token",
    );
  }

  return reviewFromClaims(verification.claims);
}

export async function confirmBookingFromEmailToken(
  token: string,
  options: BookingConfirmationServiceOptions = {},
): Promise<BookingEmailConfirmationResult> {
  const verification = verifyBookingConfirmationToken(token, options);
  if (!verification.ok) {
    return unavailable(
      verification.reason === "expired" ? "expired" : "invalid-token",
    );
  }

  const repository = getCmsRepository();
  let current = await repository.getBooking(verification.claims.bookingId);
  if (!current) {
    return unavailable(
      "booking-not-found",
      verification.claims.confirmationRole,
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Validate the exact snapshot whose version is used for the write. A
    // separate earlier review read is not sufficient because an appointment
    // can be rescheduled or reassigned between those two reads.
    const review = reviewBookingFromClaims(current, verification.claims);
    if (review.kind === "unavailable") return review;
    if (review.kind === "already-confirmed") {
      return {
        kind: "already-confirmed",
        booking: review.booking,
        confirmationRole: review.confirmationRole,
      };
    }

    try {
      const booking = await updateAdminBooking(
        current.id,
        { status: "confirmed", changeReason: "customer-request" },
        current.version,
        {
          actor: verification.claims.confirmationRole === "therapist"
            ? therapistEmailConfirmationActor
            : emailConfirmationActor,
        },
      );
      let customerEmailStatus: BookingConfirmationEmailStatus | undefined;
      try {
        const emails = await dispatchBookingMutationEmails(
          repository,
          current,
          booking,
        );
        customerEmailStatus = emails.confirmationEmail?.status;
      } catch {
        // The booking transaction has already committed. Never report the save
        // as failed because a downstream delivery attempt encountered an error.
        customerEmailStatus = "failed";
      }

      return {
        kind: "confirmed",
        booking: safeBooking(booking),
        confirmationRole: verification.claims.confirmationRole,
        ...(customerEmailStatus
          ? { customerEmailStatus }
          : {}),
      };
    } catch (error) {
      if (error instanceof CmsConflictError) {
        const refreshed = await repository.getBooking(verification.claims.bookingId);
        if (!refreshed) {
          return unavailable(
            "booking-not-found",
            verification.claims.confirmationRole,
          );
        }
        current = refreshed;
        continue;
      }

      // The appointment can become ineligible between review and submission
      // (for example, if the therapist is archived or the spa adds a closure).
      // Keep implementation details private and ask the owner to use the CMS.
      return unavailable(
        "invalid-state",
        verification.claims.confirmationRole,
      );
    }
  }

  return unavailable("stale", verification.claims.confirmationRole);
}
