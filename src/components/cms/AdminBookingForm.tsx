"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { AvailabilitySlot } from "@/domain/booking/availability";
import { CmsValidatedForm, safeCmsFieldErrors } from "./CmsValidatedForm";

import styles from "./CmsEditorForm.module.css";

type Variant = {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
};

type TherapistOption = {
  readonly id: string;
  readonly name: string;
  readonly serviceIds: readonly string[];
};

function createIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const values = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(
    values,
    (value) => value.toString(16).padStart(8, "0"),
  ).join("");
}

export function AdminBookingForm({
  defaultDate,
  isMock,
  therapists,
  variants,
}: Readonly<{
  defaultDate: string;
  isMock: boolean;
  therapists: readonly TherapistOption[];
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
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const idempotencyKeyRef = useRef("");
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const selectedVariant = useMemo(
    () => variants.find((variant) => `${variant.serviceId}|${variant.durationMinutes}` === variantKey),
    [variantKey, variants],
  );
  const eligibleTherapists = useMemo(
    () =>
      selectedVariant
        ? therapists.filter((therapist) =>
            therapist.serviceIds.includes(selectedVariant.serviceId),
          )
        : [],
    [selectedVariant, therapists],
  );
  const [therapistId, setTherapistId] = useState("");
  const selectedSlot = slots.find((slot) => slot.localTime === localTime);
  const isHistoricalSelection = Boolean(
    selectedSlot && Date.parse(selectedSlot.startsAt) <= currentTimeMs,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedVariant || !localDate || !therapistId) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      serviceId: selectedVariant.serviceId,
      durationMinutes: String(selectedVariant.durationMinutes),
      localDate,
      therapistId,
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
  }, [localDate, selectedVariant, therapistId]);

  function changeVariant(value: string) {
    const [serviceId] = value.split("|");
    const nextEligible = therapists.filter((therapist) =>
      therapist.serviceIds.includes(serviceId),
    );
    setVariantKey(value);
    setTherapistId((current) =>
      nextEligible.some((therapist) => therapist.id === current)
        ? current
        : "",
    );
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
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!selectedVariant || !localTime) {
      setFeedback("Choose an available time.");
      return;
    }

    const data = new FormData(form);
    const customerEmail = String(data.get("email") ?? "").trim();
    const historicalAtSubmission = Boolean(
      selectedSlot && Date.parse(selectedSlot.startsAt) <= Date.now(),
    );
    if (!window.confirm(
      isMock
        ? "Create this demo booking as confirmed? Demo mode will not send emails."
        : historicalAtSubmission
          ? "Create this historical booking as confirmed? No customer or therapist email will be sent."
          : `Create this booking as confirmed? The system will send a confirmation to ${customerEmail} and notify the therapist.`,
    )) {
      return;
    }

    setSaving(true);
    setFeedback("");
    setFieldErrors({});
    idempotencyKeyRef.current ||= createIdempotencyKey();

    try {
      const response = await fetch("/api/cms/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          customerName: data.get("customerName"),
          phone: data.get("phone"),
          email: data.get("email"),
          customerNotes: data.get("customerNotes"),
          serviceId: selectedVariant.serviceId,
          therapistId,
          durationMinutes: selectedVariant.durationMinutes,
          localDate,
          localTime,
          status: "confirmed",
          source: data.get("source"),
          internalNotes: data.get("internalNotes"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        fields?: unknown;
        booking?: { id: string };
      };

      if (!response.ok || !result.booking) {
        idempotencyKeyRef.current = "";
        setFieldErrors(safeCmsFieldErrors(result.fields));
        setFeedback(result.error ?? "The booking could not be saved.");
        return;
      }

      router.push(`/cms/bookings/${result.booking.id}`);
      router.refresh();
    } catch {
      setFeedback(
        "The response was interrupted. Check Bookings and Resend before submitting again to avoid a duplicate.",
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <CmsValidatedForm className={styles.form} onSubmit={save} serverErrors={fieldErrors}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Appointment</h2><p>Fully booked and blocked times are removed from the time list.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Treatment and duration
            <select data-cms-field="serviceId" data-cms-field-aliases="durationMinutes" name="serviceVariant" onChange={(event) => changeVariant(event.target.value)} required value={variantKey}>
              {variants.map((variant) => (
                <option key={`${variant.serviceId}-${variant.durationMinutes}`} value={`${variant.serviceId}|${variant.durationMinutes}`}>
                  {variant.serviceName} · {variant.durationMinutes} min · €{(variant.priceCents / 100).toFixed(0)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fullField}>Massage therapist
            <select
              name="therapistId"
              onChange={(event) => {
                setTherapistId(event.target.value);
                setSlots([]);
                setLocalTime("");
                setAvailabilityState("loading");
              }}
              required
              value={therapistId}
            >
              <option value="">Choose a massage therapist</option>
              {eligibleTherapists.map((therapist) => (
                <option key={therapist.id} value={therapist.id}>{therapist.name}</option>
              ))}
            </select>
            <small>Availability is checked for the selected therapist. {isMock ? "Demo mode does not send emails." : "Upcoming appointments send the therapist a separate email; historical entries do not."}</small>
          </label>
          <label className={styles.field}>Date<input name="localDate" onChange={(event) => changeDate(event.target.value)} required type="date" value={localDate} /><small>Past dates and times can be recorded in Dublin time.</small></label>
          <label className={styles.field}>Available time
            <select data-cms-field="localTime" disabled={!therapistId || availabilityState === "loading" || !slots.length} name="localTime" onChange={(event) => setLocalTime(event.target.value)} required value={localTime}>
              <option value="">{!therapistId ? "Choose a therapist first" : availabilityState === "loading" ? "Checking times..." : slots.length ? "Choose a time" : "No available times"}</option>
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
          <label className={styles.field}>Phone<input defaultValue={isMock ? "+353 00 000 0000" : ""} inputMode="tel" maxLength={30} minLength={7} name="phone" pattern="(?=(?:\\D*\\d){7,})\\+?[\\d\\s().-]{7,30}" required title="Use 7–30 characters and include at least seven digits." type="tel" /></label>
          <label className={styles.fullField}>Customer email{isHistoricalSelection ? ", optional for historical entries" : ""}<input maxLength={254} name="email" required={!isHistoricalSelection} type="email" /><small>{isMock ? "Required for upcoming demo appointments; demo mode does not send emails." : isHistoricalSelection ? "This appointment has already started, so no customer or therapist emails will be sent." : "Required for upcoming appointments so the customer receives a confirmation email. Historical entries may omit it."}</small></label>
          <label className={styles.fullField}>Customer note, optional<textarea maxLength={1000} name="customerNotes" /><small>Do not record unnecessary medical or sensitive information.</small></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Booking details</h2><p>New bookings are confirmed immediately. Record how the appointment arrived.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Source<select defaultValue="phone" name="source"><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="walk-in">Walk-in</option><option value="administrator">Administrator</option></select></label>
          <label className={styles.fullField}>Internal notes<textarea maxLength={1000} name="internalNotes" /></label>
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={styles.error} role="alert">{feedback}</span> : selectedVariant ? `€${(selectedVariant.priceCents / 100).toFixed(0)} · ${selectedVariant.durationMinutes} minutes` : "Choose a treatment"}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : isMock ? "Create & confirm demo booking" : "Create & confirm booking"}</button>
      </div>
    </CmsValidatedForm>
  );
}
