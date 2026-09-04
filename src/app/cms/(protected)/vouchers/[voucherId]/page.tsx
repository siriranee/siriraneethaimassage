import { notFound } from "next/navigation";

import { VoucherEditorShell } from "@/components/cms/VoucherEditorShell";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = { readonly params: Promise<{ readonly voucherId: string }> };

export default async function CmsVoucherPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { voucherId } = await params;
  const content = await getCmsContent();
  const voucher = (content.vouchers ?? []).find((item) => item.id === voucherId);
  if (!voucher) notFound();

  return <VoucherEditorShell voucher={voucher} />;
}
