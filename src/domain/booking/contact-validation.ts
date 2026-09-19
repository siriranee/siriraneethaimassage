export const bookingContactFields = [
  "customerName",
  "phone",
  "email",
  "notes",
  "privacyAccepted",
] as const;

/** Shared by the public form and server; never trust browser-only validation. */
export function validateBookingContact(values: Readonly<Record<string, unknown>>) {
  const errors: Record<string, string> = {};
  const value = (field: string) =>
    typeof values[field] === "string" ? values[field].trim() : "";
  const name = value("customerName");
  const phone = value("phone");
  const email = value("email");
  const digitCount = phone.replace(/\D/g, "").length;

  if (!name) errors.customerName = "Please enter your name.";
  else if (name.length < 2 || name.length > 100) {
    errors.customerName = "Please use between 2 and 100 characters for your name.";
  }

  if (!phone) errors.phone = "Please enter your phone number.";
  else if (!/^\+?[\d\s().-]+$/.test(phone) || phone.length > 30 || digitCount < 7 || digitCount > 15) {
    errors.phone = "Enter a valid phone number with 7–15 digits. You can include +, spaces, brackets or hyphens.";
  }

  if (!email) errors.email = "Please enter your email address so we can send booking updates.";
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address, for example name@example.com.";
  }

  if (value("notes").length > 600) errors.notes = "Please keep your notes within 600 characters.";
  if (values.privacyAccepted !== true) {
    errors.privacyAccepted = "Please read and accept the privacy notice before sending your request.";
  }
  return errors;
}
