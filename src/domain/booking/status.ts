import type { BookingStatus, CmsBooking } from "@/domain/cms/types";

const bookingStatusTransitions: Readonly<
  Record<BookingStatus, readonly BookingStatus[]>
> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no-show"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

export function getAllowedBookingStatusTransitions(status: BookingStatus) {
  return bookingStatusTransitions[status];
}

export function canTransitionBookingStatus(
  current: BookingStatus,
  next: BookingStatus,
) {
  return current === next || bookingStatusTransitions[current].includes(next);
}

export function isTerminalBookingStatus(status: BookingStatus) {
  return bookingStatusTransitions[status].length === 0;
}

type PendingCapacityBooking = Pick<CmsBooking, "status" | "capacityExpiresAt">;

export function isPendingCapacityExpired(
  booking: PendingCapacityBooking,
  now: number | Date = Date.now(),
) {
  if (booking.status !== "pending" || !booking.capacityExpiresAt) {
    return false;
  }

  const expiresAt = Date.parse(booking.capacityExpiresAt);
  const currentTime = now instanceof Date ? now.getTime() : now;

  return Number.isFinite(expiresAt) && expiresAt <= currentTime;
}
