import { GalleryEditorForm } from "@/components/cms/GalleryEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsGalleryRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCloudinaryMediaReadiness } from "@/server/media/config";

const blankItem: CmsGalleryRecord = {
  id: "new",
  imageUrl: "/images/spa/",
  altText: "",
  caption: "",
  published: false,
  sortOrder: 50,
  version: 0,
  updatedAt: "",
};

export default async function CmsNewGalleryItemPage() {
  await requireCmsPageUser("content:write");
  const media = getCloudinaryMediaReadiness();
  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/media" secondary>Back to media</CmsPrimaryLink>}
        description="Prepare image metadata as a draft before it can appear in a published gallery."
        eyebrow="Media library"
        title="Add gallery image"
      />
      <CmsNotice
        tone={media.ready ? "success" : "warning"}
        title={media.ready ? "Image upload is ready" : "Image upload is disabled"}
      >
        {media.ready
          ? "Choose an image below. It will be validated and compressed locally, then uploaded only when you save."
          : "You can keep using a verified local project path. Configure Cloudinary on the server to enable browser-compressed uploads."}
      </CmsNotice>
      <GalleryEditorForm isNew item={blankItem} />
    </>
  );
}
