"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsTeamRecord } from "@/domain/cms/types";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

export function TeamEditorForm({ member, isNew = false }: Readonly<{ member: CmsTeamRecord; isNew?: boolean }>) {
  const router = useRouter();
  const [version, setVersion] = useState(member.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(isNew ? "/api/cms/team" : `/api/cms/team/${member.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          name: data.get("name"),
          fullName: data.get("fullName"),
          publicRole: data.get("publicRole"),
          publicProfile: data.get("publicProfile") === "on",
          operationalActive: member.operationalActive,
          archived: data.get("archived") === "on",
          sortOrder: Number(data.get("sortOrder")),
        }),
      });
      const result = (await response.json()) as { error?: string; member?: CmsTeamRecord };

      if (!response.ok || !result.member) {
        setFeedback({ tone: "error", text: result.error ?? "The team profile could not be saved." });
        return;
      }

      setVersion(result.member.version);
      markSaved();
      setFeedback({ tone: "success", text: isNew ? "Team profile created and website updated." : "Team profile saved and website updated." });
      if (isNew) router.push(`/cms/team/${result.member.id}/edit`);
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
        <header className={styles.sectionHeader}><h2>Public profile</h2><p>This information can appear on the team page but never as a customer booking choice.</p></header>
        <div className={styles.grid}>
          <label className={styles.field}>Display name<input defaultValue={member.name} maxLength={80} minLength={2} name="name" required /></label>
          <label className={styles.field}>Full name<input defaultValue={member.fullName} maxLength={120} minLength={2} name="fullName" required /></label>
          <label className={styles.fullField}>Public role<input defaultValue={member.publicRole} maxLength={120} minLength={2} name="publicRole" required /></label>
          <label className={styles.field}>Display order<input defaultValue={member.sortOrder} max={1000} min={0} name="sortOrder" required type="number" /></label>
          <label className={styles.checkbox}><input defaultChecked={member.publicProfile} name="publicProfile" type="checkbox" /><span>Show public profile<small>Controls whether this person appears on the website after saving.</small></span></label>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><h2>Profile status</h2><p>Archive a profile when it should no longer appear on the public website.</p></header>
        <label className={styles.checkbox}>
          <input defaultChecked={member.archived} name="archived" type="checkbox" />
          <span>Archive this profile<small>The record remains in the CMS but is removed from public display after saving.</small></span>
        </label>
      </section>

      <div className={styles.saveBar}>
        <span aria-live="polite">{feedback ? <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span> : `Current version ${version}${dirty ? " · unsaved changes" : ""}`}</span>
        <button disabled={saving} type="submit">{saving ? "Saving and publishing..." : isNew ? "Create profile" : "Save website changes"}</button>
      </div>
    </form>
  );
}
