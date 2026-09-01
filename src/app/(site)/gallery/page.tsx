import Image from "next/image";
import type { Metadata } from "next";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";
import { getPublicGallery, getPublicPageCopy } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("gallery");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/gallery" });
}

const fallbackGalleryImages = [
  {
    src: "/images/spa/hero-massage.webp",
    alt: "Relaxing massage treatment in a softly lit spa setting",
    caption: "Time set aside for calm",
  },
  {
    src: "/images/spa/aromatherapy-oil.webp",
    alt: "Warm massage oils arranged beside spa towels",
    caption: "Warm oils and considered details",
  },
  {
    src: "/images/spa/deep-tissue-massage.webp",
    alt: "Illustrative deep tissue massage in warm ambient light",
    caption: "Focused, comfort-led pressure",
  },
  {
    src: "/images/spa/traditional-thai-massage.webp",
    alt: "Traditional Thai massage treatment in progress",
    caption: "Thai-inspired care",
  },
  {
    src: "/images/spa/spa-still-life.webp",
    alt: "Spa towels, massage oils, stones and flowers",
    caption: "A warm, unhurried atmosphere",
  },
] as const;

export default async function GalleryPage() {
  const [publishedImages, pageCopy] = await Promise.all([getPublicGallery(), getPublicPageCopy("gallery")]);
  const galleryImages = publishedImages.length
    ? publishedImages
    : fallbackGalleryImages.map((image, index) => ({ id: `fallback-${index}`, ...image }));

  return (
    <div>
      <PageHero
        {...pageHeroImages.gallery}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />

      <section className={styles.gallerySection} aria-labelledby="gallery-heading">
        <div className={styles.container}>
          <SectionHeading
            title="Treatment Moments"
            headingId="gallery-heading"
          />
          <div className={styles.galleryGrid}>
            {galleryImages.map((image, index) => (
              <figure className={styles.figure} key={image.id}>
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes={
                    index === 0
                      ? "(max-width: 700px) 100vw, 58vw"
                      : "(max-width: 700px) 100vw, 38vw"
                  }
                />
                <figcaption>{image.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.quoteSection}>
        <div className={styles.quoteInner}>
          <span aria-hidden="true">✦</span>
          <p>Choose a little time for yourself, close to the heart of Howth.</p>
          <span aria-hidden="true">✦</span>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <BookingCta
            title="Experience Siriranee for yourself"
            description="Explore the full treatment menu and choose the appointment that feels right for your day."
            secondaryHref="/services"
            secondaryLabel="View all services"
          />
        </div>
      </section>
    </div>
  );
}
