import { History, Mail, Phone, UserRound } from "lucide-react";
import { notFound } from "next/navigation";

import { BookingEditorForm } from "@/components/cms/BookingEditorForm";
import { CmsBookingQuickActions } from "@/components/cms/CmsBookingQuickActions";
import { CmsDeleteBookingButton } from "@/components/cms/CmsDeleteBookingButton";
import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import { CmsRetryBookingEmail } from "@/components/cms/CmsRetryBookingEmail";
import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { bookingEmailDeliveryFeedback } from "@/domain/cms/notification-presentation";
import { isBookingEmailDeliveryUncertain } from "@/domain/booking/email-retry-policy";
import { canCmsRole } from "@/domain/cms/permissions";
import { compareCmsTeamMembersByName } from "@/domain/cms/team";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { canRetryBookingEmailNotification } from "@/server/cms/notification-service";
import { getCmsContent } from "@/server/cms/content-service";
import { getCmsBooking, listCmsBookingTimeline, listCmsNotifications } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

type PageProps = {
  readonly params: Promise<{ readonly bookingId: string }>;
};

export default async function CmsBookingDetailPage({ params }: PageProps) {
  const user = await requireCmsPageUser("bookings:write");
  const { bookingId } = await params;
  const [booking, timeline, notifications, content] = await Promise.all([
    getCmsBooking(bookingId),
    listCmsBookingTimeline(bookingId),
    listCmsNotifications(bookingId, 100),
    getCmsContent(),
  ]);
  if (!booking) notFound();
  const latestCustomerEmail = [...notifications]
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .find((notification) =>
      notification.audience === "customer" &&
      notification.channel === "email" &&
      (booking.status === "cancelled"
        ? notification.kind === "booking-cancelled"
        : booking.status === "confirmed" &&
          (notification.kind === "booking-confirmed" || notification.kind === "booking-rescheduled")),
    );
  const customerEmailFeedback = latestCustomerEmail && !booking.demo
    ? bookingEmailDeliveryFeedback(latestCustomerEmail, canRetryBookingEmailNotification(latestCustomerEmail))
    : null;
  const eligibleTherapists = content.team
    .filter(
      (member) =>
        member.operationalActive &&
        !member.archived &&
        member.serviceIds.includes(booking.serviceId),
    )
    .sort(compareCmsTeamMembersByName)
    .map((member) => ({ id: member.id, name: member.name }));
  const therapistOptions =
    booking.assignedStaffId &&
    !eligibleTherapists.some((member) => member.id === booking.assignedStaffId)
      ? [
          {
            id: booking.assignedStaffId,
            name: `${booking.assignedStaffName || "Previously assigned therapist"} (inactive)`,
          },
          ...eligibleTherapists,
        ]
      : eligibleTherapists;

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

      {customerEmailFeedback ? (
        <CmsNotice
          tone={customerEmailFeedback.tone}
          title={`Customer email · ${customerEmailFeedback.label}`}
        >
          {customerEmailFeedback.text}
        </CmsNotice>
      ) : null}

      {!booking.demo && !booking.customer.email && (booking.status === "confirmed" || booking.status === "cancelled") ? (
        <CmsNotice tone="warning" title="Booking saved without a customer email">
          No customer email address was provided. Contact the customer directly about this appointment.
        </CmsNotice>
      ) : null}

      <div className={styles.detailGrid}>
        <CmsPanel title="Booking summary" description="Treatment and price are preserved from the booking date.">
          <dl className={styles.details}>
            <div>
              <dt>Status</dt>
              <dd className={styles.bookingDetailStatus}>
                <CmsBookingStatus status={booking.status} />
                <CmsBookingQuickActions
                  booking={booking}
                  hasCustomerEmail={Boolean(booking.customer.email)}
                  isMock={booking.demo}
                  key={`quick-actions:${booking.id}:${booking.version}`}
                />
              </dd>
            </div>
            <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
            <div><dt>Treatment</dt><dd>{booking.serviceName}</dd></div>
            <div><dt>Massage therapist</dt><dd>{booking.assignedStaffName || "Unassigned"}</dd></div>
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

      <CmsPanel title={`Notification activity · ${notifications.length}`} description="Past events stay in this history after a booking is confirmed. Accepted means the email provider received the message; Delivered means the recipient's email service accepted it.">
        {notifications.length ? (
          <ul className={styles.activityList}>
            {notifications.map((notification) => {
              const isEmail = notification.channel === "email";
              const retryAllowed = !booking.demo && canRetryBookingEmailNotification(notification);
              const delivery = isEmail ? bookingEmailDeliveryFeedback(notification, retryAllowed) : null;
              return (
              <li key={notification.id}>
                <Mail aria-hidden="true" />
                <div>
                  <strong>
                    {notification.audience === "owner" && notification.channel === "email"
                      ? "Owner booking alert"
                      : notification.audience === "customer" &&
                          notification.channel === "email" &&
                          notification.kind === "booking-confirmed"
                        ? "Customer confirmation email"
                      : notification.audience === "customer" &&
                          notification.channel === "email" &&
                          notification.kind === "booking-cancelled"
                        ? "Customer cancellation email"
                      : notification.audience === "customer" && isEmail && notification.kind === "booking-rescheduled"
                        ? "Customer reschedule email"
                      : notification.audience === "therapist" && isEmail
                        ? `Therapist email · ${notification.kind.replaceAll("booking-", "").replaceAll("-", " ")}`
                      : `${notification.kind.replaceAll("-", " ")} · ${notification.channel}`}
                  </strong>
                  <span>
                    {delivery?.label ?? "Historical activity"}
                    {(notification.status === "failed" ||
                      notification.status === "indeterminate") && notification.lastError
                      ? ` · ${notification.lastError.replaceAll("-", " ")}`
                      : ""}
                    {" · "}
                    {new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(notification.providerEventAt || notification.updatedAt || notification.createdAt))}
                  </span>
                  {delivery ? <span>{delivery.text}</span> : null}
                  {retryAllowed ? (
                    <CmsRetryBookingEmail
                      bookingId={booking.id}
                      notificationId={notification.id}
                      deliveryUncertain={isBookingEmailDeliveryUncertain(notification)}
                    />
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        ) : <p>No notification activity has been recorded for this booking.</p>}
      </CmsPanel>

      <BookingEditorForm
        booking={booking}
        therapists={therapistOptions}
        key={`editor:${booking.id}:${booking.version}`}
      />
    </>
  );
}
