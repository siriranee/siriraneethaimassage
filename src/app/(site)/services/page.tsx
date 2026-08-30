import { HeartHandshake, Leaf, Sparkles } from "lucide-react";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ServiceExplorer } from "@/components/services/ServiceExplorer";
import { createMetadata } from "@/lib/metadata";
import { getPublicServicesSnapshot } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export const metadata = createMetadata({
  title: "Massage Treatments in Howth, Dublin",
  description:
    "Explore traditional Thai, hot oil, deep tissue, hot stone and focused upper-body massage at Siriranee Thai Massage in Howth, Dublin.",
  path: "/services",
});

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
  const { categories, services } = await getPublicServicesSnapshot();

  return (
    <div>
      <PageHero
        eyebrow="Siriranee treatments"
        title="Massage Services in Dublin"
        description="Explore our five-treatment menu with clear 30-, 60- and 90-minute options in Howth, Dublin."
        image="/images/spa/spa-still-life.webp"
        imageAlt="Massage oils, candles and flowers in a softly lit treatment setting"
      />

      <section className={styles.servicesSection} aria-labelledby="services-heading">
        <div className={styles.container}>
          <SectionHeading
            eyebrow="Find your treatment"
            title="Choose the experience that feels right"
            headingId="services-heading"
            description="Compare every confirmed duration and price, then open a treatment for more detail or continue to booking."
          />
          <ServiceExplorer services={services} categories={categories} />
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
