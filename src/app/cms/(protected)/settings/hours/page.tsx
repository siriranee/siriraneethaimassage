import { OpeningHoursForm } from "@/components/cms/OpeningHoursForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

export default async function CmsHoursSettingsPage() {
  await requireCmsPageUser("settings:write");
  const content = await getCmsContent();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>}
        description="Set regular appointment hours in Europe/Dublin and explicitly record when the owner has confirmed them."
        eyebrow="Settings"
        title="Opening hours"
      />
      {!content.site.openingHoursConfirmed ? (
        <CmsNotice tone="warning" title="Current hours are mock values">
          Review every day with the owner before checking the confirmation box.
        </CmsNotice>
      ) : null}
      <OpeningHoursForm site={content.site} />
    </>
  );
}
