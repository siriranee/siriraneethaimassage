import { notFound } from "next/navigation";

import { PageEditorForm } from "@/components/cms/PageEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

type PageProps = { readonly params: Promise<{ readonly pageId: string }> };

export default async function CmsPageEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { pageId } = await params;
  const content = await getCmsContent();
  const cloudinaryOwnership = getCloudinaryMediaOwnershipConfig();
  const page = content.pages?.find((item) => item.id === pageId);
  if (!page) notFound();
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/pages" secondary>Back to pages</CmsPrimaryLink>} description="Changes remain private until the complete website snapshot is reviewed and published." eyebrow="Website content" title={`${page.title} · editor`} />
      {page.id === "privacy" ? <CmsNotice tone="warning" title="Legal body copy remains protected">This editor changes the hero and search metadata only. Privacy obligations and retention wording still require owner or legal approval.</CmsNotice> : null}
      <PageEditorForm
        cloudinaryOwnership={cloudinaryOwnership}
        page={page}
      />
    </>
  );
}
