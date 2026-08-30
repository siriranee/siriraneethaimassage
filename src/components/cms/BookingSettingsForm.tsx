"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsBookingSettings } from "@/domain/cms/types";

import styles from "./CmsEditorForm.module.css";

export function BookingSettingsForm({
  openingHoursConfirmed,
  settings,
}: Readonly<{
  openingHoursConfirmed: boolean;
  settings: CmsBookingSettings;
}>) {
  const router = useRouter();
  const [version, setVersion] = useState(settings.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      expectedVersion: version,
      publicBookingEnabled: false,
      rulesConfirmed: data.get("rulesConfirmed") === "on",
      slotIntervalMinutes: Number(data.get("slotIntervalMinutes")),
      maxConcurrentBookings: Number(data.get("maxConcurrentBookings")),
      minimumNoticeMinutes: Number(data.get("minimumNoticeMinutes")),
      bookingHorizonDays: Number(data.get("bookingHorizonDays")),
      bufferBeforeMinutes: Number(data.get("bufferBeforeMinutes")),
      bufferAfterMinutes: Number(data.get("bufferAfterMinutes")),
      holdMinutes: Number(data.get("holdMinutes")),
      cancellationCutoffMinutes: Number(data.get("cancellationCutoffMinutes")),
      provisionalNotice: data.get("provisionalNotice"),
    };

    try {
      const response = await fetch("/api/cms/settings/booking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; settings?: CmsBookingSettings };

      if (!response.ok || !result.settings) {
        setFeedback({ tone: "error", text: result.error ?? "Booking rules could not be saved." });
        return;
      }

      setVersion(result.settings.version);
      setFeedback({ tone: "success", text: "Booking rules saved to the draft." });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: "The CMS could not be reached. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Calendar basis</h2><p>All public and administrative times use one source of truth.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Timezone<span className={styles.readOnly}>{settings.timezone}</span></label>
          <label className={styles.field}>Currency<span className={styles.readOnly}>{settings.currency}</span></label>
          <label className={styles.field}>Slot interval, minutes<input defaultValue={settings.slotIntervalMinutes} max={120} min={5} name="slotIntervalMinutes" required step={5} type="number" /></label>
          <label className={styles.field}>Maximum concurrent bookings<input defaultValue={settings.maxConcurrentBookings} max={20} min={1} name="maxConcurrentBookings" required type="number" /><small>Keep at one until treatment rooms and working schedules are confirmed.</small></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Booking policy</h2><p>These values affect which time slots can be offered.</p></header>
        <div className={styles.threeGrid}>
          <label className={styles.field}>Minimum notice, minutes<input defaultValue={settings.minimumNoticeMinutes} max={10080} min={0} name="minimumNoticeMinutes" required type="number" /></label>
          <label className={styles.field}>Booking horizon, days<input defaultValue={settings.bookingHorizonDays} max={365} min={1} name="bookingHorizonDays" required type="number" /></label>
          <label className={styles.field}>Temporary hold, minutes<input defaultValue={settings.holdMinutes} max={30} min={2} name="holdMinutes" required type="number" /></label>
          <label className={styles.field}>Buffer before, minutes<input defaultValue={settings.bufferBeforeMinutes} max={120} min={0} name="bufferBeforeMinutes" required type="number" /></label>
          <label className={styles.field}>Buffer after, minutes<input defaultValue={settings.bufferAfterMinutes} max={120} min={0} name="bufferAfterMinutes" required type="number" /></label>
          <label className={styles.field}>Cancellation cutoff, minutes<input defaultValue={settings.cancellationCutoffMinutes} max={10080} min={0} name="cancellationCutoffMinutes" required type="number" /></label>
          <label className={styles.fullField}>Internal provisional note<textarea defaultValue={settings.provisionalNotice} maxLength={500} name="provisionalNotice" /></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Confirmation & launch gate</h2><p>Confirmation records the owner decision; it does not activate unfinished public booking.</p></header>
        <div className={styles.grid}>
          <label className={styles.checkbox}>
            <input defaultChecked={settings.rulesConfirmed} name="rulesConfirmed" type="checkbox" />
            <span>I confirm capacity, notice, horizon, buffers and cancellation cutoff<small>Opening hours are currently {openingHoursConfirmed ? "confirmed" : "not confirmed"}.</small></span>
          </label>
          <label className={styles.checkbox}>
            <input checked={false} disabled readOnly type="checkbox" />
            <span>Enable public date and time booking<small>Locked until collision, privacy, notification and recovery checks are complete.</small></span>
          </label>
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Draft version ${version}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : "Save booking rules"}</button>
      </div>
    </form>
  );
}
