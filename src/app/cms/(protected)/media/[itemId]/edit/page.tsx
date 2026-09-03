import { notFound } from "next/navigation";

import { GalleryEditorForm } from "@/components/cms/GalleryEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { isApprovedPublicImageUrl } from "@/lib/media/cloudinary-delivery";

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
        description="Edit accessible image metadata and control whether this record appears on the website after saving."
        eyebrow="Media library"
        title={item.caption}
      />
      {!isApprovedPublicImageUrl(item.imageUrl) ? (
        <CmsNotice tone="warning" title="This image URL is not approved for publishing">
          Use a local project image or upload to the configured Cloudinary account. Other remote image hosts remain hidden from the public website.
        </CmsNotice>
      ) : null}
      <GalleryEditorForm item={item} />
    </>
  );
}
