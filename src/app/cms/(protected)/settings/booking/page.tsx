import { BookingSettingsForm } from "@/components/cms/BookingSettingsForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

export default async function CmsBookingSettingsPage() {
  await requireCmsPageUser("settings:write");
  const content = await getCmsContent();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>}
        description="Configure one Dublin-time availability policy without exposing therapist selection to customers."
        eyebrow="Settings"
        title="Booking rules"
      />
      <CmsNotice tone="warning" title="Public booking remains locked">
        The current customer journey still hands off to phone, WhatsApp or the
        contact form. The launch switch stays unavailable until the complete booking
        engine and privacy workflow pass validation.
      </CmsNotice>
      <BookingSettingsForm openingHoursConfirmed={content.site.openingHoursConfirmed} settings={content.bookingSettings} />
    </>
  );
}
