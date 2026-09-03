"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BookingStatus, CmsBooking } from "@/domain/cms/types";

import styles from "./CmsBookingQuickActions.module.css";

type QuickActionBooking = Pick<
  CmsBooking,
  "id" | "reference" | "localDate" | "localTime" | "status" | "version"
>;

export function CmsBookingQuickActions({
  booking,
}: Readonly<{ booking: QuickActionBooking }>) {
  const router = useRouter();
  const [status, setStatus] = useState(booking.status);
  const [version, setVersion] = useState(booking.version);
  const [savingStatus, setSavingStatus] = useState<BookingStatus | null>(null);
  const [feedback, setFeedback] = useState("");
  const canConfirm = status === "pending";
  const canCancel = status === "pending" || status === "confirmed";

  async function updateStatus(nextStatus: "confirmed" | "cancelled") {
    if (savingStatus) return;
    if (
      nextStatus === "cancelled" &&
      !window.confirm(`Cancel booking ${booking.reference}? This cannot be undone.`)
    ) {
      return;
    }

    setSavingStatus(nextStatus);
    setFeedback("");

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
        readonly error?: string;
      };

      if (!response.ok || !result.booking) {
        setFeedback(result.error ?? "The booking status could not be updated.");
        return;
      }

      setStatus(result.booking.status);
      setVersion(result.booking.version);
      setFeedback(
        result.booking.status === "confirmed"
          ? "Booking confirmed."
          : "Booking cancelled.",
      );
      router.refresh();
    } catch {
      setFeedback("The CMS could not be reached. Please try again.");
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
              aria-label={`Confirm booking ${booking.reference}`}
              className={styles.confirm}
              disabled={Boolean(savingStatus)}
              onClick={() => void updateStatus("confirmed")}
              title="Confirm booking"
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
              aria-label={`Cancel booking ${booking.reference}`}
              className={styles.cancel}
              disabled={Boolean(savingStatus)}
              onClick={() => void updateStatus("cancelled")}
              title="Cancel booking"
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
        <p aria-live="polite" className={styles.feedback}>
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
