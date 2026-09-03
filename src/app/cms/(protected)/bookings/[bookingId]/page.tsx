import { History, Mail, Phone, UserRound } from "lucide-react";
import { notFound } from "next/navigation";

import { BookingEditorForm } from "@/components/cms/BookingEditorForm";
import { CmsBookingQuickActions } from "@/components/cms/CmsBookingQuickActions";
import { CmsDeleteBookingButton } from "@/components/cms/CmsDeleteBookingButton";
import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { isPendingCapacityExpired } from "@/domain/booking/status";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsBooking, listCmsBookingTimeline, listCmsNotifications } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

type PageProps = {
  readonly params: Promise<{ readonly bookingId: string }>;
};

export default async function CmsBookingDetailPage({ params }: PageProps) {
  const user = await requireCmsPageUser("bookings:write");
  const { bookingId } = await params;
  const [booking, timeline, notifications] = await Promise.all([
    getCmsBooking(bookingId),
    listCmsBookingTimeline(bookingId),
    listCmsNotifications(bookingId, 100),
  ]);
  if (!booking) notFound();
  const expiredPending = isPendingCapacityExpired(booking);

  return (
    <>
      <CmsPageHeader
        actions={
          <>
            <CmsPrimaryLink href="/cms/bookings" secondary>Back to bookings</CmsPrimaryLink>
            {canCmsRole(user.role, "bookings:delete") ? (
              <CmsDeleteBookingButton
                bookingId={booking.id}
                reference={booking.reference}
                version={booking.version}
              />
            ) : null}
          </>
        }
        description="Review the appointment snapshot, update its status or reschedule safely."
        eyebrow={booking.reference}
        title={booking.customer.name}
      />

      {booking.demo ? (
        <CmsNotice tone="warning" title="Fictional local mock booking">
          This customer and contact information are placeholders and reset with the local server.
        </CmsNotice>
      ) : null}

      {expiredPending ? (
        <CmsNotice tone="warning" title="Temporary capacity hold has expired">
          This pending request no longer blocks the appointment time. Confirming or rescheduling it will recheck opening hours, closures and current capacity before saving.
        </CmsNotice>
      ) : null}

      <div className={styles.detailGrid}>
        <CmsPanel title="Booking summary" description="Treatment and price are preserved from the booking date.">
          <dl className={styles.details}>
            <div>
              <dt>Status</dt>
              <dd className={styles.bookingDetailStatus}>
                <CmsBookingStatus status={booking.status} />
                <CmsBookingQuickActions booking={booking} />
              </dd>
            </div>
            <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
            <div><dt>Treatment</dt><dd>{booking.serviceName}</dd></div>
            <div><dt>Duration & price</dt><dd>{booking.durationMinutes} min · €{(booking.priceCents / 100).toFixed(0)}</dd></div>
            <div><dt>Date</dt><dd>{booking.localDate}</dd></div>
            <div><dt>Dublin time</dt><dd>{booking.localTime}</dd></div>
            <div><dt>Source</dt><dd>{booking.source}</dd></div>
            <div><dt>Last change reason</dt><dd>{booking.lastChangeReason?.replaceAll("-", " ") || "Not recorded"}</dd></div>
          </dl>
        </CmsPanel>

        <CmsPanel title="Customer contact" description="Visible only to authorised CMS users.">
          <ul className={styles.activityList}>
            <li><UserRound aria-hidden="true" /><div><strong>{booking.customer.name}</strong><span>Customer</span></div></li>
            <li><Phone aria-hidden="true" /><div><strong>{booking.customer.phone}</strong><span>Phone</span></div></li>
            <li><Mail aria-hidden="true" /><div><strong>{booking.customer.email || "Not provided"}</strong><span>Email</span></div></li>
          </ul>
        </CmsPanel>
      </div>

      <CmsPanel title={`Booking activity · ${timeline.length}`} description="Status and administrative actions are recorded without customer notes or message content.">
        {timeline.length ? (
          <ul className={styles.activityList}>
            {timeline.map((event) => (
              <li key={event.id}>
                <History aria-hidden="true" />
                <div><strong>{event.summary}</strong><span>{new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(event.createdAt))} · {event.actorName}</span></div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No recorded activity is available for this seeded mock appointment.</p>
        )}
      </CmsPanel>

      <CmsPanel title={`Notification activity · ${notifications.length}`} description="Records contain delivery metadata only. Recipient addresses and message bodies are not stored here.">
        {notifications.length ? (
          <ul className={styles.activityList}>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <Mail aria-hidden="true" />
                <div>
                  <strong>
                    {notification.audience === "owner" && notification.channel === "email"
                      ? "Owner booking alert"
                      : `${notification.kind.replaceAll("-", " ")} · ${notification.channel}`}
                  </strong>
                  <span>
                    {notification.status === "sent" && notification.provider === "resend"
                      ? "accepted by Resend"
                      : notification.status === "sending"
                        ? "sending through Resend"
                        : notification.status === "indeterminate"
                          ? "delivery uncertain — review in Resend"
                          : notification.status.replaceAll("-", " ")}
                    {(notification.status === "failed" ||
                      notification.status === "indeterminate") && notification.lastError
                      ? ` · ${notification.lastError.replaceAll("-", " ")}`
                      : ""}
                    {" · "}
                    {new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(notification.updatedAt || notification.createdAt))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : <p>No notification activity has been recorded for this booking.</p>}
      </CmsPanel>

      <BookingEditorForm booking={booking} />
    </>
  );
}
