"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsClosure } from "@/domain/cms/types";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

export function ClosureForm({ defaultDate, closure }: Readonly<{ defaultDate: string; closure?: CmsClosure }>) {
  const router = useRouter();
  const [closedAllDay, setClosedAllDay] = useState(closure?.closedAllDay ?? true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(closure ? `/api/cms/closures/${closure.id}` : "/api/cms/closures", {
        method: closure ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localDate: data.get("localDate"),
          expectedVersion: closure?.version,
          closedAllDay,
          startsAtLocal: data.get("startsAtLocal"),
          endsAtLocal: data.get("endsAtLocal"),
          reason: data.get("reason"),
          publicLabel: data.get("publicLabel"),
          active: closure ? data.get("active") === "on" : true,
          repeatWeeklyCount: closure ? 1 : Number(data.get("repeatWeeklyCount")),
        }),
      });
      const result = (await response.json()) as { error?: string; closure?: { id: string; repeatedCount?: number } };

      if (!response.ok || !result.closure) {
        setFeedback({ tone: "error", text: result.error ?? "The closure could not be saved." });
        return;
      }

      setFeedback({ tone: "success", text: closure ? "Calendar closure updated." : result.closure.repeatedCount && result.closure.repeatedCount > 1 ? `${result.closure.repeatedCount} weekly closures added.` : "Calendar closure added." });
      markSaved();
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
        <header className={styles.sectionHeader}><h2>{closure ? "Edit closure or blocked time" : "Add closure or blocked time"}</h2><p>Conflicting active bookings must be resolved before an active closure can be saved.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Date<input defaultValue={closure?.localDate ?? defaultDate} name="localDate" required type="date" /></label>
          <label className={styles.checkbox}><input checked={closedAllDay} onChange={(event) => setClosedAllDay(event.target.checked)} type="checkbox" /><span>Day off<small>Clear this to block only part of the day.</small></span></label>
          <label className={styles.field}>Starts<input defaultValue={closure?.startsAtLocal || "12:00"} disabled={closedAllDay} name="startsAtLocal" required={!closedAllDay} type="time" /></label>
          <label className={styles.field}>Ends<input defaultValue={closure?.endsAtLocal || "13:00"} disabled={closedAllDay} name="endsAtLocal" required={!closedAllDay} type="time" /></label>
          {!closure ? <label className={styles.field}>Repeat weekly<input defaultValue={1} max={12} min={1} name="repeatWeeklyCount" required type="number" /><small>Creates 1–12 weekly closures atomically after every date passes conflict checks.</small></label> : null}
          {closure ? <label className={styles.checkbox}><input defaultChecked={closure.active} name="active" type="checkbox" /><span>Closure active<small>Clear this to retain the history while releasing the blocked time.</small></span></label> : null}
          <label className={styles.fullField}>Internal reason<input defaultValue={closure?.reason ?? ""} maxLength={200} minLength={2} name="reason" placeholder="Holiday, maintenance or private block" required /></label>
          <label className={styles.fullField}>Optional public label<input defaultValue={closure?.publicLabel ?? ""} maxLength={120} name="publicLabel" placeholder="Closed for bank holiday" /></label>
        </div>
      </section>
      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Dublin local time${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : closure ? "Save closure" : "Add closure"}</button>
      </div>
    </form>
  );
}
