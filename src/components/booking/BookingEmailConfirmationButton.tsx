"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import {
  confirmBookingFromEmailAction,
  type BookingConfirmationActionState,
} from "@/app/(site)/book/confirm/actions";

import styles from "./BookingEmailConfirmationButton.module.css";

const initialState: BookingConfirmationActionState = {
  status: "idle",
  message: "",
};

export function BookingEmailConfirmationButton({
  token,
  confirmationRole,
}: Readonly<{
  token: string;
  confirmationRole: "owner" | "therapist";
}>) {
  const [state, action, pending] = useActionState(
    confirmBookingFromEmailAction,
    initialState,
  );
  const complete = state.status === "success" || state.status === "info";

  return (
    <form action={action} className={styles.form}>
      <input name="token" type="hidden" value={token} />
      <button className={styles.button} disabled={pending || complete} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className={styles.spinner} />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        {pending
          ? "Confirming booking..."
          : complete
            ? "Booking confirmed"
            : confirmationRole === "therapist"
              ? "Accept and confirm booking"
              : "Confirm booking"}
      </button>
      <p
        aria-live={state.status === "error" ? undefined : "polite"}
        className={`${styles.feedback} ${
          state.status === "error"
            ? styles.error
            : state.status === "success" || state.status === "info"
              ? styles.success
              : ""
        }`}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
    </form>
  );
}
