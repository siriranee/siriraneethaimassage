"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsSiteSettings } from "@/domain/cms/types";

import styles from "./CmsEditorForm.module.css";

function lines(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function SiteBusinessForm({ site }: Readonly<{ site: CmsSiteSettings }>) {
  const router = useRouter();
  const [version, setVersion] = useState(site.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      expectedVersion: version,
      name: data.get("name"),
      alternateName: data.get("alternateName"),
      streetAddress: data.get("streetAddress"),
      locality: data.get("locality"),
      region: data.get("region"),
      postalCode: data.get("postalCode"),
      country: data.get("country"),
      phoneDisplay: data.get("phoneDisplay"),
      phoneE164: data.get("phoneE164"),
      phoneConfirmed: data.get("phoneConfirmed") === "on",
      email: data.get("email"),
      whatsappNumber: data.get("whatsappNumber"),
      instagramUrl: data.get("instagramUrl"),
      booksyUrl: data.get("booksyUrl"),
      googleReviewUrl: data.get("googleReviewUrl"),
      serviceAreas: lines(data.get("serviceAreas")),
      arrivalGuidance: data.get("arrivalGuidance"),
      arrivalAssistance: data.get("arrivalAssistance"),
      seoTitle: data.get("seoTitle"),
      seoDescription: data.get("seoDescription"),
      weeklyHours: site.weeklyHours,
      openingHoursConfirmed: site.openingHoursConfirmed,
    };

    try {
      const response = await fetch("/api/cms/settings/site", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; site?: CmsSiteSettings };

      if (!response.ok || !result.site) {
        setFeedback({ tone: "error", text: result.error ?? "Business information could not be saved." });
        return;
      }

      setVersion(result.site.version);
      setFeedback({ tone: "success", text: "Business information saved to the draft." });
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
        <header className={styles.sectionHeader}><h2>Business identity</h2><p>Use the exact public trading name and location information.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Business name<input defaultValue={site.name} maxLength={100} minLength={2} name="name" required /></label>
          <label className={styles.field}>Short brand name<input defaultValue={site.alternateName} maxLength={80} minLength={2} name="alternateName" required /></label>
          <label className={styles.fullField}>Street address<input defaultValue={site.streetAddress} maxLength={180} minLength={5} name="streetAddress" required /></label>
          <label className={styles.field}>Locality<input defaultValue={site.locality} maxLength={80} minLength={2} name="locality" required /></label>
          <label className={styles.field}>County / region<input defaultValue={site.region} maxLength={80} minLength={2} name="region" required /></label>
          <label className={styles.field}>Postal code<input defaultValue={site.postalCode} maxLength={20} name="postalCode" /></label>
          <label className={styles.field}>Country<input defaultValue={site.country} maxLength={80} minLength={2} name="country" required /></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Contact channels</h2><p>These values are reused by the header, footer, contact page and structured data.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Phone shown to visitors<input defaultValue={site.phoneDisplay} maxLength={40} name="phoneDisplay" /></label>
          <label className={styles.field}>Phone in E.164 format<input defaultValue={site.phoneE164} maxLength={25} name="phoneE164" placeholder="+353123456789" /></label>
          <label className={styles.checkbox}>
            <input defaultChecked={site.phoneConfirmed} name="phoneConfirmed" type="checkbox" />
            <span>I confirm this public phone number<small>Until confirmed and published, no phone number or call button appears on the website or in search data.</small></span>
          </label>
          <label className={styles.field}>Email address<input defaultValue={site.email} maxLength={254} name="email" type="email" /></label>
          <label className={styles.field}>WhatsApp number<input defaultValue={site.whatsappNumber} maxLength={25} name="whatsappNumber" /></label>
          <label className={styles.fullField}>Instagram URL<input defaultValue={site.instagramUrl} name="instagramUrl" type="url" /></label>
          <label className={styles.fullField}>Booksy or booking provider URL<input defaultValue={site.booksyUrl} name="booksyUrl" type="url" /></label>
          <label className={styles.fullField}>Google review URL<input defaultValue={site.googleReviewUrl} name="googleReviewUrl" type="url" /></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Local area & arrival</h2><p>Nearby areas support useful local SEO when written naturally.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Service areas, one per line<textarea defaultValue={site.serviceAreas.join("\n")} name="serviceAreas" /></label>
          <label className={styles.fullField}>Arrival guidance<textarea defaultValue={site.arrivalGuidance} maxLength={500} minLength={20} name="arrivalGuidance" required /></label>
          <label className={styles.fullField}>Accessibility / arrival assistance<textarea defaultValue={site.arrivalAssistance} maxLength={500} minLength={20} name="arrivalAssistance" required /></label>
        </div>
      </section>

      <section className={styles.section} id="seo">
        <header className={styles.sectionHeader}><h2>Search appearance</h2><p>Keep Dublin and Howth phrasing helpful and accurate.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Default SEO title<input defaultValue={site.seoTitle} maxLength={70} minLength={10} name="seoTitle" required /></label>
          <label className={styles.fullField}>Default SEO description<textarea defaultValue={site.seoDescription} maxLength={170} minLength={40} name="seoDescription" required /></label>
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Draft version ${version}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : "Save business information"}</button>
      </div>
    </form>
  );
}
