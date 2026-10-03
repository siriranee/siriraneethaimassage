"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  analyticsConsentKey,
  analyticsPreferencesEvent,
  canTrackPage,
  googleMeasurementId,
  startGoogleAnalytics,
  stopGoogleAnalytics,
  trackPublicPage,
} from "@/lib/analytics";

import styles from "./AnalyticsConsent.module.css";

type Consent = "loading" | "accepted" | "rejected" | "unset";
const consentChangeEvent = "siriranee:analytics-consent-change";
let currentPageChoice: "accepted" | "rejected" | null = null;

function subscribeToConsent(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(consentChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(consentChangeEvent, callback);
  };
}

function readConsent(): Consent {
  try {
    const saved = window.localStorage.getItem(analyticsConsentKey);
    if (saved === "accepted" || saved === "rejected") return saved;
  } catch {
    // Private browsing may make localStorage unavailable.
  }
  return currentPageChoice ?? "unset";
}

function serverConsent(): Consent {
  return "loading";
}

export function AnalyticsConsent() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeToConsent, readConsent, serverConsent);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const openPreferences = () => setPreferencesOpen(true);
    window.addEventListener(analyticsPreferencesEvent, openPreferences);
    return () => window.removeEventListener(analyticsPreferencesEvent, openPreferences);
  }, []);

  useEffect(() => {
    if (consent !== "accepted" || !canTrackPage(pathname)) return;
    startGoogleAnalytics();
    trackPublicPage(pathname);
  }, [consent, pathname]);

  function saveConsent(next: "accepted" | "rejected") {
    currentPageChoice = next;
    try {
      window.localStorage.setItem(analyticsConsentKey, next);
    } catch {
      // The choice still applies to the current page.
    }
    const withdrawing = consent === "accepted" && next === "rejected";
    if (withdrawing) stopGoogleAnalytics();
    window.dispatchEvent(new Event(consentChangeEvent));
    setPreferencesOpen(false);
    if (withdrawing) window.location.reload();
  }

  return (
    <>
      {consent === "accepted" && canTrackPage(pathname) ? (
        <Script
          id="siriranee-google-tag"
          src={`https://www.googletagmanager.com/gtag/js?id=${googleMeasurementId}`}
          strategy="afterInteractive"
        />
      ) : null}
      {consent === "unset" || preferencesOpen ? (
        <aside aria-label="Analytics preferences" className={styles.panel}>
          <div className={styles.copy}>
            <h2>Analytics cookies</h2>
            <p>
              With your permission, Google Analytics helps us understand visits
              and booking requests. Booking contact details are not sent. You can
              change this choice anytime in the footer. {" "}
              <Link href="/privacy">Read the privacy notice</Link>.
            </p>
          </div>
          <div className={styles.actions}>
            <button className={styles.decline} onClick={() => saveConsent("rejected")} type="button">
              Reject analytics
            </button>
            <button className={styles.accept} onClick={() => saveConsent("accepted")} type="button">
              Accept analytics
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
