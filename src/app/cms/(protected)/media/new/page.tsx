import { GalleryEditorForm } from "@/components/cms/GalleryEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsGalleryRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

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
  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/media" secondary>Back to media</CmsPrimaryLink>}
        description="Prepare image metadata as a draft before it can appear in a published gallery."
        eyebrow="Media library"
        title="Add gallery image"
      />
      <CmsNotice tone="warning" title="Upload provider is still a mock integration">
        Add a verified project image path for now. Remote upload, cropping and deletion
        stay disabled until storage, limits, backup ownership and cleanup rules are approved.
      </CmsNotice>
      <GalleryEditorForm isNew item={blankItem} />
    </>
  );
}
