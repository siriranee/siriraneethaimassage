import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Gift,
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
              <h2>Arrange a massage gift</h2>
              <p>
                Contact the team before purchasing so the available gift format,
                treatment choices and terms can be confirmed directly with you.
              </p>
              <Link href="/contact">
                Ask about a gift <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article className={styles.simpleCard}>
            <span className={styles.icon}><Clock3 aria-hidden="true" /></span>
            <p className={styles.kicker}>More unhurried time</p>
            <h2>Choose a 90-minute treatment</h2>
            <p>
              Traditional Thai, hot oil, deep tissue and hot stone massage each
              include a confirmed 90-minute option in the current menu.
            </p>
            <Link href="/services">
              Compare treatments <ArrowUpRight aria-hidden="true" />
            </Link>
          </article>

          <article className={styles.simpleCard}>
            <span className={styles.icon}><Megaphone aria-hidden="true" /></span>
            <p className={styles.kicker}>Seasonal news</p>
            <h2>Offers will appear here when confirmed</h2>
            <p>
              There is no placeholder promotion running. Current owner-approved
              offers will appear here when available.
            </p>
            <Link href="/contact">
              View current contact details <ArrowUpRight aria-hidden="true" />
            </Link>
          </article>

          <article className={styles.simpleCard}>
            <span className={styles.icon}><CalendarDays aria-hidden="true" /></span>
            <p className={styles.kicker}>Ready when you are</p>
            <h2>Ready for your next appointment?</h2>
            <p>
              Choose one of the five confirmed treatments and your preferred
              duration, then contact the team to request a suitable time.
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
