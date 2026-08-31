import { ArrowRight, CalendarDays, Check, Clock3, Euro, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { createMetadata } from "@/lib/metadata";
import {
  buildBreadcrumbJsonLd,
  buildServiceJsonLd,
  jsonLdScriptProps,
} from "@/lib/structured-data";
import {
  getPublicServicesSnapshot,
  getPublicSiteData,
} from "@/server/cms/public-adapter";

import styles from "./page.module.css";

type ServiceDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const { services } = await getPublicServicesSnapshot();
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: ServiceDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { services } = await getPublicServicesSnapshot();
  const service = services.find((item) => item.slug === slug);

  if (!service) {
    return createMetadata({
      title: "Massage Service Not Found",
      description: "Browse massage treatments at Siriranee in Howth, Dublin.",
      path: "/services",
    });
  }

  return createMetadata({
    title: service.seo.title,
    description: service.seo.description,
    path: `/services/${service.slug}`,
    image: service.image,
  });
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params;
  const [{ categories: serviceCategories, services }, site] =
    await Promise.all([
      getPublicServicesSnapshot(),
      getPublicSiteData(),
    ]);
  const service = services.find((item) => item.slug === slug);

  if (!service) {
    notFound();
  }

  const category = serviceCategories.find((item) => item.id === service.category);
  const relatedServices = services
    .filter((item) => item.slug !== service.slug && item.category === service.category)
    .slice(0, 3);
  const serviceJsonLd = buildServiceJsonLd(service, site);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Services", path: "/services" },
    { name: service.name, path: `/services/${service.slug}` },
  ]);

  return (
    <div>
      <script {...jsonLdScriptProps(serviceJsonLd)} />
      <script {...jsonLdScriptProps(breadcrumbJsonLd)} />

      <PageHero
        eyebrow={`${category?.label ?? "Massage treatment"} · Howth, Dublin`}
        title={service.name}
        description={service.shortDescription}
        image={service.image.src}
        imageAlt={service.image.alt}
      />

      <section className={styles.optionsSection} aria-labelledby="treatment-options-heading">
        <div className={styles.container}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/services">Services</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{service.name}</span>
          </nav>

          <div className={styles.optionsCard}>
            <div className={styles.optionsIntro}>
              <p className={styles.eyebrow}>Treatment options</p>
              <h2 id="treatment-options-heading">Choose your appointment</h2>
              <p>
                Review the available durations and prices, then choose a preferred
                date and time.
              </p>
            </div>

            <div className={styles.optionsDetails}>
              {service.durations.length ? (
                <div className={styles.summaryLine}>
                  <Clock3 aria-hidden="true" size={20} />
                  <div>
                    <span>Available durations</span>
                    <strong>{service.durations.join(" · ")}</strong>
                  </div>
                </div>
              ) : null}

              {service.pricing.length ? (
                <div className={styles.pricing} aria-label="Treatment options and prices">
                  {service.pricing.map((option) => (
                    <div className={styles.priceOption} key={`${option.durationMinutes}-${option.priceEur}`}>
                      <span>{option.durationMinutes} minutes</span>
                      <strong>€{option.priceEur}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.enquiryNote}>
                  Please contact us for availability and appointment options for this treatment.
                </p>
              )}

              {service.priceNote ? <p className={styles.serviceNote}>{service.priceNote}</p> : null}
              {service.bookingNotice ? (
                <p className={styles.serviceNote}>{service.bookingNotice}</p>
              ) : null}

              <div className={styles.actions}>
                <Link className={styles.primaryAction} href={service.bookingUrl}>
                  <CalendarDays aria-hidden="true" size={18} />
                  Book Now
                </Link>
                <Link className={styles.secondaryAction} href="/contact">
                  Ask a question
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.contentSection}>
        <div className={`${styles.container} ${styles.contentGrid}`}>
          <article className={styles.overview}>
            <p className={styles.eyebrow}>About this treatment</p>
            <h2>A considered moment for body and mind</h2>
            <p className={styles.longDescription}>{service.longDescription}</p>

            {service.highlights.length ? (
              <div className={styles.highlights}>
                <h3>Experience highlights</h3>
                <ul>
                  {service.highlights.map((highlight) => (
                    <li key={highlight}>
                      <span>
                        <Check aria-hidden="true" size={15} />
                      </span>
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>

          <aside className={styles.sidebar} aria-label="Treatment guidance">
            <div className={styles.guidanceCard}>
              <span className={styles.sidebarIcon}>
                <Sparkles aria-hidden="true" size={22} />
              </span>
              <h2>This may suit you if…</h2>
              <ul>
                {service.idealFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>
                Please let your therapist know about comfort preferences or anything relevant before your treatment begins.
              </p>
            </div>

            {service.pricing.length ? (
              <div className={styles.smallCard}>
                <Euro aria-hidden="true" size={22} />
                <div>
                  <strong>Clear treatment options</strong>
                  <span>Choose a listed duration when you book.</span>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      {relatedServices.length ? (
        <section className={styles.relatedSection} aria-labelledby="related-heading">
          <div className={styles.container}>
            <div className={styles.relatedHeading}>
              <div>
                <p className={styles.eyebrow}>Continue exploring</p>
                <h2 id="related-heading">Related treatments</h2>
              </div>
              <Link href="/services">
                View all services
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
            </div>
            <div className={styles.relatedGrid}>
              {relatedServices.map((item) => (
                <article className={styles.relatedCard} key={item.slug}>
                  <Link className={styles.relatedImage} href={`/services/${item.slug}`}>
                    <Image
                      src={item.image.src}
                      alt={item.image.alt}
                      fill
                      sizes="(max-width: 680px) 100vw, 33vw"
                    />
                  </Link>
                  <div>
                    <h3>
                      <Link href={`/services/${item.slug}`}>{item.name}</Link>
                    </h3>
                    <p>{item.shortDescription}</p>
                    <Link className={styles.relatedLink} href={`/services/${item.slug}`}>
                      View details <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <BookingCta
            title={`Ready to book ${service.name.toLowerCase()}?`}
            description="Review this treatment on the booking page, then contact the Siriranee team to request a date and time."
            primaryHref={service.bookingUrl}
          />
        </div>
      </section>
    </div>
  );
}
