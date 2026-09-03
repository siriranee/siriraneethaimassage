"use client";

import { CircleCheck, RotateCw, Search, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  isPublicBookingStatusSnapshot,
  type PublicBookingStatusSnapshot,
} from "@/domain/booking/public-status";

import styles from "./BookingStatusLookup.module.css";

type LookupResponse = {
  readonly bookingStatus?: unknown;
  readonly error?: string;
  readonly fields?: Readonly<Record<string, string>>;
};

export function BookingStatusLookup() {
  const [state, setState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [bookingStatus, setBookingStatus] =
    useState<PublicBookingStatusSnapshot | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state === "success" || state === "error") {
      feedbackRef.current?.focus();
    }
  }, [state]);

  async function checkStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "loading") return;

    const form = event.currentTarget;
    const identifier = String(new FormData(form).get("identifier") ?? "");
    setState("loading");
    setMessage("Checking your booking status...");
    setFieldError("");
    setBookingStatus(null);

    try {
      const response = await fetch("/api/public/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const result = (await response.json().catch(() => ({
        error: "The booking service returned an unreadable response.",
      }))) as LookupResponse;

      if (!response.ok) {
        setFieldError(result.fields?.identifier ?? "");
        setMessage(result.error ?? "The booking status could not be checked.");
        setState("error");
        return;
      }

      if (!isPublicBookingStatusSnapshot(result.bookingStatus)) {
        setMessage("The booking service returned an unreadable response.");
        setState("error");
        return;
      }

      setBookingStatus(result.bookingStatus);
      setMessage(result.bookingStatus.message);
      setState("success");
    } catch {
      setMessage(
        "The booking status could not be checked. Check your connection and try again.",
      );
      setState("error");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="status-lookup-title">
      <div className={styles.intro}>
        <span className={styles.iconWrap} aria-hidden="true">
          <ShieldCheck />
        </span>
        <div>
          <p className={styles.eyebrow}>Private status check</p>
          <h2 id="status-lookup-title">Find your booking</h2>
          <p>
            Enter the booking ID or reference from your confirmation. This check
            shows status only and never displays contact or appointment details.
          </p>
        </div>
      </div>

      <form className={styles.form} onSubmit={checkStatus}>
        <label htmlFor="booking-status-identifier">
          Booking ID or reference
          <span>For example, SRN-20260903-ABC123</span>
        </label>
        <div className={styles.inputRow}>
          <input
            aria-describedby={
              fieldError
                ? "booking-status-hint booking-status-error"
                : "booking-status-hint"
            }
            aria-invalid={Boolean(fieldError)}
            autoCapitalize="characters"
            autoComplete="off"
            id="booking-status-identifier"
            maxLength={120}
            minLength={16}
            name="identifier"
            placeholder="SRN-YYYYMMDD-XXXXXX"
            required
            spellCheck={false}
            type="text"
          />
          <button disabled={state === "loading"} type="submit">
            {state === "loading" ? (
              <RotateCw aria-hidden="true" />
            ) : (
              <Search aria-hidden="true" />
            )}
            {state === "loading" ? "Checking..." : "Check status"}
          </button>
        </div>
        <p className={styles.hint} id="booking-status-hint">
          References are not case-sensitive. Your identifier is sent securely and
          is not placed in the page URL.
        </p>
        {fieldError ? (
          <p className={styles.fieldError} id="booking-status-error">
            {fieldError}
          </p>
        ) : null}
      </form>

      {state === "success" && bookingStatus ? (
        <div
          className={styles.result}
          data-status={bookingStatus.code}
          ref={feedbackRef}
          tabIndex={-1}
        >
          <CircleCheck aria-hidden="true" />
          <div>
            <p>Current status</p>
            <h3>{bookingStatus.label}</h3>
            <span>{message}</span>
          </div>
        </div>
      ) : state === "error" ? (
        <div
          className={styles.error}
          ref={feedbackRef}
          role="alert"
          tabIndex={-1}
        >
          <strong>Status unavailable</strong>
          <p>{message}</p>
        </div>
      ) : (
        <div className={styles.idleNotice} aria-live="polite">
          <ShieldCheck aria-hidden="true" />
          <p>{state === "loading" ? message : "Ready to check securely."}</p>
        </div>
      )}
    </section>
  );
}
