import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { CmsEmptyState, CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import styles from "./page.module.css";

export default async function CmsVouchersPage() {
  const user = await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  const vouchers = [...(content.vouchers ?? [])].sort((first, second) => first.sortOrder - second.sortOrder);

  return (
    <>
      <CmsPageHeader
        actions={canCmsRole(user.role, "content:write") ? <CmsPrimaryLink href="/cms/vouchers/new"><Plus aria-hidden="true" /> Add voucher</CmsPrimaryLink> : undefined}
        description="Manage the image cards shown in the draggable voucher slider. Each card has one title and one complete artwork image."
        eyebrow="Website content"
        title="Gift vouchers"
      />
      {vouchers.length ? (
        <div className={styles.grid}>
          {vouchers.map((voucher) => (
            <article className={styles.card} key={voucher.id}>
              <div className={styles.cardTop}>
                <span>Order {voucher.sortOrder}</span>
                <CmsStatusBadge label={voucher.status} tone={voucher.status === "published" ? "success" : voucher.status === "draft" ? "warning" : "neutral"} />
              </div>
              <div className={styles.imageFrame}>
                {voucher.imageUrl ? (
                  <Image alt={voucher.imageAlt} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" src={voucher.imageUrl} />
                ) : (
                  <span>Image required</span>
                )}
              </div>
              <h2>{voucher.title}</h2>
              {canCmsRole(user.role, "content:write") ? <Link href={`/cms/vouchers/${voucher.id}`}><Pencil aria-hidden="true" /> Edit voucher</Link> : null}
            </article>
          ))}
        </div>
      ) : (
        <CmsEmptyState title="No vouchers recorded">Add the first voucher title and artwork.</CmsEmptyState>
      )}
    </>
  );
}
