import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CmsBooking,
  CmsBookingNotification,
  CmsNotificationKind,
} from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories";

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
) {
  const channels = [
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
