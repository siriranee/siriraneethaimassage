"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { formatCalendarDate } from "@/domain/booking/calendar-month";

import styles from "./DayOffConfirmation.module.css";

type DayOffConfirmationProps = {
  readonly localDate: string;
  readonly therapistId: string;
  readonly therapistName: string;
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
};

export function DayOffConfirmation({ localDate, therapistId, therapistName, triggerRef, onCancel, onSaved }: DayOffConfirmationProps) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    const trigger = triggerRef?.current ?? document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [triggerRef]);

  function cancel() {
    if (!saveLock.current) onCancel();
  }

  async function confirm() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/cms/closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localDate,
          therapistId,
          closedAllDay: true,
          startsAtLocal: "",
          endsAtLocal: "",
          reason: "Day off",
          publicLabel: "",
          active: true,
          repeatWeeklyCount: 1,
        }),
      });
      const result = await response.json() as { error?: string; closure?: { id: string } };
      if (!response.ok || !result.closure?.id) {
        if (mounted.current) setError(result.error || "The day off could not be saved. Please try again.");
        return;
      }
      // A completed save still needs a refresh if navigation replaced the dialog.
      router.refresh();
      if (mounted.current) onSaved();
    } catch {
      if (mounted.current) setError("The CMS could not be reached. Please try again.");
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <dialog
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      aria-busy={saving}
      className={styles.dialog}
      onCancel={(event) => { event.preventDefault(); cancel(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        if (saveLock.current) {
          event.preventDefault();
        } else if (event.shiftKey && event.target === cancelRef.current) {
          event.preventDefault();
          confirmRef.current?.focus();
        } else if (!event.shiftKey && event.target === confirmRef.current) {
          event.preventDefault();
          cancelRef.current?.focus();
        }
      }}
      ref={dialogRef}
    >
      <div aria-hidden="true" className={styles.icon}><Ban /></div>
      <h2 id={titleId}>Confirm day off</h2>
      <p id={descriptionId}>
        {therapistId ? <><strong>{therapistName}</strong> will be unavailable for bookings all day.</> : <>The whole business will be unavailable for bookings all day, for <strong>all therapists</strong>.</>}
      </p>
      <div className={styles.date}><strong>{formatCalendarDate(localDate)}</strong><span>Dublin time · One day only</span></div>
      <p className={styles.hint}>Any conflicting appointments must be reassigned, rescheduled or cancelled first. You can reopen this day from the calendar.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button disabled={saving} onClick={cancel} ref={cancelRef} type="button">Cancel</button>
        <button className={styles.confirm} disabled={saving} onClick={confirm} ref={confirmRef} type="button">{saving ? "Saving..." : "Confirm day off"}</button>
      </div>
    </dialog>
  );
}
