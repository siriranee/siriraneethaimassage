"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsPromotionRecord } from "@/domain/cms/types";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

export function PromotionEditorForm({ promotion, isNew = false }: Readonly<{ promotion: CmsPromotionRecord; isNew?: boolean }>) {
  const router = useRouter();
  const [version, setVersion] = useState(promotion.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(isNew ? "/api/cms/promotions" : `/api/cms/promotions/${promotion.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          title: data.get("title"),
          description: data.get("description"),
          status: data.get("status"),
          startsOn: data.get("startsOn"),
          endsOn: data.get("endsOn"),
        }),
      });
      const result = (await response.json()) as { error?: string; promotion?: CmsPromotionRecord };
      if (!response.ok || !result.promotion) {
        setFeedback({ tone: "error", text: result.error ?? "The promotion could not be saved." });
        return;
      }
      setVersion(result.promotion.version);
      markSaved();
      setFeedback({ tone: "success", text: isNew ? "Promotion draft created." : "Promotion draft saved." });
      if (isNew) router.push(`/cms/promotions/${result.promotion.id}/edit`);
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
        <header className={styles.sectionHeader}><h2>Offer details</h2><p>Publish only genuine owner-approved offers with clear dates and wording.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Title<input defaultValue={promotion.title} maxLength={120} minLength={2} name="title" required /></label>
          <label className={styles.fullField}>Description<textarea defaultValue={promotion.description} maxLength={1000} minLength={10} name="description" required /></label>
          <label className={styles.field}>Status<select defaultValue={promotion.status} name="status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
          <span />
          <label className={styles.field}>Start date, optional<input defaultValue={promotion.startsOn} name="startsOn" type="date" /></label>
          <label className={styles.field}>End date, optional<input defaultValue={promotion.endsOn} name="endsOn" type="date" /></label>
        </div>
      </section>
      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Draft version ${version}${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving..." : isNew ? "Create promotion draft" : "Save promotion"}</button>
      </div>
    </form>
  );
}
