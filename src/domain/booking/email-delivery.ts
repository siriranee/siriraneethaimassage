import type {
  CmsBookingNotification, CmsEmailDeliveryEvent, CmsEmailDeliveryStatus,
} from "@/domain/cms/types";

const statuses: Readonly<Record<string, CmsEmailDeliveryStatus>> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
};
const rank: Record<CmsEmailDeliveryStatus, number> = {
  delayed: 0, delivered: 1, failed: 2, suppressed: 3, bounced: 4, complained: 5,
};

export function parseEmailDeliveryEvent(
  payload: unknown, eventId: string, receivedAt = new Date().toISOString(),
): CmsEmailDeliveryEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  const status = typeof event.type === "string" ? statuses[event.type] : undefined;
  if (!status) return null;
  const data = event.data as Record<string, unknown> | undefined;
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(eventId) ||
    !data || typeof data.email_id !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(data.email_id) ||
    typeof event.created_at !== "string" ||
    !Number.isFinite(Date.parse(event.created_at))
  ) throw new Error("Invalid email delivery event.");
  return {
    id: eventId, providerMessageId: data.email_id, deliveryStatus: status,
    occurredAt: new Date(event.created_at).toISOString(), receivedAt,
  };
}

/** Status precedence makes duplicates and out-of-order delivery deterministic.
 * A late delay/acceptance must never hide a bounce or complaint. */
export function applyEmailDeliveryEvent(
  notification: CmsBookingNotification, event: CmsEmailDeliveryEvent,
): CmsBookingNotification {
  if (notification.providerMessageId !== event.providerMessageId) return notification;
  if (notification.deliveryStatus) {
    const delta = rank[event.deliveryStatus] - rank[notification.deliveryStatus];
    if (delta < 0) return notification;
    if (delta === 0 && (
      event.occurredAt < (notification.providerEventAt ?? "") ||
      (event.occurredAt === notification.providerEventAt &&
        event.id <= (notification.providerEventId ?? ""))
    )) return notification;
  }
  return {
    ...notification, deliveryStatus: event.deliveryStatus,
    providerEventAt: event.occurredAt, providerEventId: event.id,
  };
}
