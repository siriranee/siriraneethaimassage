"use client";

import { CalendarClock, CheckCircle2, ExternalLink, LockKeyhole } from "lucide-react";
import Script from "next/script";
import { useState } from "react";

import { acuityConfig } from "@/content/booking";

import styles from "./AcuityScheduler.module.css";

type AcuitySchedulerProps = {
  readonly directUrl: string;
  readonly embedUrl: string;
  readonly selectionLabel: string;
};

export function AcuityScheduler({
  directUrl,
  embedUrl,
  selectionLabel,
}: AcuitySchedulerProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <section
      className={styles.scheduler}
      id="live-booking-calendar"
      aria-labelledby="live-booking-title"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Live calendar</p>
          <h2 id="live-booking-title">Choose a time</h2>
          <p>Times are shown in Dublin time.</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.liveBadge}>
            <CheckCircle2 aria-hidden="true" /> Live availability
          </span>
          <a href={directUrl} target="_blank" rel="noreferrer">
            Open directly
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className={styles.selection}>
        <CalendarClock aria-hidden="true" />
        <span>
          <small>Preselected from your booking</small>
          <strong>{selectionLabel}</strong>
        </span>
      </div>

      <p className={styles.frameFallback}>
        If the embedded calendar is blank or blocked by your browser, use{" "}
        <a href={directUrl} target="_blank" rel="noreferrer">
          the direct Acuity calendar
          <ExternalLink aria-hidden="true" />
        </a>
        {" "}instead.
      </p>

      <div className={styles.frameShell} aria-busy={!loaded}>
        {!loaded ? (
          <div className={styles.loading} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <strong>Opening the live calendar…</strong>
            <p>This may take a moment on a slower connection.</p>
          </div>
        ) : null}
        <iframe
          className={`acuity-embed ${styles.frame} ${loaded ? styles.frameLoaded : ""}`}
          onLoad={() => setLoaded(true)}
          referrerPolicy="strict-origin-when-cross-origin"
          src={embedUrl}
          title="Siriranee Thai Massage live appointment calendar"
        />
      </div>

      <div className={styles.providerNote}>
        <span>
          <LockKeyhole aria-hidden="true" />
          Book securely with {acuityConfig.providerName}.
        </span>
        <a href={directUrl} target="_blank" rel="noreferrer">
          Open calendar in a new tab
          <ExternalLink aria-hidden="true" />
        </a>
      </div>

      <Script
        id="acuity-embed-resize"
        src={acuityConfig.resizeScriptUrl}
        strategy="lazyOnload"
      />
    </section>
  );
}
