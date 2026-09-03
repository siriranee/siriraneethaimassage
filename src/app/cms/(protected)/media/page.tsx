import { FileImage, ImagePlus, Pencil } from "lucide-react";
import Link from "next/link";

import { CmsEmptyState, CmsNotice, CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { CmsMediaCleanupButton } from "@/components/cms/CmsMediaCleanupButton";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { getCloudinaryMediaReadiness } from "@/server/media/config";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsMediaPage() {
  const user = await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  const media = getCloudinaryMediaReadiness();
  const items = [...content.gallery].sort((first, second) => first.sortOrder - second.sortOrder);

  return (
    <>
      <CmsPageHeader
        actions={canCmsRole(user.role, "content:write") ? <CmsPrimaryLink href="/cms/media/new"><ImagePlus aria-hidden="true" /> Add image record</CmsPrimaryLink> : undefined}
        description="Prepare, compress and manage website images with accessible alt text."
        eyebrow="Images"
        title="Media library"
      />

      <CmsNotice
        tone={media.ready ? "success" : "warning"}
        title={media.ready ? "Cloudinary uploads are ready" : "Cloudinary uploads are safely disabled"}
      >
        {media.ready
          ? "Images are compressed in your browser, uploaded through a signed request and saved with the CMS record."
          : "Local image preparation remains available. Add the complete server-only Cloudinary configuration and enable the media readiness gate before uploading."}
      </CmsNotice>

      {media.ready && canCmsRole(user.role, "content:write") ? (
        <CmsMediaCleanupButton />
      ) : null}

      {items.length ? (
        <div className={styles.serviceGrid}>
          {items.map((item) => (
            <article className={styles.serviceCard} key={item.id}>
              <div className={styles.serviceTop}>
                <span>Gallery image</span>
                <CmsStatusBadge label={item.published ? "Visible" : "Hidden"} tone={item.published ? "success" : "warning"} />
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
          <FileImage aria-hidden="true" /> Add a gallery record with an existing
          project image or prepare a new upload when Cloudinary is ready.
        </CmsEmptyState>
      )}
    </>
  );
}
