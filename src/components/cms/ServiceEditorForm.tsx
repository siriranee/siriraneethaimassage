"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { serviceCategories } from "@/content/services";
import type { CmsServicePrice, CmsServiceRecord } from "@/domain/cms/types";
import { SeoEditorFields } from "./SeoEditorFields";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

function lines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ServiceEditorForm({
  service,
  isNew = false,
}: Readonly<{ service: CmsServiceRecord; isNew?: boolean }>) {
  const router = useRouter();
  const [version, setVersion] = useState(service.version);
  const [priceRows, setPriceRows] = useState<readonly CmsServicePrice[]>(
    service.prices,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setMessage("");

    const data = new FormData(event.currentTarget);
    const prices = priceRows.map((price) => ({
      id: price.id,
      durationMinutes: Number(data.get(`duration-${price.id}`)),
      priceCents: Math.round(Number(data.get(`price-${price.id}`)) * 100),
      active: data.get(`active-${price.id}`) === "on",
    }));

    const payload = {
      expectedVersion: version,
      slug: data.get("slug"),
      name: data.get("name"),
      category: data.get("category"),
      shortDescription: data.get("shortDescription"),
      longDescription: data.get("longDescription"),
      imageUrl: data.get("imageUrl"),
      imageAlt: data.get("imageAlt"),
      prices,
      idealFor: lines(data.get("idealFor")),
      highlights: lines(data.get("highlights")),
      bookingNotice: data.get("bookingNotice"),
      seoTitle: data.get("seoTitle"),
      seoDescription: data.get("seoDescription"),
      status: data.get("status"),
      sortOrder: Number(data.get("sortOrder")),
    };

    try {
      const response = await fetch(
        isNew ? "/api/cms/services" : `/api/cms/services/${service.id}`,
        {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        service?: CmsServiceRecord;
      };

      if (!response.ok || !result.service) {
        setSaveState("error");
        setMessage(result.error ?? "The treatment could not be saved.");
        return;
      }

      setVersion(result.service.version);
      markSaved();
      setSaveState("saved");
      setMessage(isNew ? "Treatment draft created." : "Treatment draft saved.");
      if (isNew) {
        router.push(`/cms/services/${result.service.id}/edit`);
      }
      router.refresh();
    } catch {
      setSaveState("error");
      setMessage("The CMS could not be reached. Please try again.");
    }
  }

  return (
    <form className={styles.form} onChange={markDirty} onSubmit={save}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2>Treatment details</h2>
          <p>The slug is intentionally stable so existing links continue to work.</p>
        </header>
        <div className={styles.grid}>
          <label className={styles.field}>Name<input defaultValue={service.name} maxLength={100} minLength={2} name="name" required /></label>
          <label className={styles.field}>Category<select defaultValue={service.category} name="category">{serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
          <label className={styles.field}>URL slug{isNew ? <input defaultValue={service.slug} maxLength={100} minLength={2} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /> : <><input name="slug" type="hidden" value={service.slug} /><span className={styles.readOnly}>{service.slug}</span></>}</label>
          <label className={styles.field}>Display order<input defaultValue={service.sortOrder} max={1000} min={0} name="sortOrder" required type="number" /></label>
          <label className={styles.fullField}>Short description<textarea defaultValue={service.shortDescription} maxLength={300} minLength={20} name="shortDescription" required /></label>
          <label className={styles.fullField}>Full description<textarea defaultValue={service.longDescription} maxLength={2000} minLength={40} name="longDescription" required /></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2>Durations & prices</h2>
          <p>Prices are entered in euro. Existing bookings keep their original snapshot.</p>
        </header>
        <div className={styles.priceList}>
          {priceRows.map((price) => (
            <div className={styles.priceRow} key={price.id}>
              <label>Duration, minutes<input defaultValue={price.durationMinutes} max={240} min={15} name={`duration-${price.id}`} required step={5} type="number" /></label>
              <label>Price, €<input defaultValue={(price.priceCents / 100).toFixed(2)} max={1000} min={1} name={`price-${price.id}`} required step="0.01" type="number" /></label>
              <label className={styles.checkbox}><input defaultChecked={price.active} name={`active-${price.id}`} type="checkbox" /><span>Available option<small>Inactive prices stay in history but are not offered publicly.</small></span></label>
              <button className={styles.removeButton} disabled={priceRows.length === 1} onClick={() => setPriceRows((rows) => rows.filter((row) => row.id !== price.id))} type="button">Remove option</button>
            </div>
          ))}
          <button
            className={styles.secondaryButton}
            disabled={priceRows.length >= 8}
            onClick={() => setPriceRows((rows) => [...rows, { id: `new-${crypto.randomUUID()}`, durationMinutes: 60, priceCents: 6500, active: true }])}
            type="button"
          >
            Add duration and price
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Image & supporting copy</h2><p>Use truthful, descriptive alternative text.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Image path or URL<input defaultValue={service.imageUrl} name="imageUrl" required /></label>
          <label className={styles.fullField}>Image alternative text<input defaultValue={service.imageAlt} maxLength={180} minLength={8} name="imageAlt" required /></label>
          <label className={styles.field}>Ideal for, one per line<textarea defaultValue={service.idealFor.join("\n")} name="idealFor" /></label>
          <label className={styles.field}>Highlights, one per line<textarea defaultValue={service.highlights.join("\n")} name="highlights" /></label>
          <label className={styles.fullField}>Booking note<textarea defaultValue={service.bookingNotice} maxLength={500} name="bookingNotice" /></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Search appearance & status</h2><p>Keep the title clear and locally relevant without repeating keywords unnaturally.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Status<select defaultValue={service.status} name="status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
          <span />
          <SeoEditorFields description={service.seoDescription} title={service.seoTitle} />
        </div>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">
          {message ? <span className={saveState === "error" ? styles.error : styles.success} role={saveState === "error" ? "alert" : undefined}>{message}</span> : `Draft version ${version}${dirty ? " · unsaved changes" : ""}`}
        </span>
        <button disabled={saveState === "saving"} type="submit">{saveState === "saving" ? "Saving..." : isNew ? "Create treatment draft" : "Save treatment"}</button>
      </div>
    </form>
  );
}
