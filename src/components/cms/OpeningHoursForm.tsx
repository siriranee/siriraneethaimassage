"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsSiteSettings } from "@/domain/cms/types";

import {
  CmsValidatedForm,
  safeCmsFieldErrors,
} from "./CmsValidatedForm";
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
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    site.weeklyHours.forEach((_, index) => {
      const open = form.elements.namedItem(`open-${index}`);
      const opens = form.elements.namedItem(`opens-${index}`);
      const closes = form.elements.namedItem(`closes-${index}`);
      if (closes instanceof HTMLInputElement) {
        closes.setCustomValidity(
          open instanceof HTMLInputElement &&
            open.checked &&
            opens instanceof HTMLInputElement &&
            opens.value >= closes.value
            ? "Closing time must be later than opening time."
            : "",
        );
      }
    });
    if (!form.reportValidity()) return;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});
    const data = new FormData(form);
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
      const result = (await response.json()) as {
        error?: string;
        fields?: unknown;
        site?: CmsSiteSettings;
      };

      if (!response.ok || !result.site) {
        setFieldErrors(safeCmsFieldErrors(result.fields));
        setFeedback({ tone: "error", text: result.error ?? "Opening hours could not be saved." });
        return;
      }

      setFieldErrors({});
      setVersion(result.site.version);
      setFeedback({ tone: "success", text: "Opening hours saved and published." });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: "The CMS could not be reached. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CmsValidatedForm
      className={styles.form}
      onSubmit={save}
      serverErrors={fieldErrors}
    >
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Regular weekly hours</h2><p>Times are local to Europe/Dublin. Closed days retain their times for easy reopening.</p></header>
        <div className={styles.priceList}>
          {site.weeklyHours.map((row, index) => (
            <div className={styles.priceRow} key={row.day}>
              <label className={styles.checkbox}><input data-cms-field={`weeklyHours.${index}.open`} defaultChecked={row.open} name={`open-${index}`} type="checkbox" /><span>{row.day}<small>Open for appointments</small></span></label>
              <label>Opens<input data-cms-field={`weeklyHours.${index}.opens`} defaultValue={row.opens} name={`opens-${index}`} required type="time" /></label>
              <label>Closes<input data-cms-after-field={`weeklyHours.${index}.opens`} data-cms-after-when-checked={`weeklyHours.${index}.open`} data-cms-field={`weeklyHours.${index}.closes`} defaultValue={row.closes} name={`closes-${index}`} required type="time" /></label>
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
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Published version ${version}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving and publishing..." : "Save and publish opening hours"}</button>
      </div>
    </CmsValidatedForm>
  );
}
