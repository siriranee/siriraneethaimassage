import { SiteBusinessForm } from "@/components/cms/SiteBusinessForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

export default async function CmsBusinessSettingsPage() {
  await requireCmsPageUser("settings:write");
  const content = await getCmsContent();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>}
        description="Update the business details used consistently across public pages, contact actions and local search metadata."
        eyebrow="Settings"
        title="Business information"
      />
      <SiteBusinessForm site={content.site} />
    </>
  );
}
