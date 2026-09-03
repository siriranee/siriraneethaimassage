import { ServiceEditorForm } from "@/components/cms/ServiceEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsServiceRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

const blankService: CmsServiceRecord = {
  id: "new",
  slug: "",
  name: "",
  shortDescription: "",
  longDescription: "",
  imageUrl: "",
  imageAlt: "",
  hero: {
    imageUrl: "",
    altText: "",
  },
  galleryImages: [],
  prices: [
    { id: "new-60", durationMinutes: 60, priceCents: 6500, active: true },
  ],
  idealFor: [],
  highlights: [],
  priceNote: "",
  seoTitle: "",
  seoDescription: "",
  version: 0,
  createdAt: "",
  updatedAt: "",
};

export default async function CmsNewServicePage() {
  await requireCmsPageUser("content:write");
  const cloudinaryOwnership = getCloudinaryMediaOwnershipConfig();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/services" secondary>Back to services</CmsPrimaryLink>}
        description="Add the treatment details, pricing and images. Saving publishes the treatment immediately."
        eyebrow="Treatment editor"
        title="Add treatment"
      />
      <CmsNotice title="This treatment publishes when saved">
        Complete every required field before saving. The URL is checked for conflicts,
        and successful changes appear on the public website immediately.
      </CmsNotice>
      <ServiceEditorForm
        cloudinaryOwnership={cloudinaryOwnership}
        isNew
        service={blankService}
      />
    </>
  );
}
