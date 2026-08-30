import Image from "next/image";

import styles from "./PageHero.module.css";

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  compact?: boolean;
};

export function PageHero({
  eyebrow,
  title,
  description,
  image = "/images/spa/spa-still-life.webp",
  imageAlt = "A calm massage treatment room with oils and flowers",
  compact = false,
}: PageHeroProps) {
  return (
    <section className={`${styles.hero} ${compact ? styles.compact : ""}`}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1>{title}</h1>
          <span className={styles.divider} aria-hidden="true" />
          <p className={styles.description}>{description}</p>
        </div>

        <div className={styles.visual} aria-hidden={imageAlt ? undefined : true}>
          <Image
            className={styles.image}
            src={image}
            alt={imageAlt}
            fill
            preload={!compact}
            sizes="(max-width: 760px) 100vw, 50vw"
          />
          <div className={styles.imageShade} />
        </div>
      </div>
    </section>
  );
}
