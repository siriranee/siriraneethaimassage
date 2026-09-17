"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { bookingEmailDeliveryFeedback } from "@/domain/cms/notification-presentation";
import type { CmsBookingNotification } from "@/domain/cms/types";

import styles from "./CmsRetryConfirmationEmail.module.css";

export function CmsRetryBookingEmail({
  bookingId,
  notificationId,
  deliveryUncertain,
}: Readonly<{
  bookingId: string;
  notificationId: string;
  deliveryUncertain: boolean;
}>) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly text: string;
    readonly tone: "success" | "warning" | "error";
  } | null>(null);

  async function retry() {
    if (sending || finished) return;
    if (
      deliveryUncertain &&
      !window.confirm(
        "Resend may already have accepted this email. Check the Resend dashboard first. Continue with a duplicate-protected retry?",
      )
    ) return;

    setSending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/cms/bookings/${encodeURIComponent(bookingId)}/notifications/${encodeURIComponent(notificationId)}/retry`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        readonly notification?: CmsBookingNotification;
        readonly outcome?: {
          readonly status: "sent" | "pending" | "failed" | "indeterminate" | "skipped";
        };
        readonly error?: string;
      };
      if (!response.ok || !result.outcome) {
        setFeedback({ tone: "error", text: result.error ?? "This email is not available to retry. Review the latest notification status." });
        router.refresh();
        return;
      }

      if (result.outcome.status === "skipped") {
        setFinished(true);
        setFeedback({ tone: "warning", text: "No email was sent. This notification is no longer eligible to retry. Review the booking's latest status." });
      } else if (result.notification) {
        const nextFeedback = bookingEmailDeliveryFeedback(result.notification);
        setFeedback({ tone: nextFeedback.tone, text: `${nextFeedback.label}. ${nextFeedback.text}` });
        setFinished(result.outcome.status === "sent");
      } else {
        setFeedback({ tone: "warning", text: "Retry checked. Review notification activity for the latest delivery result." });
      }
      router.refresh();
    } catch {
      setFeedback({ tone: "warning", text: "The response was interrupted. Check Resend before trying again." });
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {!finished ? (
        <button disabled={sending} onClick={() => void retry()} type="button">
          {sending ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : <RotateCw aria-hidden="true" />}
          {sending ? "Retrying..." : "Retry email"}
        </button>
      ) : null}
      {feedback ? (
        <small aria-live="polite" className={styles[feedback.tone]} role={feedback.tone === "error" ? "alert" : undefined}>
          {feedback.text}
        </small>
      ) : null}
    </div>
  );
}
