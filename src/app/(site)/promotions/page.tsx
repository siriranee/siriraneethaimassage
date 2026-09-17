import {
  ArrowUpRight,
  CalendarDays,
  Gift,
  Mail,
  Megaphone,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { getPageCopy } from "@/content/page-copy";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";
import { getPublicPromotions } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = getPageCopy("promotions");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/promotions" });
}

export default async function PromotionsPage() {
  const pageCopy = getPageCopy("promotions");
  const promotions = await getPublicPromotions();
  return (
    <div>
      <PageHero
        {...pageHeroImages.book}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />

      {promotions.length ? (
        <section className={styles.cardsSection} aria-labelledby="current-offers-heading">
          <div className={`container ${styles.cards}`}>
            {promotions.map((promotion, index) => (
              <article className={styles.simpleCard} key={promotion.id}>
                <span className={styles.icon}><Megaphone aria-hidden="true" /></span>
                <p className={styles.kicker}>{index === 0 ? "Current confirmed offer" : "Also available"}</p>
                <h2 id={index === 0 ? "current-offers-heading" : undefined}>{promotion.title}</h2>
                <p>{promotion.description}</p>
                <Link href="/contact">Ask the team <ArrowUpRight aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.cardsSection}>
        <div className={`container ${styles.cards}`}>
          <article className={styles.featureCard}>
            <div className={styles.cardImage}>
              <Image
                alt="Illustrative massage oils and folded towels prepared as a thoughtful gift"
                fill
                sizes="(max-width: 760px) 100vw, 34vw"
                src="/images/spa/spa-still-life.webp"
              />
            </div>
            <div className={styles.cardBody}>
              <span className={styles.icon}><Gift aria-hidden="true" /></span>
              <p className={styles.kicker}>A thoughtful gesture</p>
              <h2>Give the gift of calm</h2>
              <p>
                A Siriranee gift voucher lets someone choose how they would like
                to unwind, whether that is a soothing hot oil massage, Head Spa,
                Back &amp; Neck Massage or Foot &amp; Reflexology Spa. Choose the
                value with our team and use it towards any current treatment.
              </p>
              <Link href="/contact">
                Arrange a gift voucher <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article className={styles.simpleCard}>
            <span className={styles.icon}><Gift aria-hidden="true" /></span>
            <p className={styles.kicker}>For meaningful moments</p>
            <h2>A gift for any occasion</h2>
            <p>
              A thoughtful choice for birthdays, anniversaries, Mother&apos;s Day,
              Valentine&apos;s Day, Christmas, thank-you gifts or a simple
              just-because moment.
            </p>
            <Link href="/contact">
              Ask the team <ArrowUpRight aria-hidden="true" />
            </Link>
          </article>

          <article className={styles.simpleCard}>
            <span className={styles.icon}><Mail aria-hidden="true" /></span>
            <p className={styles.kicker}>Email or collection</p>
            <h2>Choose the format that suits you</h2>
            <p>
              Arrange a digital voucher by email or ask for a gift envelope to
              collect from Siriranee in Howth. Contact the team to confirm the
              current details before purchase.
            </p>
            <Link href="/contact">
              View contact details <ArrowUpRight aria-hidden="true" />
            </Link>
          </article>

          <article className={styles.simpleCard}>
            <span className={styles.icon}><CalendarDays aria-hidden="true" /></span>
            <p className={styles.kicker}>Ready when you are</p>
            <h2>Ready for your next appointment?</h2>
            <p>
              Choose a current treatment and your preferred duration, then
              contact the team to request a suitable time.
            </p>
            <Link href="/book">
              Book Now <ArrowUpRight aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      <div className={`container ${styles.ctaWrap}`}>
        <BookingCta
          title="Give yourself time to slow down"
          description="Choose your treatment preferences here, then contact the Siriranee team to request an appointment."
        />
      </div>
    </div>
  );
}
