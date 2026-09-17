import Link from "next/link";

import { CmsNotice } from "@/components/cms/CmsUi";
import { bookingEmailAttentionText, type CmsBookingEmailAttention } from "@/domain/cms/notification-presentation";

import styles from "./CmsBookingQuickActions.module.css";

export function CmsBookingEmailAttentionNotice({
  items,
}: Readonly<{ items: readonly CmsBookingEmailAttention[] }>) {
  if (!items.length) return null;

  return (
    <CmsNotice title="Booking emails need attention" tone="warning">
      <p>Recent unresolved email activity, including cancelled bookings. The saved booking status is not changed by an email failure.</p>
      <ul className={styles.attentionList}>
        {items.map((item) => (
          <li key={item.bookingId}>
            <Link href={`/cms/bookings/${item.bookingId}`}>{item.bookingReference}</Link>
            <span>{bookingEmailAttentionText(item)}</span>
          </li>
        ))}
      </ul>
      <p>Showing the {items.length} most recently updated booking{items.length === 1 ? "" : "s"} needing email review.</p>
    </CmsNotice>
  );
}
