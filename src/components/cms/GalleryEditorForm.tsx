"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsGalleryRecord } from "@/domain/cms/types";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

export function GalleryEditorForm({
  item,
  isNew = false,
}: Readonly<{ item: CmsGalleryRecord; isNew?: boolean }>) {
  const router = useRouter();
  const [version, setVersion] = useState(item.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(
        isNew ? "/api/cms/gallery" : `/api/cms/gallery/${item.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: version,
            imageUrl: data.get("imageUrl"),
            altText: data.get("altText"),
            caption: data.get("caption"),
            published: data.get("published") === "on",
            sortOrder: Number(data.get("sortOrder")),
          }),
        },
      );
      const result = (await response.json()) as { error?: string; item?: CmsGalleryRecord };
      if (!response.ok || !result.item) {
        setFeedback({ tone: "error", text: result.error ?? "The gallery record could not be saved." });
        return;
      }

      setVersion(result.item.version);
      markSaved();
      setFeedback({ tone: "success", text: isNew ? "Gallery draft created." : "Gallery draft saved." });
      if (isNew) router.push(`/cms/media/${result.item.id}/edit`);
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: "The CMS could not be reached. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onChange={markDirty} onSubmit={save}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2>Image information</h2>
          <p>Use a project image path until a production media provider and backup owner are approved.</p>
        </header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Image path or approved URL<input defaultValue={item.imageUrl} name="imageUrl" placeholder="/images/spa/example.webp" required /></label>
          <label className={styles.fullField}>Alternative text<input defaultValue={item.altText} maxLength={180} minLength={8} name="altText" required /><small>Describe what is visible; do not repeat “image of”.</small></label>
          <label className={styles.fullField}>Caption<input defaultValue={item.caption} maxLength={240} minLength={2} name="caption" required /></label>
          <label className={styles.field}>Display order<input defaultValue={item.sortOrder} max={1000} min={0} name="sortOrder" required type="number" /></label>
          <label className={styles.checkbox}><input defaultChecked={item.published} name="published" type="checkbox" /><span>Include in next publication<small>The live gallery changes only after publishing the complete content snapshot.</small></span></label>
        </div>
      </section>
      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Draft version ${version}${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : isNew ? "Create gallery draft" : "Save gallery item"}</button>
      </div>
    </form>
  );
}
