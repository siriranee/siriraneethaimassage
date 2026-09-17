"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  customerBookingCancellationEmailFeedback,
  customerBookingConfirmationEmailFeedback,
  customerBookingRescheduleEmailFeedback,
  type CustomerBookingCancellationEmailOutcome,
  type CustomerBookingConfirmationEmailOutcome,
  type CustomerBookingRescheduleEmailOutcome,
} from "@/domain/booking/confirmation-email";
import {
  getAllowedBookingStatusTransitions,
  isTerminalBookingStatus,
} from "@/domain/booking/status";
import { bookingChangeReasons, type CmsBooking } from "@/domain/cms/types";
import { withTherapistEmailFeedback, type TherapistEmailAttempt } from "@/domain/cms/notification-presentation";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

export function BookingEditorForm({
  booking,
  therapists,
}: Readonly<{
  booking: CmsBooking;
  therapists: readonly { readonly id: string; readonly name: string }[];
}>) {
  const router = useRouter();
  const [version, setVersion] = useState(booking.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const statusOptions = [
    booking.status,
    ...getAllowedBookingStatusTransitions(booking.status),
  ];
  const appointmentLocked = isTerminalBookingStatus(booking.status);
  const [therapistId, setTherapistId] = useState(booking.assignedStaffId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextStatus = data.get("status");
    if (
      booking.status !== "confirmed" &&
      nextStatus === "confirmed" &&
      !window.confirm(
        booking.demo
          ? `Confirm demo booking ${booking.reference}? Demo mode will not contact Resend.`
          : booking.customer.email
          ? `Confirm booking ${booking.reference} and email the customer now?`
          : `Confirm booking ${booking.reference}? No customer email is recorded, so no confirmation email will be sent.`,
      )
    ) {
      return;
    }
    if (
      booking.status !== "cancelled" &&
      nextStatus === "cancelled" &&
      !window.confirm(
        booking.demo
          ? `Cancel demo booking ${booking.reference}? Demo mode will not contact Resend. This cannot be undone.`
          : booking.customer.email
            ? `Cancel booking ${booking.reference} and email the customer now? This cannot be undone.`
            : `Cancel booking ${booking.reference}? No customer email is recorded, so no cancellation email will be sent. This cannot be undone.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/cms/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          localDate: data.get("localDate"),
          localTime: data.get("localTime"),
          therapistId,
          status: data.get("status"),
          changeReason: data.get("changeReason"),
          internalNotes: data.get("internalNotes"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        booking?: CmsBooking;
        confirmationEmail?: CustomerBookingConfirmationEmailOutcome;
        cancellationEmail?: CustomerBookingCancellationEmailOutcome;
        rescheduleEmail?: CustomerBookingRescheduleEmailOutcome;
        therapistEmails?: readonly TherapistEmailAttempt[];
      };

      if (!response.ok || !result.booking) {
        setFeedback({ tone: "error", text: result.error ?? "The booking could not be saved." });
        return;
      }

      setVersion(result.booking.version);
      markSaved();
      setFeedback(withTherapistEmailFeedback(
        result.confirmationEmail
          ? customerBookingConfirmationEmailFeedback(result.confirmationEmail)
          : result.cancellationEmail
            ? customerBookingCancellationEmailFeedback(result.cancellationEmail)
          : result.rescheduleEmail
            ? customerBookingRescheduleEmailFeedback(result.rescheduleEmail)
          : { tone: "success", text: "Booking changes saved." },
        result.therapistEmails,
      ));
      router.refresh();
    } catch {
      setFeedback({
        tone: "warning",
        text: "The response was interrupted. Review the booking and Resend status before trying again.",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onChange={markDirty} onSubmit={save}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Appointment status & time</h2><p>Rescheduled times are checked against hours, closures and capacity before saving.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Status
            <select defaultValue={booking.status} name="status">
              {statusOptions.map((status) => <option key={status} value={status}>{status === "no-show" ? "No-show" : status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
            </select>
            <small>{booking.demo ? "Demo mode does not contact Resend. " : "Confirming or cancelling a booking emails the customer when an email address is recorded. Rescheduling or changing the therapist for a confirmed appointment also emails the updated details. "}Final statuses cannot be reopened.</small>
          </label>
          <label className={styles.field}>Date<input defaultValue={booking.localDate} disabled={appointmentLocked} name="localDate" required type="date" /></label>
          <label className={styles.field}>Dublin time<input defaultValue={booking.localTime} disabled={appointmentLocked} name="localTime" required step={300} type="time" /></label>
          <label className={styles.field}>Massage therapist
            <select
              disabled={appointmentLocked}
              name="therapistId"
              onChange={(event) => setTherapistId(event.target.value)}
              value={therapistId}
            >
              <option value="">Unassigned</option>
              {therapists.map((therapist) => (
                <option key={therapist.id} value={therapist.id}>{therapist.name}</option>
              ))}
            </select>
            <small>Assign a therapist before confirming or rescheduling. Existing unassigned appointments can still have their notes updated. Changing the therapist rechecks availability and requires a change reason. {booking.demo ? "Demo mode does not send emails." : "Assigned therapists receive appointment updates in separate emails."}</small>
          </label>
          <label className={styles.field}>Change reason
            <select defaultValue="" name="changeReason">
              <option value="">Not changing status or time</option>
              {bookingChangeReasons.map((reason) => <option key={reason} value={reason}>{reason.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</option>)}
            </select>
            <small>Required when changing status, date, time or therapist. Uses a controlled reason so sensitive details do not enter the audit log.</small>
          </label>
          <label className={styles.fullField}>Internal notes<textarea defaultValue={booking.internalNotes} maxLength={1000} name="internalNotes" /></label>
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={styles[feedback.tone]} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Booking version ${version}${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : "Save booking"}</button>
      </div>
    </form>
  );
}
