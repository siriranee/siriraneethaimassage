import { ArrowRight, CalendarDays } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import styles from "./BookingCta.module.css";

type BookingCtaProps = {
  title?: string;
  description?: string;
  primaryHref?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function BookingCta({
  title = "Make time for calm in Howth, Dublin",
  description = "Choose your treatment and preferred time. We will guide you through the rest.",
  primaryHref = "/book",
  secondaryHref = "/contact",
  secondaryLabel = "Contact us",
}: BookingCtaProps) {
  const bookingLabel = "Book Now";

  return (
    <section className={styles.wrap} aria-labelledby="booking-cta-title">
      <div className={styles.content}>
        <p className={styles.eyebrow}>Your next visit</p>
        <h2 id="booking-cta-title">{title}</h2>
        <p>{description}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={primaryHref}>
            <CalendarDays aria-hidden="true" size={18} />
            {bookingLabel}
          </Link>
          <Link className={styles.secondary} href={secondaryHref}>
            {secondaryLabel}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
      </div>

      <div className={styles.visual}>
        <Image
          src="/images/spa/spa-still-life.webp"
          alt="Illustrative massage oils, towels and flowers in a calm treatment room"
          fill
          sizes="(max-width: 760px) 100vw, 42vw"
        />
      </div>
    </section>
  );
}
