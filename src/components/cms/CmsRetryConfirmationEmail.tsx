"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  customerBookingCancellationEmailFeedback,
  customerBookingConfirmationEmailFeedback,
  type CustomerBookingCancellationEmailOutcome,
  type CustomerBookingConfirmationEmailOutcome,
} from "@/domain/booking/confirmation-email";

import styles from "./CmsRetryConfirmationEmail.module.css";

export function CmsRetryConfirmationEmail({
  bookingId,
  deliveryUncertain,
  kind = "confirmation",
}: Readonly<{
  bookingId: string;
  deliveryUncertain: boolean;
  kind?: "confirmation" | "cancellation";
}>) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly text: string;
    readonly tone: "success" | "warning" | "error";
  } | null>(null);

  async function retry() {
    if (
      deliveryUncertain &&
      !window.confirm(
        "Resend may already have accepted this email. Check the Resend dashboard first. Do you want to try again?",
      )
    ) {
      return;
    }

    setSending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/cms/bookings/${bookingId}/${kind}-email`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        readonly confirmationEmail?: CustomerBookingConfirmationEmailOutcome;
        readonly cancellationEmail?: CustomerBookingCancellationEmailOutcome;
        readonly error?: string;
      };
      const outcome =
        kind === "confirmation"
          ? result.confirmationEmail
          : result.cancellationEmail;
      if (!response.ok || !outcome) {
        setFeedback({
          tone: "error",
          text:
            result.error ?? `The ${kind} email could not be retried.`,
        });
        return;
      }

      setFeedback(
        kind === "confirmation"
          ? customerBookingConfirmationEmailFeedback(
              outcome as CustomerBookingConfirmationEmailOutcome,
            )
          : customerBookingCancellationEmailFeedback(
              outcome as CustomerBookingCancellationEmailOutcome,
            ),
      );
      router.refresh();
    } catch {
      setFeedback({
        tone: "warning",
        text: "The response was interrupted. Check Resend before trying again.",
      });
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button disabled={sending} onClick={() => void retry()} type="button">
        {sending ? (
          <LoaderCircle aria-hidden="true" className={styles.spinner} />
        ) : (
          <RotateCw aria-hidden="true" />
        )}
        {sending ? "Retrying..." : `Retry ${kind} email`}
      </button>
      {feedback ? (
        <small
          aria-live="polite"
          className={styles[feedback.tone]}
          role={feedback.tone === "error" ? "alert" : undefined}
        >
          {feedback.text}
        </small>
      ) : null}
    </div>
  );
}
