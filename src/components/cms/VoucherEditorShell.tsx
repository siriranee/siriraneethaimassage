import { CmsDeleteVoucherButton } from "@/components/cms/CmsDeleteVoucherButton";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { VoucherEditorForm } from "@/components/cms/VoucherEditorForm";

import type { CmsVoucherRecord } from "@/domain/cms/types";

export function VoucherEditorShell(
  { voucher }: Readonly<{ voucher: CmsVoucherRecord }>,
) {
  return (
    <>
      <CmsPageHeader
        actions={
          <>
            <CmsPrimaryLink href="/cms/vouchers" secondary>
              Back to vouchers
            </CmsPrimaryLink>
            <CmsDeleteVoucherButton
              title={voucher.title}
              voucherId={voucher.id}
              version={voucher.version}
            />
          </>
        }
        description="Replace the artwork, adjust its order or archive it. Every successful save publishes immediately."
        eyebrow="Website content"
        title={voucher.title}
      />
      <VoucherEditorForm voucher={voucher} />
    </>
  );
}
