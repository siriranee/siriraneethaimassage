"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { formatCalendarDate } from "@/domain/booking/calendar-month";
import type { CmsClosure } from "@/domain/cms/types";

import styles from "./CmsDeleteBookingButton.module.css";
import dialogStyles from "./DayOffConfirmation.module.css";

export function CmsDeleteClosureButton({ closure, therapistName, returnHref }: Readonly<{
  closure: CmsClosure;
  therapistName: string;
  returnHref: string;
}>) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const deleteLock = useRef(false);
  const mounted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const label = closure.closedAllDay ? "day off" : "blocked time";
  const scope = closure.therapistId ? therapistName : "all therapists · whole business";

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [confirming]);

  function cancel() {
    if (!deleteLock.current) setConfirming(false);
  }

  async function deleteClosure() {
    if (!confirming || deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    setFeedback("");
    let deleted = false;
    try {
      const response = await fetch(`/api/cms/closures/${closure.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: closure.version }),
      });
      const result = await response.json() as { error?: string; deleted?: { id?: string } };
      if (!response.ok || result.deleted?.id !== closure.id) {
        if (mounted.current) setFeedback(result.error ?? `The ${label} could not be deleted. Please reload and try again.`);
        return;
      }
      deleted = true;
      if (mounted.current) router.replace(returnHref);
      router.refresh();
    } catch {
      if (mounted.current) setFeedback("The CMS could not be reached. Please try again.");
    } finally {
      if (!deleted) {
        deleteLock.current = false;
        if (mounted.current) setDeleting(false);
      }
    }
  }

  return (
    <div className={styles.root}>
      <button aria-haspopup="dialog" className={styles.button} disabled={deleting} onClick={() => { setFeedback(""); setConfirming(true); }} ref={triggerRef} type="button">
        {deleting ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : <Trash2 aria-hidden="true" />}
        {deleting ? "Deleting..." : `Delete ${label}`}
      </button>
      {confirming ? <dialog
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-modal="true"
        aria-busy={deleting}
        className={dialogStyles.dialog}
        ref={dialogRef}
        onCancel={(event) => { event.preventDefault(); cancel(); }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          if (deleteLock.current) event.preventDefault();
          else if (event.shiftKey && event.target === cancelRef.current) {
            event.preventDefault();
            confirmRef.current?.focus();
          } else if (!event.shiftKey && event.target === confirmRef.current) {
            event.preventDefault();
            cancelRef.current?.focus();
          }
        }}
      >
        <h2 id={titleId}>Delete {label}?</h2>
        <p id={descriptionId}>Remove this saved {label} for <strong>{scope}</strong>? This cannot be undone.</p>
        <div className={dialogStyles.date}><strong>{formatCalendarDate(closure.localDate)}</strong><span>{closure.closedAllDay ? "All day" : `${closure.startsAtLocal}–${closure.endsAtLocal}`} · Dublin time</span></div>
        <p className={dialogStyles.hint}>Only this block will be removed. Other days off and existing appointments stay unchanged. Availability will follow the remaining schedule.</p>
        {feedback ? <p className={dialogStyles.error} role="alert">{feedback}</p> : null}
        <div className={dialogStyles.actions}>
          <button disabled={deleting} onClick={cancel} ref={cancelRef} type="button">Cancel</button>
          <button className={dialogStyles.danger} disabled={deleting} onClick={deleteClosure} ref={confirmRef} type="button">{deleting ? "Deleting..." : "Confirm delete"}</button>
        </div>
      </dialog> : null}
    </div>
  );
}
