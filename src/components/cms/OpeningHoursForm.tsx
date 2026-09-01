"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsSiteSettings } from "@/domain/cms/types";

import styles from "./CmsEditorForm.module.css";

function basePayload(site: CmsSiteSettings) {
  return {
    name: site.name,
    alternateName: site.alternateName,
    streetAddress: site.streetAddress,
    locality: site.locality,
    region: site.region,
    postalCode: site.postalCode,
    country: site.country,
    phoneDisplay: site.phoneDisplay,
    phoneE164: site.phoneE164,
    phoneConfirmed: site.phoneConfirmed,
    email: site.email,
    whatsappNumber: site.whatsappNumber,
    instagramUrl: site.instagramUrl,
    booksyUrl: site.booksyUrl,
    googleReviewUrl: site.googleReviewUrl,
    serviceAreas: site.serviceAreas,
    arrivalGuidance: site.arrivalGuidance,
    arrivalAssistance: site.arrivalAssistance,
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
  };
}

export function OpeningHoursForm({ site }: Readonly<{ site: CmsSiteSettings }>) {
  const router = useRouter();
  const [version, setVersion] = useState(site.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    const weeklyHours = site.weeklyHours.map((row, index) => ({
      day: row.day,
      open: data.get(`open-${index}`) === "on",
      opens: String(data.get(`opens-${index}`) ?? row.opens),
      closes: String(data.get(`closes-${index}`) ?? row.closes),
    }));

    try {
      const response = await fetch("/api/cms/settings/site", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basePayload(site),
          expectedVersion: version,
          weeklyHours,
          openingHoursConfirmed: data.get("openingHoursConfirmed") === "on",
        }),
      });
      const result = (await response.json()) as { error?: string; site?: CmsSiteSettings };

      if (!response.ok || !result.site) {
        setFeedback({ tone: "error", text: result.error ?? "Opening hours could not be saved." });
        return;
      }

      setVersion(result.site.version);
      setFeedback({ tone: "success", text: "Opening hours saved to the draft." });
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
        <header className={styles.sectionHeader}><h2>Regular weekly hours</h2><p>Times are local to Europe/Dublin. Closed days retain their times for easy reopening.</p></header>
        <div className={styles.priceList}>
          {site.weeklyHours.map((row, index) => (
            <div className={styles.priceRow} key={row.day}>
              <label className={styles.checkbox}><input defaultChecked={row.open} name={`open-${index}`} type="checkbox" /><span>{row.day}<small>Open for appointments</small></span></label>
              <label>Opens<input defaultValue={row.opens} name={`opens-${index}`} required type="time" /></label>
              <label>Closes<input defaultValue={row.closes} name={`closes-${index}`} required type="time" /></label>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Owner confirmation</h2><p>This is a business decision, not just a publishing control.</p></header>
        <label className={styles.checkbox}>
          <input defaultChecked={site.openingHoursConfirmed} name="openingHoursConfirmed" type="checkbox" />
          <span>I confirm these are the current public opening hours<small>Public date and time booking cannot be enabled until this is confirmed.</small></span>
        </label>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Draft version ${version}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : "Save opening hours"}</button>
      </div>
    </form>
  );
}
