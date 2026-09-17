import "server-only";

import type { CmsContentState } from "@/domain/cms/types";
import { getCmsMode } from "@/server/cms/config";
import { hasCmsPiiEncryptionKey } from "@/server/cms/pii";
import { getResendBookingEmailReadiness } from "@/server/booking/resend-booking-email";

export function isLivePublicBookingReady(content: CmsContentState) {
  const activeServiceIds = new Set(
    content.services
      .filter((service) => service.prices.some((price) => price.active))
      .map((service) => service.id),
  );
  const hasBookableTherapist = content.team.some(
    (member) =>
      member.publicProfile &&
      member.operationalActive &&
      !member.archived &&
      member.serviceIds.some((serviceId) => activeServiceIds.has(serviceId)),
  );

  return (
    getCmsMode() === "mongodb" &&
    content.site.openingHoursConfirmed &&
    content.bookingSettings.rulesConfirmed &&
    content.bookingSettings.publicBookingEnabled &&
    hasBookableTherapist &&
    process.env.CMS_PUBLIC_BOOKING_READY === "true" &&
    hasCmsPiiEncryptionKey() &&
    getResendBookingEmailReadiness().ready
  );
}

export function assertLivePublicBookingReady(content: CmsContentState) {
  if (!isLivePublicBookingReady(content)) {
    throw new Error("Public booking is disabled.");
  }
}
