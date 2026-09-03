import type { BookingStatus, CmsBooking } from "@/domain/cms/types";

export type PublicBookingIdentifier =
  | { readonly kind: "id"; readonly value: string }
  | { readonly kind: "reference"; readonly value: string };

export type PublicBookingStatusSource = Pick<
  CmsBooking,
  "status" | "capacityExpiresAt"
>;

export const publicBookingStatusCodes = [
  "pending",
  "confirmed",
  "completed",
  "closed",
  "expired",
] as const;

export type PublicBookingStatusCode =
  (typeof publicBookingStatusCodes)[number];

export type PublicBookingStatusSnapshot = {
  readonly code: PublicBookingStatusCode;
  readonly label: string;
  readonly message: string;
};

const bookingIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bookingReferencePattern = /^SRN-\d{8}-[0-9A-F]{6}$/i;

export function parsePublicBookingIdentifier(
  value: unknown,
): PublicBookingIdentifier | null {
  const identifier = typeof value === "string" ? value.trim() : "";

  if (bookingIdPattern.test(identifier)) {
    return { kind: "id", value: identifier.toLowerCase() };
  }

  if (bookingReferencePattern.test(identifier)) {
    return { kind: "reference", value: identifier.toUpperCase() };
  }

  return null;
}

function pendingCapacityExpired(
  booking: PublicBookingStatusSource,
  now: number,
) {
  if (booking.status !== "pending" || !booking.capacityExpiresAt) return false;

  const expiresAt = Date.parse(booking.capacityExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function publicCode(
  booking: PublicBookingStatusSource,
  now: number,
): PublicBookingStatusCode {
  if (pendingCapacityExpired(booking, now)) return "expired";
  if (booking.status === "cancelled" || booking.status === "no-show") {
    return "closed";
  }

  return booking.status;
}

const statusCopy: Readonly<
  Record<PublicBookingStatusCode, Omit<PublicBookingStatusSnapshot, "code">>
> = {
  pending: {
    label: "Waiting for confirmation",
    message: "Your request has been received and is waiting for confirmation.",
  },
  confirmed: {
    label: "Confirmed",
    message: "Your booking has been confirmed by the Siriranee team.",
  },
  completed: {
    label: "Completed",
    message: "This booking has been marked as completed.",
  },
  closed: {
    label: "Closed",
    message: "This booking is no longer active. Contact Siriranee if you need help.",
  },
  expired: {
    label: "Request expired",
    message:
      "This request is no longer holding appointment capacity. Please make a new request or contact Siriranee.",
  },
};

export function createPublicBookingStatusSnapshot(
  booking: PublicBookingStatusSource,
  now: number | Date = Date.now(),
): PublicBookingStatusSnapshot {
  const currentTime = now instanceof Date ? now.getTime() : now;
  const code = publicCode(booking, currentTime);

  return { code, ...statusCopy[code] };
}

export function isPublicBookingStatusSnapshot(
  value: unknown,
): value is PublicBookingStatusSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicBookingStatusSnapshot>;

  return (
    typeof candidate.code === "string" &&
    publicBookingStatusCodes.some((code) => code === candidate.code) &&
    typeof candidate.label === "string" &&
    typeof candidate.message === "string"
  );
}

export function isInternalBookingStatus(value: unknown): value is BookingStatus {
  return (
    value === "pending" ||
    value === "confirmed" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "no-show"
  );
}
