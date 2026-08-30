import { FileImage, ImagePlus, Pencil } from "lucide-react";
import Link from "next/link";

import { CmsEmptyState, CmsNotice, CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsMediaPage() {
  const user = await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  const items = [...content.gallery].sort((first, second) => first.sortOrder - second.sortOrder);

  return (
    <>
      <CmsPageHeader
        actions={canCmsRole(user.role, "content:write") ? <CmsPrimaryLink href="/cms/media/new"><ImagePlus aria-hidden="true" /> Add image record</CmsPrimaryLink> : undefined}
        description="Prepare gallery images, captions and accessible alt text. A production media provider has not been selected yet."
        eyebrow="Images"
        title="Media library"
      />

      <CmsNotice tone="warning" title="Media upload remains a clearly marked mock integration">
        Existing website images remain safely in the project. Cloud storage,
        upload limits and backup ownership must be confirmed before real uploads are enabled.
      </CmsNotice>

      {items.length ? (
        <div className={styles.serviceGrid}>
          {items.map((item) => (
            <article className={styles.serviceCard} key={item.id}>
              <div className={styles.serviceTop}>
                <span>Gallery image</span>
                <CmsStatusBadge label={item.published ? "Ready to publish" : "Draft only"} tone={item.published ? "success" : "warning"} />
              </div>
              <span className={styles.cardIcon}><FileImage aria-hidden="true" /></span>
              <h2>{item.caption}</h2>
              <p>{item.altText}</p>
              <dl>
                <div><dt>Image</dt><dd>{item.imageUrl}</dd></div>
                <div><dt>Order</dt><dd>{item.sortOrder}</dd></div>
              </dl>
              {canCmsRole(user.role, "content:write") ? <Link href={`/cms/media/${item.id}/edit`}><Pencil aria-hidden="true" /> Edit image record</Link> : null}
            </article>
          ))}
        </div>
      ) : (
        <CmsEmptyState title="No CMS-managed gallery images yet">
          <FileImage aria-hidden="true" /> Add a metadata record using a verified
          local project image while production storage remains gated.
        </CmsEmptyState>
      )}
    </>
  );
}
