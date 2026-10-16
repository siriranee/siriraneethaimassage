"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { CmsClosure } from "@/domain/cms/types";
import { CmsValidatedForm, safeCmsFieldErrors } from "./CmsValidatedForm";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

type ClosureFormProps = {
  readonly defaultDate: string;
  readonly closure?: CmsClosure;
  readonly therapists: readonly { readonly id: string; readonly name: string }[];
  readonly defaultTherapistId?: string;
  readonly defaultClosedAllDay?: boolean;
  readonly inline?: boolean;
  readonly onSaved?: () => void;
};

export function ClosureForm({ defaultDate, closure, therapists, defaultTherapistId = "", defaultClosedAllDay = true, inline = false, onSaved }: ClosureFormProps) {
  const router = useRouter();
  const [closedAllDay, setClosedAllDay] = useState(closure?.closedAllDay ?? defaultClosedAllDay);
  const [therapistId, setTherapistId] = useState(closure?.therapistId ?? defaultTherapistId);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const mounted = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    const form = event.currentTarget;
    const starts = form.elements.namedItem("startsAtLocal");
    const ends = form.elements.namedItem("endsAtLocal");
    if (starts instanceof HTMLInputElement) starts.setCustomValidity("");
    if (ends instanceof HTMLInputElement) {
      ends.setCustomValidity(
        !closedAllDay &&
          starts instanceof HTMLInputElement &&
          starts.value >= ends.value
          ? "End time must be later than start time."
          : "",
      );
    }
    if (!form.reportValidity()) return;
    saveLock.current = true;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});
    const data = new FormData(form);

    try {
      const response = await fetch(closure ? `/api/cms/closures/${closure.id}` : "/api/cms/closures", {
        method: closure ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localDate: data.get("localDate"),
          therapistId,
          expectedVersion: closure?.version,
          closedAllDay,
          startsAtLocal: data.get("startsAtLocal"),
          endsAtLocal: data.get("endsAtLocal"),
          reason: data.get("reason"),
          publicLabel: data.get("publicLabel"),
          active: closure ? data.get("active") === "on" : true,
          repeatWeeklyCount: closure || inline ? 1 : Number(data.get("repeatWeeklyCount")),
        }),
      });
      const result = (await response.json()) as { error?: string; fields?: unknown; closure?: { id: string; repeatedCount?: number } };

      if (!response.ok || !result.closure) {
        if (!mounted.current) return;
        setFieldErrors(safeCmsFieldErrors(result.fields));
        setFeedback({ tone: "error", text: result.error ?? "The closure could not be saved." });
        return;
      }

      // A completed request still changed availability after the user switched
      // dates or therapists. Refresh it without dismissing their new form.
      router.refresh();
      if (!mounted.current) return;
      setFeedback({ tone: "success", text: closure ? "Calendar closure updated." : result.closure.repeatedCount && result.closure.repeatedCount > 1 ? `${result.closure.repeatedCount} weekly closures added.` : "Calendar closure added." });
      markSaved();
      onSaved?.();
    } catch {
      if (mounted.current) setFeedback({ tone: "error", text: "The CMS could not be reached. Please try again." });
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <CmsValidatedForm aria-label={closure ? "Edit day off or blocked time" : "Add day off or blocked time"} className={`${styles.form} ${inline ? styles.inlineForm : ""}`} onChange={markDirty} onSubmit={save} serverErrors={fieldErrors}>
      <fieldset className={styles.formFields} disabled={saving}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>{closure ? "Edit day off or blocked time" : closedAllDay ? "Add a day off" : "Block time"}</h2><p>{therapistId ? `Applies only to ${therapists.find((therapist) => therapist.id === therapistId)?.name ?? "this therapist"}.` : "Applies to all therapists in the business."} Existing appointments must be resolved before conflicting time off can be saved.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Applies to<select name="therapistId" value={therapistId} onChange={(event) => setTherapistId(event.target.value)}><option value="">All therapists · whole business</option>{therapists.map((therapist) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}{therapistId && !therapists.some((therapist) => therapist.id === therapistId) ? <option value={therapistId}>Former therapist</option> : null}</select></label>
          <label className={styles.field}>Date<input defaultValue={closure?.localDate ?? defaultDate} name="localDate" required type="date" /></label>
          <label className={styles.checkbox}><input checked={closedAllDay} name="closedAllDay" onChange={(event) => setClosedAllDay(event.target.checked)} type="checkbox" /><span>Day off<small>Clear this to block only part of the day.</small></span></label>
          <label className={styles.field}>Starts<input defaultValue={closure?.startsAtLocal || "12:00"} disabled={closedAllDay} name="startsAtLocal" required={!closedAllDay} type="time" /></label>
          <label className={styles.field}>Ends<input data-cms-after-field="startsAtLocal" data-cms-after-unless-checked="closedAllDay" defaultValue={closure?.endsAtLocal || "13:00"} disabled={closedAllDay} name="endsAtLocal" required={!closedAllDay} type="time" /></label>
          {!closure && !inline ? <label className={styles.field}>Number of weekly occurrences<input defaultValue={1} max={12} min={1} name="repeatWeeklyCount" required type="number" /><small>Leave at 1 for a single date. For ongoing weekly days off, use the therapist&apos;s Team settings.</small></label> : null}
          {closure ? <label className={styles.checkbox}><input defaultChecked={closure.active} name="active" type="checkbox" /><span>Closure active<small>Clear this to retain the history while releasing the blocked time.</small></span></label> : null}
          <label className={styles.fullField}>Internal reason<input defaultValue={closure?.reason ?? (inline ? defaultClosedAllDay ? "Day off" : "Blocked time" : "")} maxLength={200} minLength={2} name="reason" placeholder="Holiday, maintenance or private block" required /></label>
          <label className={styles.fullField}>Optional public label<input defaultValue={closure?.publicLabel ?? ""} maxLength={120} name="publicLabel" placeholder="Closed for bank holiday" /></label>
        </div>
      </section>
      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Dublin local time${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : closure ? "Save changes" : closedAllDay ? "Save day off" : "Save blocked time"}</button>
      </div>
      </fieldset>
    </CmsValidatedForm>
  );
}
