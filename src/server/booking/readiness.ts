import "server-only";

import type { CmsContentState } from "@/domain/cms/types";
import { getCmsMode } from "@/server/cms/config";
import { hasCmsPiiEncryptionKey } from "@/server/cms/pii";

export function isLivePublicBookingReady(content: CmsContentState) {
  return (
    getCmsMode() === "mongodb" &&
    content.site.openingHoursConfirmed &&
    content.bookingSettings.rulesConfirmed &&
    content.bookingSettings.publicBookingEnabled &&
    process.env.CMS_PUBLIC_BOOKING_READY === "true" &&
    process.env.CMS_PRIVACY_NOTICE_APPROVED === "true" &&
    process.env.CMS_BOOKING_NOTIFICATION_READY === "true" &&
    process.env.CMS_MONITORING_READY === "true" &&
    process.env.CMS_RECOVERY_DRILL_VERIFIED === "true" &&
    hasCmsPiiEncryptionKey()
  );
}

export function assertLivePublicBookingReady(content: CmsContentState) {
  if (!isLivePublicBookingReady(content)) {
    throw new Error("Public booking is disabled.");
  }
}
