"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsVoucherRecord } from "@/domain/cms/types";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

function amountInputValue(voucher: CmsVoucherRecord, isNew: boolean) {
  return isNew ? "" : String(voucher.amountCents / 100);
}

export function VoucherEditorForm({
  voucher,
  isNew = false,
}: Readonly<{ voucher: CmsVoucherRecord; isNew?: boolean }>) {
  const router = useRouter();
  const [version, setVersion] = useState(voucher.version);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    const amountEur = Number(data.get("amountEur"));

    try {
      const response = await fetch(
        isNew ? "/api/cms/vouchers" : `/api/cms/vouchers/${voucher.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: version,
            title: data.get("title"),
            description: data.get("description"),
            amountCents: Number.isFinite(amountEur) ? Math.round(amountEur * 100) : 0,
            badge: data.get("badge"),
            terms: data.get("terms"),
            status: data.get("status"),
            sortOrder: data.get("sortOrder"),
          }),
        },
      );
      const result = (await response.json()) as { error?: string; voucher?: CmsVoucherRecord };
      if (!response.ok || !result.voucher) {
        setFeedback({ tone: "error", text: result.error ?? "The voucher could not be saved." });
        return;
      }
      setVersion(result.voucher.version);
      markSaved();
      setFeedback({ tone: "success", text: isNew ? "Voucher created and website updated." : "Voucher saved and website updated." });
      if (isNew) router.push(`/cms/vouchers/${result.voucher.id}/edit`);
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
          <h2>Voucher information</h2>
          <p>Describe what customers can arrange directly with the Siriranee team. This does not create an online product or payment link.</p>
        </header>
        <div className={styles.grid}>
          <label className={styles.fullField}>
            Title
            <input defaultValue={voucher.title} maxLength={120} minLength={2} name="title" required />
          </label>
          <label className={styles.field}>
            Voucher value (€)
            <input defaultValue={amountInputValue(voucher, isNew)} max={1000} min={1} name="amountEur" required step="0.01" type="number" />
            <small>The value shown publicly. No payment is collected on this website.</small>
          </label>
          <label className={styles.field}>
            Short badge, optional
            <input defaultValue={voucher.badge} maxLength={40} name="badge" placeholder="For example: Most popular" />
          </label>
          <label className={styles.fullField}>
            Description
            <textarea defaultValue={voucher.description} maxLength={500} minLength={10} name="description" required />
          </label>
          <label className={styles.fullField}>
            Customer-facing details
            <textarea defaultValue={voucher.terms} maxLength={500} minLength={10} name="terms" required />
            <small>Explain how the voucher is arranged and redeemed. Add expiry or delivery details only after the owner confirms them.</small>
          </label>
          <label className={styles.field}>
            Status
            <select defaultValue={voucher.status} name="status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <small>Changes save immediately; only Published vouchers appear on the website.</small>
          </label>
          <label className={styles.field}>
            Display order
            <input defaultValue={voucher.sortOrder} max={9999} min={0} name="sortOrder" required type="number" />
            <small>Lower numbers appear first.</small>
          </label>
        </div>
      </section>
      <div className={styles.saveBar}>
        <span aria-live="polite">
          {feedback ? (
            <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>
              {feedback.text}
            </span>
          ) : `Current version ${version}${dirty ? " · unsaved changes" : ""}`}
        </span>
        <button disabled={saving} type="submit">
          {saving ? "Saving and publishing..." : isNew ? "Create voucher" : "Save website changes"}
        </button>
      </div>
    </form>
  );
}
