"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./CmsDeleteBookingButton.module.css";

export function CmsDeleteVoucherButton({
  voucherId,
  title,
  version,
}: Readonly<{
  voucherId: string;
  title: string;
  version: number;
}>) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function deleteVoucher() {
    if (deleting) return;
    if (
      !window.confirm(
        `Permanently delete voucher "${title}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setFeedback("");

    try {
      const response = await fetch(`/api/cms/vouchers/${voucherId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
      });
      const result = (await response.json()) as { readonly error?: string };

      if (!response.ok) {
        setFeedback(result.error ?? "The voucher could not be deleted.");
        setDeleting(false);
        return;
      }

      router.replace("/cms/vouchers");
      router.refresh();
    } catch {
      setFeedback("The CMS could not be reached. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className={styles.root}>
      <button
        aria-label={`Delete voucher ${title}`}
        className={styles.button}
        disabled={deleting}
        onClick={() => void deleteVoucher()}
        type="button"
      >
        {deleting ? (
          <LoaderCircle aria-hidden="true" className={styles.spinner} />
        ) : (
          <Trash2 aria-hidden="true" />
        )}
        {deleting ? "Deleting..." : "Delete"}
      </button>
      {feedback ? (
        <span aria-live="polite" className={styles.error} role="alert">
          {feedback}
        </span>
      ) : null}
    </div>
  );
}
