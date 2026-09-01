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
        description="Configure one space-wide availability policy in Dublin time."
        eyebrow="Settings"
        title="Booking rules"
      />
      <CmsNotice tone="warning" title="Deployment gates remain authoritative">
        The CMS switch records the owner&apos;s decision after hours and rules are
        confirmed. Public booking still stays safely off until privacy,
        notification, monitoring, recovery and encryption checks pass on the server.
      </CmsNotice>
      <BookingSettingsForm openingHoursConfirmed={content.site.openingHoursConfirmed} settings={content.bookingSettings} />
    </>
  );
}
