import { VoucherEditorForm } from "@/components/cms/VoucherEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsVoucherRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

const blankVoucher: CmsVoucherRecord = {
  id: "new",
  title: "",
  description: "",
  amountCents: 0,
  badge: "",
  terms: "",
  status: "draft",
  sortOrder: 0,
  version: 0,
  updatedAt: "",
};

export default async function CmsNewVoucherPage() {
  await requireCmsPageUser("content:write");
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/vouchers" secondary>Back to vouchers</CmsPrimaryLink>} description="Add voucher information and choose whether it is visible immediately." eyebrow="Website content" title="Add gift voucher" />
      <CmsNotice title="Information only">This website does not sell vouchers online. Confirm the value, redemption wording and any expiry or delivery details with the owner before selecting Published.</CmsNotice>
      <VoucherEditorForm isNew voucher={blankVoucher} />
    </>
  );
}
