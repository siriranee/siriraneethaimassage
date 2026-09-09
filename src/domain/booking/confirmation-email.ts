export type CustomerBookingConfirmationEmailOutcome = {
  readonly status:
    | "sent"
    | "pending"
    | "failed"
    | "indeterminate"
    | "skipped";
  readonly reason?:
    | "missing-customer-email"
    | "booking-not-confirmed"
    | "mock-mode";
};

export type CustomerBookingCancellationEmailOutcome = {
  readonly status:
    | "sent"
    | "pending"
    | "failed"
    | "indeterminate"
    | "skipped";
  readonly reason?:
    | "missing-customer-email"
    | "booking-not-cancelled"
    | "mock-mode";
};

export function customerBookingConfirmationEmailFeedback(
  outcome: CustomerBookingConfirmationEmailOutcome,
) {
  switch (outcome.status) {
    case "sent":
      return {
        tone: "success" as const,
        text: "Booking confirmed. Confirmation email accepted by Resend.",
      };
    case "pending":
      return {
        tone: "warning" as const,
        text: "Booking confirmed. The confirmation email has not been sent yet.",
      };
    case "indeterminate":
      return {
        tone: "warning" as const,
        text: "Booking confirmed. Email delivery is uncertain—check Resend before retrying.",
      };
    case "failed":
      return {
        tone: "warning" as const,
        text: "Booking confirmed, but the confirmation email could not be sent.",
      };
    case "skipped":
      if (outcome.reason === "missing-customer-email") {
        return {
          tone: "warning" as const,
          text: "Booking confirmed. No customer email address was provided.",
        };
      }
      if (outcome.reason === "mock-mode") {
        return {
          tone: "warning" as const,
          text: "Booking confirmed. Demo mode did not contact Resend.",
        };
      }
      return {
        tone: "warning" as const,
        text: "The confirmation email was not sent because the booking is not confirmed.",
      };
  }
}

export function customerBookingCancellationEmailFeedback(
  outcome: CustomerBookingCancellationEmailOutcome,
) {
  switch (outcome.status) {
    case "sent":
      return {
        tone: "success" as const,
        text: "Booking cancelled. Cancellation email accepted by Resend.",
      };
    case "pending":
      return {
        tone: "warning" as const,
        text: "Booking cancelled. The cancellation email has not been sent yet.",
      };
    case "indeterminate":
      return {
        tone: "warning" as const,
        text: "Booking cancelled. Email delivery is uncertain—check Resend before retrying.",
      };
    case "failed":
      return {
        tone: "warning" as const,
        text: "Booking cancelled, but the cancellation email could not be sent.",
      };
    case "skipped":
      if (outcome.reason === "missing-customer-email") {
        return {
          tone: "warning" as const,
          text: "Booking cancelled. No customer email address was provided.",
        };
      }
      if (outcome.reason === "mock-mode") {
        return {
          tone: "warning" as const,
          text: "Booking cancelled. Demo mode did not contact Resend.",
        };
      }
      return {
        tone: "warning" as const,
        text: "The cancellation email was not sent because the booking is not cancelled.",
      };
  }
}
