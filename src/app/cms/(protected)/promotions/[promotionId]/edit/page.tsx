import { notFound } from "next/navigation";

import { PromotionEditorForm } from "@/components/cms/PromotionEditorForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = { readonly params: Promise<{ readonly promotionId: string }> };

export default async function CmsPromotionEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { promotionId } = await params;
  const content = await getCmsContent();
  const promotion = content.promotions.find((item) => item.id === promotionId);
  if (!promotion) notFound();
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/promotions" secondary>Back to promotions</CmsPrimaryLink>} description="Review wording, schedule and publication status." eyebrow="Website content" title={promotion.title} />
      <PromotionEditorForm promotion={promotion} />
    </>
  );
}
