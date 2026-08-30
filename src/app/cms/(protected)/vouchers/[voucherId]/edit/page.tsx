import { notFound } from "next/navigation";

import { VoucherEditorForm } from "@/components/cms/VoucherEditorForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = { readonly params: Promise<{ readonly voucherId: string }> };

export default async function CmsVoucherEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { voucherId } = await params;
  const content = await getCmsContent();
  const voucher = (content.vouchers ?? []).find((item) => item.id === voucherId);
  if (!voucher) notFound();

  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/vouchers" secondary>Back to vouchers</CmsPrimaryLink>} description="Review the value, wording, order and public status. Archive the voucher to hide it without deleting its history." eyebrow="Website content" title={voucher.title} />
      <VoucherEditorForm voucher={voucher} />
    </>
  );
}
