import "server-only";

import type { CmsContentState } from "@/domain/cms/types";
import { getCmsMode } from "@/server/cms/config";
import { hasCmsPiiEncryptionKey } from "@/server/cms/pii";
import { getResendBookingEmailReadiness } from "@/server/booking/resend-booking-email";
import { hasTherapistNotificationAddress } from "@/server/booking/therapist-notification-readiness";
import { getCmsRepository } from "@/server/cms/repositories";
import type { CmsRepository } from "@/server/cms/repositories/repository";

export async function isLivePublicBookingReady(
  content: CmsContentState,
  repository?: Pick<CmsRepository, "getTherapistContact">,
  therapistId?: string,
) {
  const activeServiceIds = new Set(
    content.services
      .filter((service) => service.prices.some((price) => price.active))
      .map((service) => service.id),
  );
  const bookableTherapists = content.team.filter(
    (member) =>
      member.publicProfile &&
      member.operationalActive &&
      !member.archived &&
      (!therapistId || member.id === therapistId) &&
      member.serviceIds.some((serviceId) => activeServiceIds.has(serviceId)),
  );

  if (
    getCmsMode() !== "mongodb" ||
    !content.site.openingHoursConfirmed ||
    !content.bookingSettings.rulesConfirmed ||
    !content.bookingSettings.publicBookingEnabled ||
    !bookableTherapists.length ||
    process.env.CMS_PUBLIC_BOOKING_READY !== "true" ||
    !hasCmsPiiEncryptionKey() ||
    !getResendBookingEmailReadiness().ready
  ) return false;

  // Public team records intentionally contain no private contact details.
  // A confirmed booking must not be offered if its therapist cannot receive
  // the appointment notice. Treat missing, invalid and unreadable contacts
  // as unavailable, including records created before CMS email validation.
  const contactRepository = repository ?? getCmsRepository();
  const contacts = await Promise.all(
    bookableTherapists.map((member) =>
      hasTherapistNotificationAddress(contactRepository, member.id)),
  );
  return contacts.some(Boolean);
}

export async function assertLivePublicBookingReady(
  content: CmsContentState,
  repository?: Pick<CmsRepository, "getTherapistContact">,
  therapistId?: string,
) {
  if (!(await isLivePublicBookingReady(content, repository, therapistId))) {
    throw new Error("Public booking is disabled.");
  }
}
