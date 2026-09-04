import Image from "next/image";

import styles from "./RouteLoading.module.css";

type RouteLoadingVariant = "initial" | "public" | "cms" | "cms-content";

export function RouteLoading({
  variant,
}: Readonly<{ variant: RouteLoadingVariant }>) {
  if (variant === "initial" || variant === "cms") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className={`${styles.gateway} ${variant === "cms" ? styles.cmsGateway : ""}`}
        role="status"
      >
        <div className={styles.gatewayCard}>
          <Image
            alt=""
            aria-hidden="true"
            className={styles.logo}
            height={1200}
            loading="eager"
            sizes="7.5rem"
            src="/siriranee_logo.svg"
            width={1200}
          />
          <div aria-hidden="true" className={styles.pulseMark} />
          <strong>
            {variant === "cms" ? "Opening Siriranee CMS" : "Loading Siriranee"}
          </strong>
          <span>Please wait a moment.</span>
        </div>
      </div>
    );
  }

  if (variant === "public") {
    return (
      <section
        aria-busy="true"
        aria-label="Loading page"
        aria-live="polite"
        className={styles.publicPage}
        role="status"
      >
        <div aria-hidden="true" className={styles.publicHero}>
          <div className={styles.publicHeroCopy}>
            <span className={`${styles.skeleton} ${styles.eyebrow}`} />
            <span className={`${styles.skeleton} ${styles.publicTitle}`} />
            <span className={`${styles.skeleton} ${styles.publicLine}`} />
            <span className={`${styles.skeleton} ${styles.publicLineShort}`} />
          </div>
        </div>
        <div aria-hidden="true" className={styles.publicCards}>
          {Array.from({ length: 3 }, (_, index) => (
            <div className={styles.publicCard} key={index}>
              <span className={`${styles.skeleton} ${styles.cardIcon}`} />
              <span className={`${styles.skeleton} ${styles.cardTitle}`} />
              <span className={`${styles.skeleton} ${styles.cardLine}`} />
              <span className={`${styles.skeleton} ${styles.cardLineShort}`} />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading page content.</span>
      </section>
    );
  }

  return (
    <section
      aria-busy="true"
      aria-label="Loading CMS page"
      aria-live="polite"
      className={styles.cmsContent}
      role="status"
    >
      <div aria-hidden="true" className={styles.cmsHeading}>
        <div>
          <span className={`${styles.skeleton} ${styles.cmsEyebrow}`} />
          <span className={`${styles.skeleton} ${styles.cmsTitle}`} />
          <span className={`${styles.skeleton} ${styles.cmsDescription}`} />
        </div>
        <span className={`${styles.skeleton} ${styles.cmsAction}`} />
      </div>
      <div aria-hidden="true" className={styles.cmsStats}>
        {Array.from({ length: 3 }, (_, index) => (
          <div className={styles.cmsStat} key={index}>
            <span className={`${styles.skeleton} ${styles.cmsStatIcon}`} />
            <div>
              <span className={`${styles.skeleton} ${styles.cmsStatLabel}`} />
              <span className={`${styles.skeleton} ${styles.cmsStatValue}`} />
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className={styles.cmsPanel}>
        <div className={styles.cmsPanelHeader}>
          <span className={`${styles.skeleton} ${styles.cmsPanelTitle}`} />
          <span className={`${styles.skeleton} ${styles.cmsPanelDescription}`} />
        </div>
        <div className={styles.cmsRows}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.cmsRow} key={index}>
              <span className={`${styles.skeleton} ${styles.cmsRowPrimary}`} />
              <span className={`${styles.skeleton} ${styles.cmsRowSecondary}`} />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading CMS content.</span>
    </section>
  );
}
