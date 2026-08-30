import type { CmsBooking } from "@/domain/cms/types";

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
