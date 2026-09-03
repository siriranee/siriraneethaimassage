import { VoucherEditorForm } from "@/components/cms/VoucherEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsVoucherRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

const blankVoucher: CmsVoucherRecord = {
  id: "new",
  title: "",
  imageUrl: "",
  imageAlt: "",
  status: "published",
  sortOrder: 0,
  version: 0,
  updatedAt: "",
};

export default async function CmsNewVoucherPage() {
  await requireCmsPageUser("content:write");
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/vouchers" secondary>Back to vouchers</CmsPrimaryLink>} description="Add the title and artwork shown on the public voucher slider." eyebrow="Website content" title="Add voucher" />
      <CmsNotice title="Image-based voucher">The public card contains only this title and the complete artwork inside a 16:9 frame. No online payment is taken here.</CmsNotice>
      <VoucherEditorForm isNew voucher={blankVoucher} />
    </>
  );
}
