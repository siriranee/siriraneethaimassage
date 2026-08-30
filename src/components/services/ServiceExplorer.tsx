"use client";

import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

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
  category: string;
  bookingUrl: string;
  image: {
    src: string;
    alt: string;
  };
  durations: readonly string[];
  pricing: readonly ServicePricing[];
};

export type ServiceExplorerCategory = {
  id: string;
  label: string;
};

type ServiceExplorerProps = {
  services: readonly ServiceExplorerItem[];
  categories: readonly ServiceExplorerCategory[];
};

export function ServiceExplorer({ services, categories }: ServiceExplorerProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  const bookingLabel = "Book Now";

  const visibleServices = useMemo(() => {
    if (activeCategory === "all") {
      return services;
    }

    return services.filter((service) => service.category === activeCategory);
  }, [activeCategory, services]);

  return (
    <div className={styles.explorer}>
      <div className={styles.filters} aria-label="Filter massage services">
        <button
          className={activeCategory === "all" ? styles.active : ""}
          type="button"
          aria-pressed={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
        >
          All treatments
        </button>
        {categories.map((category) => (
          <button
            className={activeCategory === category.id ? styles.active : ""}
            key={category.id}
            type="button"
            aria-pressed={activeCategory === category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <p className={styles.resultCount} aria-live="polite">
        Showing {visibleServices.length}{" "}
        {visibleServices.length === 1 ? "treatment" : "treatments"}
      </p>

      <div className={styles.grid}>
        {visibleServices.map((service) => (
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

      {visibleServices.length === 0 ? (
        <div className={styles.empty}>
          <h2>No treatments in this category yet</h2>
          <p>Please explore all services or contact us for help choosing a treatment.</p>
        </div>
      ) : null}
    </div>
  );
}
