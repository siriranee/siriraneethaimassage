import "server-only";

import type { CmsRepository } from "@/server/cms/repositories/repository";

/** Private contact checks must never flow into public booking payloads. */
export async function hasTherapistNotificationAddress(
  repository: Pick<CmsRepository, "getTherapistContact">,
  therapistId: string,
) {
  try {
    const contact = await repository.getTherapistContact(therapistId);
    const email = contact?.notificationEmail.trim() ?? "";
    return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
  } catch {
    // Legacy/missing/encrypted-unreadable contacts are not safe to notify.
    return false;
  }
}
