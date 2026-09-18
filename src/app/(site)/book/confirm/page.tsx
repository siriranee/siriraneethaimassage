import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BookingEmailConfirmationButton } from "@/components/booking/BookingEmailConfirmationButton";
import { getBookingEmailConfirmationReview } from "@/server/booking/booking-email-confirmation";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Review booking confirmation | Siriranee",
  description: "Securely review and confirm a Siriranee booking request.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  },
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(priceCents / 100);
}

function UnavailableConfirmation({
  reason,
  confirmationRole,
}: Readonly<{
  reason: string;
  confirmationRole?: "owner" | "therapist";
}>) {
  const expired = reason === "expired";
  const changed = reason === "stale";
  const ownerLink = confirmationRole === "owner";

  return (
    <section className={`${styles.card} ${styles.unavailableCard}`}>
      <span className={styles.alertIcon}>
        <TriangleAlert aria-hidden="true" />
      </span>
      <p className={styles.eyebrow}>Confirmation unavailable</p>
      <h1>{expired ? "This link has expired" : changed ? "The booking has changed" : "This booking cannot be confirmed from this link"}</h1>
      <p>
        {expired
          ? "For security, email confirmation links close after 48 hours or when the appointment begins."
          : changed
            ? "The booking was updated after this email was sent, so the old link can no longer confirm it safely."
            : "This link cannot confirm the booking. It may already be closed, replaced or no longer eligible for email confirmation."}
      </p>
      <Link className={styles.primaryLink} href={ownerLink ? "/cms/bookings" : "/contact"}>
        {ownerLink ? "Open booking management" : "Contact Siriranee"}
      </Link>
    </section>
  );
}

export default async function BookingEmailConfirmationPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ readonly token?: string | string[] }>;
}>) {
  const query = await searchParams;
  const token = firstValue(query.token) ?? "";
  const review = await getBookingEmailConfirmationReview(token);
  const therapistConfirmation = review.confirmationRole === "therapist";
  const ownerConfirmation = review.confirmationRole === "owner";

  return (
    <div className={styles.main}>
      <div aria-hidden="true" className={styles.glowOne} />
      <div aria-hidden="true" className={styles.glowTwo} />
      <div className={styles.container}>
        <Link
          className={styles.backLink}
          href={ownerConfirmation ? "/cms/bookings" : "/"}
        >
          <ArrowLeft aria-hidden="true" />
          {ownerConfirmation ? "Back to bookings" : "Back to Siriranee"}
        </Link>

        {review.kind === "unavailable" ? (
          <UnavailableConfirmation
            confirmationRole={review.confirmationRole}
            reason={review.reason}
          />
        ) : (
          <section className={styles.card}>
            <header className={styles.header}>
              <span className={review.kind === "already-confirmed" ? styles.successIcon : styles.shieldIcon}>
                {review.kind === "already-confirmed" ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
              </span>
              <div>
                <p className={styles.eyebrow}>
                  {therapistConfirmation
                    ? "Therapist booking review"
                    : "Secure booking review"}
                </p>
                <h1>
                  {review.kind === "already-confirmed"
                    ? "Booking already confirmed"
                    : therapistConfirmation
                      ? "Can you take this booking?"
                      : "Confirm this booking request"}
                </h1>
                <p className={styles.intro}>
                  {review.kind === "already-confirmed"
                    ? "No action is needed. A second click will not send duplicate confirmation emails."
                    : therapistConfirmation
                      ? "Check the appointment details below. Accepting confirms that you can take it, and the customer will receive a confirmation email if they provided an address. No login is required."
                      : "Check the appointment details below before confirming. The customer will receive a confirmation email after approval if they provided an address."}
                </p>
              </div>
            </header>

            <div className={styles.referenceRow}>
              <span>Booking reference</span>
              <strong>{review.booking.reference}</strong>
              <span className={review.kind === "already-confirmed" ? styles.confirmedBadge : styles.pendingBadge}>
                {review.kind === "already-confirmed" ? "Confirmed" : "Awaiting confirmation"}
              </span>
            </div>

            <dl className={styles.details}>
              <div>
                <dt><Sparkles aria-hidden="true" /> Treatment</dt>
                <dd>{review.booking.serviceName}</dd>
                <span>{review.booking.durationMinutes} minutes · {formatPrice(review.booking.priceCents, review.booking.currency)}</span>
              </div>
              <div>
                <dt><CalendarDays aria-hidden="true" /> Date</dt>
                <dd>{formatDate(review.booking.localDate)}</dd>
                <span>Europe/Dublin</span>
              </div>
              <div>
                <dt><Clock3 aria-hidden="true" /> Time</dt>
                <dd>{review.booking.localTime}</dd>
                <span>Dublin local time</span>
              </div>
              <div>
                <dt><UserRound aria-hidden="true" /> Therapist</dt>
                <dd>{review.booking.assignedStaffName || "Not assigned"}</dd>
                <span>Assigned practitioner</span>
              </div>
            </dl>

            {review.kind === "ready" ? (
              <div className={styles.actionPanel}>
                <div>
                  <h2>
                    {therapistConfirmation
                      ? "Available for this appointment?"
                      : "Ready to approve?"}
                  </h2>
                  <p>
                    {therapistConfirmation
                      ? "Accepting confirms this booking. Contact the shop owner if any detail is incorrect."
                      : "This action confirms the booking and cannot be undone from this email link."}
                  </p>
                </div>
                <BookingEmailConfirmationButton
                  confirmationRole={review.confirmationRole}
                  token={token}
                />
              </div>
            ) : (
              <div className={styles.confirmedPanel} role="status">
                <CheckCircle2 aria-hidden="true" />
                <div>
                  <strong>This appointment is confirmed.</strong>
                  <p>
                    {therapistConfirmation
                      ? "Contact the shop owner if the appointment needs to change."
                      : "Open the CMS if you need to reschedule, cancel or review email delivery."}
                  </p>
                </div>
              </div>
            )}

            <p className={styles.securityNote}>
              <ShieldCheck aria-hidden="true" /> This private link contains no customer contact details, requires no login and expires automatically. Do not forward or share it.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
