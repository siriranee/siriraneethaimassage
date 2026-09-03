"use client";

import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import styles from "./ServiceExplorer.module.css";

type ServicePricing = {
  durationMinutes: number;
  priceEur: number;
  label: string;
};

export type ServiceExplorerItem = {
  slug: string;
  name: string;
  shortDescription: string;
  bookingUrl: string;
  image: {
    src: string;
    alt: string;
  };
  durations: readonly string[];
  pricing: readonly ServicePricing[];
};

type ServiceExplorerProps = {
  services: readonly ServiceExplorerItem[];
};

export function ServiceExplorer({ services }: ServiceExplorerProps) {
  const bookingLabel = "Book Now";

  return (
    <div className={styles.explorer}>
      <div className={styles.grid}>
        {services.map((service) => (
          <article className={styles.card} key={service.slug}>
            <Link
              className={styles.imageLink}
              href={`/services/${service.slug}`}
              aria-label={`View ${service.name}`}
            >
              <Image
                className={styles.image}
                src={service.image.src}
                alt={service.image.alt}
                fill
                sizes="(max-width: 620px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </Link>

            <div className={styles.cardBody}>
              <div
                className={styles.optionList}
                aria-label={`${service.name} duration and price options`}
              >
                {service.pricing.map((option) => (
                  <span
                    className={styles.optionChip}
                    key={`${option.durationMinutes}-${option.priceEur}`}
                  >
                    <Clock3 aria-hidden="true" size={14} />
                    {option.durationMinutes} min
                    <strong>€{option.priceEur}</strong>
                  </span>
                ))}
              </div>
              <h2>
                <Link href={`/services/${service.slug}`}>{service.name}</Link>
              </h2>
              <p>{service.shortDescription}</p>
              <div className={styles.cardActions}>
                <Link className={styles.details} href={`/services/${service.slug}`}>
                  Details
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <Link className={styles.bookLink} href={service.bookingUrl}>
                  <CalendarDays aria-hidden="true" size={17} />
                  {bookingLabel}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {services.length === 0 ? (
        <div className={styles.empty}>
          <h2>No treatments are available yet</h2>
          <p>Please contact us for help choosing a treatment.</p>
        </div>
      ) : null}
    </div>
  );
}
