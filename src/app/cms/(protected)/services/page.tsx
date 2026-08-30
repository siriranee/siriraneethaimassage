import { Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsServicesPage() {
  await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  const services = [...content.services].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/services/new"><Plus aria-hidden="true" /> Add treatment</CmsPrimaryLink>}
        description="Edit treatment descriptions, durations, exact euro prices and search metadata. Historical bookings retain their original price snapshot."
        eyebrow="Website catalogue"
        title="Services"
      />

      <div className={styles.serviceGrid}>
        {services.map((service) => (
          <article className={styles.serviceCard} key={service.id}>
            <div className={styles.serviceTop}>
              <span>{service.category}</span>
              <CmsStatusBadge
                label={service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                tone={service.status === "published" ? "success" : service.status === "draft" ? "warning" : "neutral"}
              />
            </div>
            <h2>{service.name}</h2>
            <p>{service.shortDescription}</p>
            <dl>
              {service.prices.map((price) => (
                <div key={price.id}>
                  <dt>{price.durationMinutes} minutes</dt>
                  <dd>€{(price.priceCents / 100).toFixed(0)}{price.active ? "" : " · inactive"}</dd>
                </div>
              ))}
            </dl>
            <Link href={`/cms/services/${service.id}/edit`}><Pencil aria-hidden="true" /> Edit treatment</Link>
          </article>
        ))}
      </div>
    </>
  );
}
