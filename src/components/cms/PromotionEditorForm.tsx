"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsPromotionRecord } from "@/domain/cms/types";
import { CmsValidatedForm, safeCmsFieldErrors } from "./CmsValidatedForm";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

export function PromotionEditorForm({ promotion, isNew = false }: Readonly<{ promotion: CmsPromotionRecord; isNew?: boolean }>) {
  const router = useRouter();
  const [version, setVersion] = useState(promotion.version);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const start = form.elements.namedItem("startsOn");
    const end = form.elements.namedItem("endsOn");
    if (end instanceof HTMLInputElement) {
      end.setCustomValidity(
        start instanceof HTMLInputElement && start.value && end.value && end.value < start.value
          ? "End date must be on or after start date."
          : "",
      );
    }
    if (!form.reportValidity()) return;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});
    const data = new FormData(form);
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
      const result = (await response.json()) as { error?: string; fields?: unknown; promotion?: CmsPromotionRecord };
      if (!response.ok || !result.promotion) {
        setFieldErrors(safeCmsFieldErrors(result.fields));
        setFeedback({ tone: "error", text: result.error ?? "The promotion could not be saved." });
        return;
      }
      setVersion(result.promotion.version);
      markSaved();
      setFeedback({ tone: "success", text: isNew ? "Promotion created and website updated." : "Promotion saved and website updated." });
      if (isNew) router.push(`/cms/promotions/${result.promotion.id}/edit`);
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: "The CMS could not be reached. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CmsValidatedForm className={styles.form} onChange={markDirty} onSubmit={save} serverErrors={fieldErrors}>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Offer details</h2><p>Publish only genuine owner-approved offers with clear dates and wording.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Title<input defaultValue={promotion.title} maxLength={120} minLength={2} name="title" required /></label>
          <label className={styles.fullField}>Description<textarea defaultValue={promotion.description} maxLength={1000} minLength={10} name="description" required /></label>
          <label className={styles.field}>Status<select defaultValue={promotion.status} name="status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select><small>Changes save immediately; only Published offers appear on the website.</small></label>
          <span />
          <label className={styles.field}>Start date, optional<input defaultValue={promotion.startsOn} name="startsOn" type="date" /></label>
          <label className={styles.field}>End date, optional<input data-cms-not-before-field="startsOn" defaultValue={promotion.endsOn} name="endsOn" type="date" /></label>
        </div>
      </section>
      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Current version ${version}${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving and publishing..." : isNew ? "Create promotion" : "Save website changes"}</button>
      </div>
    </CmsValidatedForm>
  );
}
