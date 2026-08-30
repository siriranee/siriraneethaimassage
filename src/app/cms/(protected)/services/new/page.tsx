import { ServiceEditorForm } from "@/components/cms/ServiceEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsServiceRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

const blankService: CmsServiceRecord = {
  id: "new",
  slug: "",
  name: "",
  category: "thai-massage",
  shortDescription: "",
  longDescription: "",
  imageUrl: "/images/spa/hero-massage.webp",
  imageAlt: "",
  prices: [
    { id: "new-60", durationMinutes: 60, priceCents: 6500, active: true },
  ],
  idealFor: [],
  highlights: [],
  bookingNotice: "",
  seoTitle: "",
  seoDescription: "",
  status: "draft",
  sortOrder: 50,
  version: 0,
  createdAt: "",
  updatedAt: "",
};

export default async function CmsNewServicePage() {
  await requireCmsPageUser("content:write");

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/services" secondary>Back to services</CmsPrimaryLink>}
        description="Create a complete treatment draft, then review it before publishing the website snapshot."
        eyebrow="Treatment editor"
        title="Add treatment"
      />
      <CmsNotice title="New treatments start as drafts">
        The URL slug is checked for conflicts, archived treatments stay out of the
        public menu, and the public site changes only after an administrator publishes.
      </CmsNotice>
      <ServiceEditorForm isNew service={blankService} />
    </>
  );
}
