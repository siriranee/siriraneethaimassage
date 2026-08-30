import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";

export default function CmsNotFound() {
  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms">Back to dashboard</CmsPrimaryLink>}
        description="The requested CMS record may have been removed or the link may be out of date."
        eyebrow="Not found"
        title="This CMS record is unavailable"
      />
      <CmsNotice title="No changes were made">
        Return to the dashboard and choose an existing booking, treatment or settings page.
      </CmsNotice>
    </>
  );
}
