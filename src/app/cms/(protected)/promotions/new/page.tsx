import { PromotionEditorForm } from "@/components/cms/PromotionEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsPromotionRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

const blankPromotion: CmsPromotionRecord = { id: "new", title: "", description: "", status: "draft", startsOn: "", endsOn: "", version: 0, updatedAt: "" };

export default async function CmsNewPromotionPage() {
  await requireCmsPageUser("content:write");
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/promotions" secondary>Back to promotions</CmsPrimaryLink>} description="Create an owner-approved offer and choose whether it is visible immediately." eyebrow="Website content" title="Add promotion" />
      <CmsNotice title="No placeholder discounts">Leave the public promotions page unchanged until the offer, dates and terms are genuine and confirmed.</CmsNotice>
      <PromotionEditorForm isNew promotion={blankPromotion} />
    </>
  );
}
