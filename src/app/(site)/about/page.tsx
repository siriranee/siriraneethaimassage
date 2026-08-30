import { HeartHandshake, MapPin, MessageCircle, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { createMetadata } from "@/lib/metadata";
import { getPublicPageCopy, getPublicSiteData } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("about");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/about" });
}

const values = [
  {
    icon: HeartHandshake,
    title: "Care centred on you",
    text: "Every visit begins by listening to what feels comfortable and what you want from your chosen treatment.",
  },
  {
    icon: MessageCircle,
    title: "Clear communication",
    text: "Questions and preferences are welcome before and during your appointment, so the experience never feels rushed or unclear.",
  },
  {
    icon: Sparkles,
    title: "Time to slow down",
    text: "Our approach is simple: create a warm, quiet setting where your treatment can become a meaningful pause in the day.",
  },
];

export default async function AboutPage() {
  const [site, pageCopy] = await Promise.all([getPublicSiteData(), getPublicPageCopy("about")]);

  return (
    <div>
      <PageHero
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
        image="/images/spa/hero-massage.webp"
        imageAlt="A relaxing massage treatment in a warmly lit spa room"
      />

      <section className={styles.storySection}>
        <div className={`${styles.container} ${styles.storyGrid}`}>
          <div className={styles.storyVisual}>
            <Image
              src="/images/spa/traditional-thai-massage.webp"
              alt="Illustrative traditional Thai massage treatment in a warm spa room"
              fill
              sizes="(max-width: 820px) 100vw, 46vw"
            />
            <div className={styles.visualBadge}>
              <span>Howth</span>
              <strong>Howth, Dublin</strong>
            </div>
          </div>

          <div className={styles.storyCopy}>
            <p className={styles.eyebrow}>The Siriranee experience</p>
            <h2>Traditional inspiration, considered for modern Dublin life</h2>
            <p>
              Siriranee Thai Massage offers a place to step away from busy routines and choose a treatment that suits the time and style of massage you prefer.
            </p>
            <p>
              Our service menu draws on Thai massage traditions alongside warm oil, hot stone, focused and specialist treatments. Each appointment leaves room for a clear conversation about comfort, pressure and pace before the treatment begins.
            </p>
            <Link className={styles.textLink} href="/services">
              Explore our massage treatments
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.valuesSection} aria-labelledby="values-heading">
        <div className={styles.container}>
          <SectionHeading
            eyebrow="What guides us"
            title="Simple principles for a better visit"
            headingId="values-heading"
            description="A thoughtful massage experience is made in the details: how you are welcomed, how clearly you are heard and how comfortable the space feels."
          />
          <div className={styles.valuesGrid}>
            {values.map(({ icon: Icon, title, text }) => (
              <article className={styles.valueCard} key={title}>
                <span className={styles.valueIcon}>
                  <Icon aria-hidden="true" size={25} strokeWidth={1.55} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.locationSection}>
        <div className={`${styles.container} ${styles.locationGrid}`}>
          <div className={styles.locationCopy}>
            <p className={styles.eyebrow}>Find us in Howth</p>
            <h2>A calm treatment space, close to Dublin</h2>
            <p>
              Visit Siriranee on Floor 3 of Harbour House in Howth, Dublin. Review the provisional hours and confirm your appointment before travelling.
            </p>
            <div className={styles.address}>
              <MapPin aria-hidden="true" size={23} />
              <address>{site.address.formatted}</address>
            </div>
            <a className={styles.directionsLink} href={site.address.directionsUrl}>
              Open directions
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className={styles.locationVisual}>
            <Image
              src="/images/spa/spa-still-life.webp"
              alt="Spa towels, oils and flowers arranged in warm light"
              fill
              sizes="(max-width: 820px) 100vw, 44vw"
            />
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <BookingCta
            title="Your time to slow down starts here"
            description="Browse the treatment menu, choose a convenient time and look forward to a warm welcome in Howth."
          />
        </div>
      </section>
    </div>
  );
}
