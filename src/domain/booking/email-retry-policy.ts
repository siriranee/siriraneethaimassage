// Shared by delivery claims and safe manual retries. No background worker is configured.
export const bookingEmailMaximumAttempts = 3;
export const bookingEmailClaimLeaseMs = 30_000;
export const bookingEmailIdempotencyWindowMs = 23 * 60 * 60 * 1_000;

export const bookingEmailKnownUnsentFailureCodes = [
  "booking-state-unavailable",
  "resend-configuration-missing",
  "resend-configuration-invalid",
  "resend-authentication-failed",
  "resend-rate-limited",
  "resend-message-rejected",
  "therapist-contact-unavailable",
  "therapist-email-missing",
  "therapist-email-invalid",
  "booking-email-context-unavailable",
  "booking-email-payload-not-saved",
] as const;

export const bookingEmailIndeterminateFailureCodes: readonly string[] = [
  "resend-timeout",
  "resend-network-error",
  "resend-unexpected-error",
  "resend-concurrent-idempotency",
  // Older SDK transport failures were stored under this generic code. They
  // may already have been accepted and must never gain a fresh retry window.
  "resend-provider-error",
] as const;

export const bookingEmailRetryableFailureCodes: readonly string[] = [
  ...bookingEmailKnownUnsentFailureCodes,
  ...bookingEmailIndeterminateFailureCodes,
  "resend-provider-unavailable",
];

export function isBookingEmailDeliveryUncertain(notification: {
  readonly status: string;
  readonly lastError: string;
}) {
  return notification.status === "sending" || notification.status === "indeterminate" ||
    (notification.status === "failed" &&
      (notification.lastError === "resend-provider-unavailable" ||
        bookingEmailIndeterminateFailureCodes.includes(notification.lastError)));
}
