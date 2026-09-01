"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { AvailabilitySlot } from "@/domain/booking/availability";

import styles from "./CmsEditorForm.module.css";

type Variant = {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
};

export function AdminBookingForm({
  defaultDate,
  isMock,
  variants,
}: Readonly<{
  defaultDate: string;
  isMock: boolean;
  variants: readonly Variant[];
}>) {
  const router = useRouter();
  const [variantKey, setVariantKey] = useState(
    variants[0] ? `${variants[0].serviceId}|${variants[0].durationMinutes}` : "",
  );
  const [localDate, setLocalDate] = useState(defaultDate);
  const [slots, setSlots] = useState<readonly AvailabilitySlot[]>([]);
  const [localTime, setLocalTime] = useState("");
  const [availabilityState, setAvailabilityState] = useState<"loading" | "ready" | "error">("loading");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selectedVariant = useMemo(
    () => variants.find((variant) => `${variant.serviceId}|${variant.durationMinutes}` === variantKey),
    [variantKey, variants],
  );

  useEffect(() => {
    if (!selectedVariant || !localDate) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      serviceId: selectedVariant.serviceId,
      durationMinutes: String(selectedVariant.durationMinutes),
      localDate,
    });
    void fetch(`/api/cms/availability?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as { error?: string; slots?: AvailabilitySlot[] };
        if (!response.ok || !result.slots) {
          throw new Error(result.error ?? "Availability could not be loaded.");
        }
        setSlots(result.slots);
        setAvailabilityState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSlots([]);
        setAvailabilityState("error");
        setAvailabilityMessage(error instanceof Error ? error.message : "Availability could not be loaded.");
      });

    return () => controller.abort();
  }, [localDate, selectedVariant]);

  function changeVariant(value: string) {
    setVariantKey(value);
    setSlots([]);
    setLocalTime("");
    setAvailabilityState("loading");
    setAvailabilityMessage("");
  }

  function changeDate(value: string) {
    setLocalDate(value);
    setSlots([]);
    setLocalTime("");
    setAvailabilityState("loading");
    setAvailabilityMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVariant || !localTime) {
      setFeedback("Choose an available time.");
      return;
    }

    setSaving(true);
    setFeedback("");
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/cms/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: data.get("customerName"),
          phone: data.get("phone"),
          email: data.get("email"),
          customerNotes: data.get("customerNotes"),
          serviceId: selectedVariant.serviceId,
          durationMinutes: selectedVariant.durationMinutes,
          localDate,
          localTime,
          status: data.get("status"),
          source: data.get("source"),
          internalNotes: data.get("internalNotes"),
        }),
      });
      const result = (await response.json()) as { error?: string; booking?: { id: string } };

      if (!response.ok || !result.booking) {
        setFeedback(result.error ?? "The booking could not be saved.");
        return;
      }

      router.push(`/cms/bookings/${result.booking.id}`);
      router.refresh();
    } catch {
      setFeedback("The CMS could not be reached. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Appointment</h2><p>Fully booked and blocked times are removed from the time list.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Treatment and duration
            <select onChange={(event) => changeVariant(event.target.value)} value={variantKey}>
              {variants.map((variant) => (
                <option key={`${variant.serviceId}-${variant.durationMinutes}`} value={`${variant.serviceId}|${variant.durationMinutes}`}>
                  {variant.serviceName} · {variant.durationMinutes} min · €{(variant.priceCents / 100).toFixed(0)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>Date<input min={defaultDate} onChange={(event) => changeDate(event.target.value)} required type="date" value={localDate} /></label>
          <label className={styles.field}>Available time
            <select disabled={availabilityState === "loading" || !slots.length} onChange={(event) => setLocalTime(event.target.value)} required value={localTime}>
              <option value="">{availabilityState === "loading" ? "Checking times..." : slots.length ? "Choose a time" : "No available times"}</option>
              {slots.map((slot) => <option key={slot.slotId} value={slot.localTime}>{slot.localTimeLabel}</option>)}
            </select>
            {availabilityMessage ? <small>{availabilityMessage}</small> : null}
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Customer</h2><p>{isMock ? 'Use a fictional name beginning with "Demo".' : "Collect only information needed to manage the appointment."}</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Customer name<input defaultValue={isMock ? "Demo guest" : ""} maxLength={100} minLength={2} name="customerName" required /></label>
          <label className={styles.field}>Phone<input defaultValue={isMock ? "+353 00 000 0000" : ""} maxLength={30} minLength={7} name="phone" required /></label>
          <label className={styles.fullField}>Email, optional<input maxLength={254} name="email" type="email" /></label>
          <label className={styles.fullField}>Customer note, optional<textarea maxLength={1000} name="customerNotes" /><small>Do not record unnecessary medical or sensitive information.</small></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Booking details</h2><p>Record how the appointment arrived and whether it is already confirmed.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Status<select defaultValue="confirmed" name="status"><option value="pending">Pending</option><option value="confirmed">Confirmed</option></select></label>
          <label className={styles.field}>Source<select defaultValue="phone" name="source"><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="walk-in">Walk-in</option><option value="administrator">Administrator</option></select></label>
          <label className={styles.fullField}>Internal notes<textarea maxLength={1000} name="internalNotes" /></label>
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={styles.error} role="alert">{feedback}</span> : selectedVariant ? `€${(selectedVariant.priceCents / 100).toFixed(0)} · ${selectedVariant.durationMinutes} minutes` : "Choose a treatment"}</span>
        <button disabled={saving || !localTime} type="submit">{saving ? "Saving..." : "Create booking"}</button>
      </div>
    </form>
  );
}
