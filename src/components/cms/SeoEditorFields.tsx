"use client";

import { useState } from "react";

import styles from "./CmsEditorForm.module.css";

export function SeoEditorFields({ title, description }: Readonly<{ title: string; description: string }>) {
  const [previewTitle, setPreviewTitle] = useState(title);
  const [previewDescription, setPreviewDescription] = useState(description);
  return (
    <>
      <label className={styles.fullField}>SEO title<input defaultValue={title} maxLength={70} minLength={10} name="seoTitle" onChange={(event) => setPreviewTitle(event.target.value)} required /><small>{previewTitle.length}/70 characters</small></label>
      <label className={styles.fullField}>SEO description<textarea defaultValue={description} maxLength={170} minLength={40} name="seoDescription" onChange={(event) => setPreviewDescription(event.target.value)} required /><small>{previewDescription.length}/170 characters</small></label>
      <div className={styles.seoPreview} aria-live="polite">
        <span>Siriranee Thai Massage · Dublin</span>
        <strong>{previewTitle || "Page title preview"}</strong>
        <p>{previewDescription || "Search description preview."}</p>
      </div>
    </>
  );
}
