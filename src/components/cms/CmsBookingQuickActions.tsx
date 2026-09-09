"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  customerBookingCancellationEmailFeedback,
  customerBookingConfirmationEmailFeedback,
  type CustomerBookingCancellationEmailOutcome,
  type CustomerBookingConfirmationEmailOutcome,
} from "@/domain/booking/confirmation-email";
import type { BookingStatus, CmsBooking } from "@/domain/cms/types";

import styles from "./CmsBookingQuickActions.module.css";

type QuickActionBooking = Pick<
  CmsBooking,
  "id" | "reference" | "localDate" | "localTime" | "status" | "version"
>;

export function CmsBookingQuickActions({
  booking,
  hasCustomerEmail,
  isMock,
}: Readonly<{
  booking: QuickActionBooking;
  hasCustomerEmail: boolean;
  isMock: boolean;
}>) {
  const router = useRouter();
  const [status, setStatus] = useState(booking.status);
  const [version, setVersion] = useState(booking.version);
  const [savingStatus, setSavingStatus] = useState<BookingStatus | null>(null);
  const [feedback, setFeedback] = useState<{
    readonly text: string;
    readonly tone: "success" | "warning" | "error";
  } | null>(null);
  const canConfirm = status === "pending";
  const canCancel = status === "pending" || status === "confirmed";

  async function updateStatus(nextStatus: "confirmed" | "cancelled") {
    if (savingStatus) return;
    if (
      nextStatus === "confirmed" &&
      !window.confirm(
        isMock
          ? `Confirm demo booking ${booking.reference}? Demo mode will not contact Resend.`
          : hasCustomerEmail
          ? `Confirm booking ${booking.reference} and email the customer now?`
          : `Confirm booking ${booking.reference}? No customer email is recorded, so no confirmation email will be sent.`,
      )
    ) {
      return;
    }
    if (
      nextStatus === "cancelled" &&
      !window.confirm(
        isMock
          ? `Cancel demo booking ${booking.reference}? Demo mode will not contact Resend. This cannot be undone.`
          : hasCustomerEmail
            ? `Cancel booking ${booking.reference} and email the customer now? This cannot be undone.`
            : `Cancel booking ${booking.reference}? No customer email is recorded, so no cancellation email will be sent. This cannot be undone.`,
      )
    ) {
      return;
    }

    setSavingStatus(nextStatus);
    setFeedback(null);

    try {
      const response = await fetch(`/api/cms/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          localDate: booking.localDate,
          localTime: booking.localTime,
          status: nextStatus,
          changeReason: "other-operational",
        }),
      });
      const result = (await response.json()) as {
        readonly booking?: CmsBooking;
        readonly confirmationEmail?: CustomerBookingConfirmationEmailOutcome;
        readonly cancellationEmail?: CustomerBookingCancellationEmailOutcome;
        readonly error?: string;
      };

      if (!response.ok || !result.booking) {
        setFeedback({
          tone: "error",
          text: result.error ?? "The booking status could not be updated.",
        });
        return;
      }

      setStatus(result.booking.status);
      setVersion(result.booking.version);
      setFeedback(
        result.confirmationEmail
          ? customerBookingConfirmationEmailFeedback(result.confirmationEmail)
          : result.cancellationEmail
            ? customerBookingCancellationEmailFeedback(result.cancellationEmail)
          : {
              tone: "success",
              text:
                result.booking.status === "confirmed"
                  ? "Booking confirmed."
                  : "Booking cancelled.",
            },
      );
      router.refresh();
    } catch {
      setFeedback({
        tone: "warning",
        text: "The response was interrupted. Review the booking and Resend status before trying again.",
      });
      router.refresh();
    } finally {
      setSavingStatus(null);
    }
  }

  if (!canConfirm && !canCancel && !feedback) return null;

  return (
    <div className={styles.wrap}>
      {canConfirm || canCancel ? (
        <div aria-label={`Quick actions for ${booking.reference}`} className={styles.actions} role="group">
          {canConfirm ? (
            <button
              aria-label={
                isMock
                  ? `Confirm demo booking ${booking.reference}; Resend will not be contacted`
                  : hasCustomerEmail
                  ? `Confirm booking ${booking.reference} and email customer`
                  : `Confirm booking ${booking.reference}; no customer email is recorded`
              }
              className={styles.confirm}
              disabled={Boolean(savingStatus)}
              onClick={() => void updateStatus("confirmed")}
              title={
                isMock
                  ? "Confirm demo booking without contacting Resend"
                  : hasCustomerEmail
                  ? "Confirm booking and email customer"
                  : "Confirm booking without customer email"
              }
              type="button"
            >
              {savingStatus === "confirmed" ? (
                <LoaderCircle aria-hidden="true" className={styles.spinner} />
              ) : (
                <Check aria-hidden="true" />
              )}
            </button>
          ) : null}
          {canCancel ? (
            <button
              aria-label={
                isMock
                  ? `Cancel demo booking ${booking.reference}; Resend will not be contacted`
                  : hasCustomerEmail
                    ? `Cancel booking ${booking.reference} and email customer`
                    : `Cancel booking ${booking.reference}; no customer email is recorded`
              }
              className={styles.cancel}
              disabled={Boolean(savingStatus)}
              onClick={() => void updateStatus("cancelled")}
              title={
                isMock
                  ? "Cancel demo booking without contacting Resend"
                  : hasCustomerEmail
                    ? "Cancel booking and email customer"
                    : "Cancel booking without customer email"
              }
              type="button"
            >
              {savingStatus === "cancelled" ? (
                <LoaderCircle aria-hidden="true" className={styles.spinner} />
              ) : (
                <X aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      ) : null}
      {feedback ? (
        <p
          aria-live="polite"
          className={`${styles.feedback} ${styles[feedback.tone]}`}
          role={feedback.tone === "error" ? "alert" : undefined}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
