import { Gift, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { CmsEmptyState, CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import styles from "@/components/cms/CmsViews.module.css";

const euro = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export default async function CmsVouchersPage() {
  const user = await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  const vouchers = [...(content.vouchers ?? [])].sort((first, second) => first.sortOrder - second.sortOrder);

  return (
    <>
      <CmsPageHeader
        actions={canCmsRole(user.role, "content:write") ? <CmsPrimaryLink href="/cms/vouchers/new"><Plus aria-hidden="true" /> Add voucher</CmsPrimaryLink> : undefined}
        description="Manage the gift voucher information shown on the website. Customers still arrange and pay directly with the Siriranee team."
        eyebrow="Website content"
        title="Gift vouchers"
      />
      {vouchers.length ? (
        <div className={styles.serviceGrid}>
          {vouchers.map((voucher) => (
            <article className={styles.serviceCard} key={voucher.id}>
              <div className={styles.serviceTop}>
                <span>Order {voucher.sortOrder}</span>
                <CmsStatusBadge label={voucher.status} tone={voucher.status === "published" ? "success" : voucher.status === "draft" ? "warning" : "neutral"} />
              </div>
              <span className={styles.cardIcon}><Gift aria-hidden="true" /></span>
              <h2>{voucher.title}</h2>
              <p>{voucher.description}</p>
              <dl>
                <div><dt>Value</dt><dd>{euro.format(voucher.amountCents / 100)}</dd></div>
                <div><dt>Badge</dt><dd>{voucher.badge || "None"}</dd></div>
              </dl>
              {canCmsRole(user.role, "content:write") ? <Link href={`/cms/vouchers/${voucher.id}/edit`}><Pencil aria-hidden="true" /> Edit voucher</Link> : null}
            </article>
          ))}
        </div>
      ) : (
        <CmsEmptyState title="No vouchers recorded">Create a draft with an owner-confirmed value and customer-facing details.</CmsEmptyState>
      )}
    </>
  );
}
