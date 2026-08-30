"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { bookingChangeReasons, bookingStatuses, type CmsBooking } from "@/domain/cms/types";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

type StaffOption = {
  readonly id: string;
  readonly name: string;
};

export function BookingEditorForm({
  booking,
  staff,
}: Readonly<{
  booking: CmsBooking;
  staff: readonly StaffOption[];
}>) {
  const router = useRouter();
  const [version, setVersion] = useState(booking.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/cms/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          localDate: data.get("localDate"),
          localTime: data.get("localTime"),
          status: data.get("status"),
          changeReason: data.get("changeReason"),
          assignedStaffId: data.get("assignedStaffId"),
          internalNotes: data.get("internalNotes"),
        }),
      });
      const result = (await response.json()) as { error?: string; booking?: CmsBooking };

      if (!response.ok || !result.booking) {
        setFeedback({ tone: "error", text: result.error ?? "The booking could not be saved." });
        return;
      }

      setVersion(result.booking.version);
      markSaved();
      setFeedback({ tone: "success", text: "Booking changes saved." });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: "The CMS could not be reached. Please try again." });
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
              {bookingStatuses.map((status) => <option key={status} value={status}>{status === "no-show" ? "No-show" : status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
            </select>
          </label>
          <label className={styles.field}>Date<input defaultValue={booking.localDate} name="localDate" required type="date" /></label>
          <label className={styles.field}>Dublin time<input defaultValue={booking.localTime} name="localTime" required step={300} type="time" /></label>
          <label className={styles.field}>Change reason
            <select defaultValue="" name="changeReason">
              <option value="">Not changing status or time</option>
              {bookingChangeReasons.map((reason) => <option key={reason} value={reason}>{reason.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</option>)}
            </select>
            <small>Required when changing status, date or time. Uses a controlled reason so sensitive details do not enter the audit log.</small>
          </label>
          <label className={styles.field}>Assigned staff, internal only
            <select defaultValue={booking.assignedStaffId} name="assignedStaffId">
              <option value="">Unassigned</option>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
            <small>Customers never see or choose this field.</small>
          </label>
          <label className={styles.fullField}>Internal notes<textarea defaultValue={booking.internalNotes} maxLength={1000} name="internalNotes" /></label>
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Booking version ${version}${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : "Save booking"}</button>
      </div>
    </form>
  );
}
