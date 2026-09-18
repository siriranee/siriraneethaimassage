import type { BookingStatus } from "@/domain/cms/types";

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
