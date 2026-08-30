import { BellRing, ExternalLink } from "lucide-react";
import Link from "next/link";

import { CmsEmptyState, CmsNotice, CmsPageHeader, CmsPanel, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsNotifications } from "@/server/cms/read-service";
import styles from "@/components/cms/CmsViews.module.css";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(value));
}

export default async function CmsNotificationsPage() {
  await requireCmsPageUser("bookings:view");
  const notifications = await listCmsNotifications(undefined, 300);
  return (
    <>
      <CmsPageHeader description="Review the customer and staff messages that booking actions would generate once a production provider is approved." eyebrow="Booking operations" title="Notification queue" />
      <CmsNotice tone="warning" title="Preview mode — no messages are sent">
        These metadata-only records contain no recipient address and no message body.
        Provider credentials, templates, retries and delivery webhooks remain disabled until selected and tested.
      </CmsNotice>
      <CmsPanel title={`Notification previews · ${notifications.length}`} description="Newest first; Dublin local time.">
        {notifications.length ? (
          <ul className={styles.activityList}>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <BellRing aria-hidden="true" />
                <div>
                  <strong>{notification.bookingReference} · {notification.kind.replaceAll("-", " ")} <CmsStatusBadge label={notification.status} tone={notification.status === "sent" ? "success" : notification.status === "failed" ? "danger" : "warning"} /></strong>
                  <span>{notification.channel} · {formatTimestamp(notification.createdAt)} · {notification.attemptCount} attempts</span>
                </div>
                <Link className={styles.miniLink} href={`/cms/bookings/${notification.bookingId}`}>Booking <ExternalLink aria-hidden="true" /></Link>
              </li>
            ))}
          </ul>
        ) : (
          <CmsEmptyState title="No notification previews yet">Create or materially update a fictional booking to preview the future notification workflow.</CmsEmptyState>
        )}
      </CmsPanel>
    </>
  );
}
