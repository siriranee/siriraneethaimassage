"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsPageRecord } from "@/domain/cms/types";
import { SeoEditorFields } from "./SeoEditorFields";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

export function PageEditorForm({ page }: Readonly<{ page: CmsPageRecord }>) {
  const router = useRouter();
  const [version, setVersion] = useState(page.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/cms/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version, eyebrow: data.get("eyebrow"), title: data.get("title"), description: data.get("description"), seoTitle: data.get("seoTitle"), seoDescription: data.get("seoDescription") }),
      });
      const result = (await response.json()) as { error?: string; page?: CmsPageRecord };
      if (!response.ok || !result.page) {
        setFeedback({ tone: "error", text: result.error ?? "The page draft could not be saved." });
        return;
      }
      setVersion(result.page.version);
      markSaved();
      setFeedback({ tone: "success", text: "Page heading and SEO draft saved." });
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
        <header className={styles.sectionHeader}><h2>Page hero</h2><p>Keep the page promise clear, specific and truthful.</p></header>
        <div className={styles.grid}>
          <label className={styles.fullField}>Eyebrow<input defaultValue={page.eyebrow} maxLength={100} minLength={2} name="eyebrow" required /></label>
          <label className={styles.fullField}>Page title<input defaultValue={page.title} maxLength={120} minLength={4} name="title" required /></label>
          <label className={styles.fullField}>Introduction<textarea defaultValue={page.description} maxLength={400} minLength={20} name="description" required /></label>
        </div>
      </section>
      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Search appearance</h2><p>Length limits protect readable Google and social previews.</p></header>
        <div className={styles.grid}>
          <SeoEditorFields description={page.seoDescription} title={page.seoTitle} />
        </div>
      </section>
      <div className={styles.saveBar}><span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Draft version ${version}${dirty ? " · unsaved changes" : ""}`}</span><button disabled={saving} type="submit">{saving ? "Saving..." : "Save page draft"}</button></div>
    </form>
  );
}
