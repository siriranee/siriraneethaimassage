import { notFound } from "next/navigation";

import { GalleryEditorForm } from "@/components/cms/GalleryEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = { readonly params: Promise<{ readonly itemId: string }> };

export default async function CmsGalleryEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { itemId } = await params;
  const content = await getCmsContent();
  const item = content.gallery.find((record) => record.id === itemId);
  if (!item) notFound();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/media" secondary>Back to media</CmsPrimaryLink>}
        description="Edit accessible image metadata and control whether this record joins the next publication."
        eyebrow="Media library"
        title={item.caption}
      />
      {!item.imageUrl.startsWith("/") ? (
        <CmsNotice tone="warning" title="Remote rendering is gated">
          This URL is stored as draft metadata but will not render publicly until its media provider and image host allowlist are approved.
        </CmsNotice>
      ) : null}
      <GalleryEditorForm item={item} />
    </>
  );
}
