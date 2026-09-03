import "server-only";

import { isPendingCapacityExpired } from "@/domain/booking/status";
import type {
  CmsBookingQuery,
  CmsNotificationBellItem,
  CmsUserSummary,
} from "@/domain/cms/types";
import { getCmsRepository } from "@/server/cms/repositories";

function dublinDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function getCmsDashboardData() {
  const repository = getCmsRepository();
  const [content, bookings] = await Promise.all([
    repository.getContent(),
    repository.listBookings(),
  ]);
  const today = dublinDate();
  const now = Date.now();
  const expiredPending = bookings.filter((booking) =>
    isPendingCapacityExpired(booking, now),
  );
  const upcoming = bookings.filter(
    (booking) =>
      booking.localDate >= today &&
      booking.status !== "cancelled" &&
      booking.status !== "completed" &&
      booking.status !== "no-show" &&
      !isPendingCapacityExpired(booking, now),
  );

  return {
    content,
    today,
    summary: {
      todayCount: upcoming.filter((booking) => booking.localDate === today).length,
      pendingCount: bookings.filter(
        (booking) =>
          booking.status === "pending" &&
          !isPendingCapacityExpired(booking, now),
      ).length,
      expiredPendingCount: expiredPending.length,
      upcomingCount: upcoming.length,
      activeServiceCount: content.services.filter(
        (service) => service.prices.some((price) => price.active),
      ).length,
    },
    upcoming: upcoming.slice(0, 6),
  };
}

export async function listCmsBookings(query: CmsBookingQuery = {}) {
  return getCmsRepository().listBookings(query);
}

export async function getCmsBooking(id: string) {
  return getCmsRepository().getBooking(id);
}

export async function listCmsBookingTimeline(id: string) {
  return getCmsRepository().listAuditForEntity("booking", id, 100);
}

export async function listCmsNotifications(bookingId?: string, limit = 200) {
  return getCmsRepository().listNotifications(bookingId, limit);
}

export async function listCmsNotificationBellItems(
  limit = 8,
): Promise<readonly CmsNotificationBellItem[]> {
  const notifications = await getCmsRepository().listDashboardNotifications(limit);
  return notifications.map((notification) => ({
    id: notification.id,
    bookingId: notification.bookingId,
    bookingReference: notification.bookingReference,
    kind: notification.kind,
    createdAt: notification.createdAt,
  }));
}

export async function listCmsClosures(from?: string, to?: string) {
  return getCmsRepository().listClosures(from, to);
}

export async function listCmsUsers(): Promise<readonly CmsUserSummary[]> {
  const users = await getCmsRepository().listUsers();

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    ...(user.email ? { email: user.email } : {}),
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    version:
      Number.isInteger(user.version) && user.version >= 0 ? user.version : 0,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
}

export async function getCmsUserSummary(id: string): Promise<CmsUserSummary | null> {
  const user = await getCmsRepository().findUserById(id);
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    ...(user.email ? { email: user.email } : {}),
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    version:
      Number.isInteger(user.version) && user.version >= 0 ? user.version : 0,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listCmsAudit(limit = 100) {
  return getCmsRepository().listAudit(limit);
}
