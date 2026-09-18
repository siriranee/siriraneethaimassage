"use server";

import { refresh } from "next/cache";

import { confirmBookingFromEmailToken } from "@/server/booking/booking-email-confirmation";

export type BookingConfirmationActionState = {
  readonly status: "idle" | "success" | "info" | "error";
  readonly message: string;
};

export async function confirmBookingFromEmailAction(
  _previousState: BookingConfirmationActionState,
  formData: FormData,
): Promise<BookingConfirmationActionState> {
  const tokenValue = formData.get("token");
  const token = typeof tokenValue === "string" ? tokenValue : "";
  if (!token || token.length > 512) {
    return {
      status: "error",
      message: "This confirmation link is not valid. Please contact the shop owner to review the booking.",
    };
  }

  try {
    const result = await confirmBookingFromEmailToken(token);
    if (result.kind === "already-confirmed") {
      refresh();
      return {
        status: "info",
        message: "This booking is already confirmed. No duplicate emails were sent.",
      };
    }
    if (result.kind === "unavailable") {
      return {
        status: "error",
        message: result.reason === "expired"
          ? "This confirmation link has expired. Please contact the shop owner for a current booking update."
          : result.reason === "stale"
            ? "The booking changed after this email was sent. Please use the latest email or contact the shop owner."
            : "This booking can no longer be confirmed from this link. Please contact the shop owner.",
      };
    }

    const therapistConfirmation = result.confirmationRole === "therapist";
    const message = result.customerEmailStatus === "sent"
      ? "Booking confirmed. The customer confirmation email was sent."
      : result.customerEmailStatus === "pending"
        ? "Booking confirmed. The customer email is queued for delivery."
        : result.customerEmailStatus === "indeterminate"
          ? therapistConfirmation
            ? "Booking confirmed. Customer email delivery is uncertain; please contact the shop owner."
            : "Booking confirmed. Email delivery is uncertain, so please check the CMS before retrying."
          : result.customerEmailStatus === "failed"
            ? therapistConfirmation
              ? "Booking confirmed, but the customer email needs attention from the shop owner."
              : "Booking confirmed, but the customer email needs attention in the CMS."
            : therapistConfirmation
              ? "Booking confirmed. Contact the shop owner if the customer expected an email."
              : "Booking confirmed. Check the CMS if a customer email address was not provided.";
    refresh();
    return { status: "success", message };
  } catch {
    return {
      status: "error",
      message: "The booking could not be confirmed right now. Please try again or contact the shop owner.",
    };
  }
}
