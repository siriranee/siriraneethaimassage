import { Megaphone, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { CmsEmptyState, CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsPromotionsPage() {
  const user = await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  return (
    <>
      <CmsPageHeader
        actions={canCmsRole(user.role, "content:write") ? <CmsPrimaryLink href="/cms/promotions/new"><Plus aria-hidden="true" /> Add promotion</CmsPrimaryLink> : undefined}
        description="Prepare genuine offers, optional date windows and publication status without exposing unconfirmed discounts."
        eyebrow="Website content"
        title="Promotions"
      />
      {content.promotions.length ? (
        <div className={styles.serviceGrid}>
          {content.promotions.map((promotion) => (
            <article className={styles.serviceCard} key={promotion.id}>
              <div className={styles.serviceTop}><span>Offer</span><CmsStatusBadge label={promotion.status} tone={promotion.status === "published" ? "success" : promotion.status === "draft" ? "warning" : "neutral"} /></div>
              <span className={styles.cardIcon}><Megaphone aria-hidden="true" /></span>
              <h2>{promotion.title}</h2>
              <p>{promotion.description}</p>
              <dl><div><dt>Starts</dt><dd>{promotion.startsOn || "No start date"}</dd></div><div><dt>Ends</dt><dd>{promotion.endsOn || "No end date"}</dd></div></dl>
              {canCmsRole(user.role, "content:write") ? <Link href={`/cms/promotions/${promotion.id}/edit`}><Pencil aria-hidden="true" /> Edit promotion</Link> : null}
            </article>
          ))}
        </div>
      ) : (
        <CmsEmptyState title="No promotions recorded">Create a draft only when the title, terms and dates can be confirmed.</CmsEmptyState>
      )}
    </>
  );
}
