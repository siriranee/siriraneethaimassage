import {
  ExternalLink,
  ImageOff,
  Images,
  Pencil,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  CmsPageHeader,
  CmsPrimaryLink,
  CmsStatusBadge,
} from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { isApprovedImageUrlForOwnership } from "@/lib/media/cloudinary-delivery";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import {
  getCmsContent,
  getPublishedCmsContent,
} from "@/server/cms/content-service";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

import styles from "./page.module.css";

function formatPrice(priceCents: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(priceCents / 100);
}

export default async function CmsServicesPage() {
  const user = await requireCmsPageUser("content:view");
  const [content, publishedContent] = await Promise.all([
    getCmsContent(),
    getPublishedCmsContent(),
  ]);
  const cloudinaryOwnership = getCloudinaryMediaOwnershipConfig();
  const canWrite = canCmsRole(user.role, "content:write");
  const liveServiceSlugs = new Set(
    publishedContent.services
      .filter(
        (service) =>
          service.prices.some((price) => price.active),
      )
      .map((service) => service.slug),
  );
  const services = content.services;

  const headerActions =
    canWrite ? (
      <div className={styles.headerActions}>
        <CmsPrimaryLink href="/cms/services/new">
          <Plus aria-hidden="true" /> Add treatment
        </CmsPrimaryLink>
      </div>
    ) : undefined;

  return (
    <>
      <CmsPageHeader
        actions={headerActions}
        description="Manage treatment details, appointment prices and images. Every successful save publishes that treatment immediately."
        eyebrow="Website catalogue"
        title="Services"
      />

      {services.length ? (
        <div className={styles.serviceGrid}>
          {services.map((service) => {
            const activePrices = service.prices.filter((price) => price.active);
            const isLive = liveServiceSlugs.has(service.slug);
            const canPreviewImage = isApprovedImageUrlForOwnership(
              service.imageUrl,
              cloudinaryOwnership,
            );

            return (
              <article className={styles.serviceCard} key={service.id}>
                <div className={styles.imageFrame}>
                  {canPreviewImage ? (
                    <Image
                      alt=""
                      aria-hidden="true"
                      className={styles.coverImage}
                      fill
                      sizes="(max-width: 720px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      src={service.imageUrl}
                    />
                  ) : (
                    <div className={styles.imagePlaceholder}>
                      <ImageOff aria-hidden="true" />
                      <span>Cover preview unavailable</span>
                    </div>
                  )}
                  <div className={styles.statusBadge}>
                    <CmsStatusBadge
                      label={isLive ? "Published" : "Save to publish"}
                      tone={isLive ? "purple" : "warning"}
                    />
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardMeta}>
                    <span
                      className={isLive ? styles.liveState : styles.offlineState}
                    >
                      {isLive ? "Live now" : "Not live"}
                    </span>
                  </div>

                  <div className={styles.summary}>
                    <h2>{service.name}</h2>
                    <p>{service.shortDescription}</p>
                  </div>

                  <div className={styles.detailsGrid}>
                    <section
                      aria-label={`${service.name} active appointment prices`}
                      className={styles.priceSection}
                    >
                      <h3>Active appointments</h3>
                      {activePrices.length ? (
                        <dl className={styles.priceList}>
                          {activePrices.map((price) => (
                            <div key={price.id}>
                              <dt>{price.durationMinutes} minutes</dt>
                              <dd>{formatPrice(price.priceCents)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className={styles.noPrices}>No active price options</p>
                      )}
                    </section>

                    <dl className={styles.contentFacts}>
                      <div>
                        <dt>
                          <Images aria-hidden="true" /> Gallery
                        </dt>
                        <dd>
                          {service.galleryImages.length}{" "}
                          {service.galleryImages.length === 1 ? "image" : "images"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {isLive || canWrite ? (
                    <div className={styles.cardActions}>
                      {isLive ? (
                        <Link
                          className={styles.liveLink}
                          href={`/services/${service.slug}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          View live page <ExternalLink aria-hidden="true" />
                        </Link>
                      ) : null}
                      {canWrite ? (
                        <Link
                          className={styles.editLink}
                          href={`/cms/services/${service.id}/edit`}
                        >
                          <Pencil aria-hidden="true" /> Edit treatment
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Images aria-hidden="true" />
          </span>
          <h2>No treatments have been added</h2>
          <p>
            {canWrite
              ? "Create the first treatment and add its appointment options. It will publish when saved."
              : "There are no treatment records available to view yet."}
          </p>
          {canWrite ? (
            <CmsPrimaryLink href="/cms/services/new">
              <Plus aria-hidden="true" /> Add first treatment
            </CmsPrimaryLink>
          ) : null}
        </section>
      )}
    </>
  );
}
