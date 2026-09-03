import { HeartHandshake, Leaf, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ServiceExplorer } from "@/components/services/ServiceExplorer";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";
import {
  getPublicPageCopy,
  getPublicServicesSnapshot,
} from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("services");
  return createMetadata({
    title: page.seoTitle,
    description: page.seoDescription,
    path: "/services",
  });
}

const experienceNotes = [
  {
    icon: HeartHandshake,
    title: "Comfort-led care",
    text: "Tell us your preferences before the treatment so your visit can feel comfortable and unhurried.",
  },
  {
    icon: Leaf,
    title: "Thoughtful essentials",
    text: "Treatments are prepared with carefully selected oils and spa essentials suited to the service.",
  },
  {
    icon: Sparkles,
    title: "A calm Howth setting",
    text: "Step away from a busy day in a warm, peaceful treatment space in Howth, Dublin.",
  },
];

export default async function ServicesPage() {
  const [{ services }, pageCopy] = await Promise.all([
    getPublicServicesSnapshot(),
    getPublicPageCopy("services"),
  ]);

  return (
    <div>
      <PageHero
        {...pageHeroImages.services}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />

      <section className={styles.servicesSection} aria-labelledby="services-heading">
        <div className={styles.container}>
          <SectionHeading
            title="All Treatments"
            headingId="services-heading"
          />
          <ServiceExplorer services={services} />
        </div>
      </section>

      <section className={styles.experience} aria-label="What to expect">
        <div className={`${styles.container} ${styles.experienceGrid}`}>
          {experienceNotes.map(({ icon: Icon, title, text }) => (
            <article className={styles.experienceItem} key={title}>
              <span className={styles.iconWrap}>
                <Icon aria-hidden="true" size={25} strokeWidth={1.6} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <BookingCta
            title="Not sure which massage to choose?"
            description="Contact the Siriranee team and tell us your preferred massage style, pressure and appointment length. We will help you choose from the five treatments."
          />
        </div>
      </section>
    </div>
  );
}
