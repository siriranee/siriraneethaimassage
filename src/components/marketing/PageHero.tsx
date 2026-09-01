import Image from "next/image";
import type { CSSProperties } from "react";

import styles from "./PageHero.module.css";

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  focalX?: number;
  focalY?: number;
  mobileFocalX?: number;
  mobileFocalY?: number;
};

type PageHeroImageStyle = CSSProperties & {
  "--page-hero-focal-x": string;
  "--page-hero-focal-y": string;
  "--page-hero-mobile-focal-x": string;
  "--page-hero-mobile-focal-y": string;
};

export function PageHero({
  eyebrow,
  title,
  description,
  image = "/images/spa/spa-still-life.webp",
  imageAlt = "A calm massage treatment room with oils and flowers",
  focalX = 50,
  focalY = 50,
  mobileFocalX = focalX,
  mobileFocalY = focalY,
}: PageHeroProps) {
  const imageStyle: PageHeroImageStyle = {
    "--page-hero-focal-x": `${focalX}%`,
    "--page-hero-focal-y": `${focalY}%`,
    "--page-hero-mobile-focal-x": `${mobileFocalX}%`,
    "--page-hero-mobile-focal-y": `${mobileFocalY}%`,
  };

  return (
    <section className={styles.hero}>
      <div className={styles.media}>
        <Image
          alt={imageAlt}
          className={styles.image}
          fill
          preload
          quality={90}
          sizes="(max-width: 620px) 400vw, (max-width: 900px) 180vw, 100vw"
          src={image}
          style={imageStyle}
        />
      </div>

      <div aria-hidden="true" className={styles.scrim} />

      <div className={styles.content}>
        <div className={styles.contentInner}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
      </div>
    </section>
  );
}
