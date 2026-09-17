import { isBookingEmailDeliveryUncertain } from "../booking/email-retry-policy";
import type { BookingStatus, CmsBookingNotification } from "./types";

export const bookingEmailAttentionStatuses = ["queued", "sending", "failed", "indeterminate"] as const;
export const bookingEmailAttentionDeliveryStatuses = ["bounced", "failed", "delayed", "complained", "suppressed"] as const;

export type CmsBookingEmailAttention = {
  readonly bookingId: string;
  readonly bookingReference: string;
  readonly count: number;
  readonly audiences: readonly NonNullable<CmsBookingNotification["audience"]>[];
  readonly updatedAt: string;
};

export function bookingEmailNeedsAttention(
  notification: Pick<CmsBookingNotification, "channel" | "provider" | "status" | "deliveryStatus" | "audience" | "kind">,
  booking: { readonly status: BookingStatus; readonly demo: boolean } | null,
) {
  if (!booking || booking.demo || notification.channel !== "email" || notification.provider !== "resend") return false;
  // An unsent initial request no longer requires review after staff have acted.
  // Other recipients, especially a previous therapist, can still need a correction.
  if (notification.audience === "owner" && notification.kind === "booking-requested" && booking.status !== "pending") return false;
  return bookingEmailAttentionStatuses.some((status) => status === notification.status) ||
    bookingEmailAttentionDeliveryStatuses.some((status) => status === notification.deliveryStatus);
}

export function bookingEmailAttentionText(attention: CmsBookingEmailAttention) {
  const audienceLabels = [
    ...(attention.audiences.includes("customer") ? ["Customer"] : []),
    ...(attention.audiences.includes("therapist") ? ["Therapist"] : []),
    ...(attention.audiences.includes("owner") ? ["Owner"] : []),
  ];
  return `${audienceLabels.join(" / ") || "Booking"} email needs attention. Review notification activity in the booking details.`;
}

export function bookingActivityStatusLabel(status?: BookingStatus) {
  switch (status) {
    case "pending": return "Pending · review needed";
    case "confirmed": return "Current status: Confirmed";
    case "cancelled": return "Current status: Cancelled";
    case "completed": return "Current status: Completed";
    case "no-show": return "Current status: No-show";
    default: return "Historical activity · booking unavailable";
  }
}

type DeliveryMetadata = Pick<
  CmsBookingNotification,
  "status" | "provider" | "deliveryStatus" | "lastError"
>;

export type TherapistEmailAttempt = {
  readonly status: "sent" | "pending" | "failed" | "indeterminate" | "skipped";
  readonly reason?: string;
};

export function withTherapistEmailFeedback(
  feedback: { readonly tone: "success" | "warning" | "error"; readonly text: string },
  outcomes: readonly TherapistEmailAttempt[] = [],
) {
  const needsAttention = outcomes.some((outcome) =>
    outcome.status === "failed" || outcome.status === "indeterminate" ||
    outcome.status === "pending" || outcome.reason === "therapist-contact-unavailable",
  );
  if (needsAttention) {
    return {
      tone: feedback.tone === "error" ? "error" as const : "warning" as const,
      text: `${feedback.text} Therapist email needs attention. Review notification activity in the booking details.`,
    };
  }
  return outcomes.some((outcome) => outcome.status === "sent")
    ? { ...feedback, text: `${feedback.text} Therapist email accepted by Resend.` }
    : feedback;
}

export function bookingEmailDeliveryFeedback(notification: DeliveryMetadata, retryAllowed?: boolean): {
  readonly tone: "success" | "warning";
  readonly label: string;
  readonly text: string;
} {
  if (notification.status === "failed" && notification.lastError === "therapist-removal-snapshot-unavailable") {
    return { tone: "warning", label: "Original appointment details unavailable", text: "No removal email was sent because the original appointment details are unavailable. Contact the previous therapist directly." };
  }
  switch (notification.deliveryStatus) {
    case "delivered":
      return { tone: "success", label: "Delivered", text: "The recipient's email service confirmed delivery. This does not confirm that the email was opened." };
    case "bounced":
      return { tone: "warning", label: "Bounced", text: "The recipient's email service rejected this message. Check the email address and contact the recipient directly." };
    case "failed":
      return { tone: "warning", label: "Delivery failed", text: "The email provider reported a delivery failure. Review the delivery details in Resend before taking further action." };
    case "delayed":
      return { tone: "warning", label: "Delivery delayed", text: "The email provider is still trying to deliver this message. A second email should not be sent while delivery is pending." };
    case "complained":
      return { tone: "warning", label: "Marked as spam", text: "The recipient reported this message as spam. Contact them through another agreed channel." };
    case "suppressed":
      return { tone: "warning", label: "Delivery suppressed", text: "The email provider suppressed delivery to this recipient. Review the recipient status in Resend." };
  }

  if (notification.status === "sent" && notification.provider === "resend") {
    return { tone: "success", label: "Accepted by Resend", text: "Resend accepted the email. Final delivery has not been verified yet." };
  }
  if (notification.status === "queued") {
    return { tone: "warning", label: "Waiting to send", text: retryAllowed === false
      ? "This email has not been sent yet. No retry is available here. Review the notification details or contact the recipient directly."
      : "This email has not been sent yet. Eligible messages can be retried below." };
  }
  if (notification.status === "sending") {
    return { tone: "warning", label: "Sending", text: retryAllowed === false
      ? "This send attempt has no recorded result yet. Retry is not currently available. Wait briefly and refresh; if it remains unresolved, review Resend before contacting the recipient directly."
      : "A send attempt is in progress. Wait for its result before retrying." };
  }
  if (isBookingEmailDeliveryUncertain(notification)) {
    return { tone: "warning", label: "Delivery uncertain", text: retryAllowed === false
      ? "Resend may have accepted this email. No safe retry is available here. Review its delivery status in Resend and contact the recipient directly if needed; avoid sending a duplicate."
      : "Resend may have accepted this email. Review its delivery status before retrying to avoid a duplicate." };
  }
  if (notification.status === "failed") {
    return { tone: "warning", label: "Could not send", text: retryAllowed === false
      ? "The send attempt failed. The saved booking status is unchanged. No retry is available here. Review the notification details or contact the recipient directly."
      : "The send attempt failed. The saved booking status is unchanged. Eligible messages can be retried below." };
  }
  return { tone: "warning", label: "Preview only", text: "This is a preview record. No email was sent." };
}
