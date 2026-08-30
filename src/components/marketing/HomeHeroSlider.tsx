"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/ButtonLink";

import styles from "./HomeHeroSlider.module.css";

const AUTOPLAY_DELAY_MS = 3_000;

export const homeHeroSlides = [
  {
    src: "/images/hero/slide-traditional-thai.webp",
    alt: "Traditional Thai massage in an elegant plum and gold treatment room",
    title: "Traditional Thai massage",
  },
  {
    src: "/images/hero/slide-hot-oil.webp",
    alt: "Warm massage oil, orchids and folded towels in a peaceful spa setting",
    title: "Warm oil ritual",
  },
  {
    src: "/images/hero/slide-hot-stone.webp",
    alt: "Hot stones, orchids and candlelight arranged for a calming treatment",
    title: "Hot stone relaxation",
  },
] as const;

type HomeHeroSliderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

function normaliseSlide(index: number) {
  return (index + homeHeroSlides.length) % homeHeroSlides.length;
}

export function HomeHeroSlider({
  eyebrow,
  title,
  description,
}: HomeHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const announceSlide = useCallback((index: number) => {
    const nextIndex = normaliseSlide(index);
    setAnnouncement(
      `${homeHeroSlides[nextIndex].title}, slide ${nextIndex + 1} of ${homeHeroSlides.length}.`,
    );
  }, []);

  const selectSlide = useCallback(
    (index: number) => {
      const nextIndex = normaliseSlide(index);
      setActiveIndex(nextIndex);
      announceSlide(nextIndex);
    },
    [announceSlide],
  );

  useEffect(() => {
    if (
      isPointerPaused ||
      isFocusPaused ||
      !isDocumentVisible ||
      prefersReducedMotion
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => normaliseSlide(current + 1));
    }, AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(timer);
  }, [
    isDocumentVisible,
    isFocusPaused,
    isPointerPaused,
    prefersReducedMotion,
  ]);

  return (
    <section
      aria-label="Siriranee massage highlights"
      aria-roledescription="carousel"
      className={styles.hero}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusPaused(false);
        }
      }}
      onFocusCapture={() => setIsFocusPaused(true)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          selectSlide(activeIndex - 1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          selectSlide(activeIndex + 1);
        }
      }}
      onMouseEnter={() => setIsPointerPaused(true)}
      onMouseLeave={() => setIsPointerPaused(false)}
      role="region"
    >
      <div className={styles.slides}>
        {homeHeroSlides.map((slide, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              aria-hidden={!isActive}
              className={`${styles.slide} ${isActive ? styles.slideActive : ""}`}
              data-hero-slide
              data-hero-slide-active={isActive ? "true" : "false"}
              id={`home-hero-slide-${index + 1}`}
              key={slide.src}
            >
              <Image
                alt={slide.alt}
                fill
                preload={index === 0}
                quality={90}
                sizes="100vw"
                src={slide.src}
              />
            </div>
          );
        })}
      </div>

      <div className={styles.scrim} />

      <div className={styles.content}>
        <div className={styles.contentInner}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          <div className={styles.actions}>
            <ButtonLink
              className={styles.primaryAction}
              href="/book"
              icon={<ArrowRight aria-hidden="true" />}
            >
              Book Now
            </ButtonLink>
            <ButtonLink
              className={styles.secondaryAction}
              href="/services"
              variant="outline"
            >
              Explore treatments
            </ButtonLink>
          </div>
        </div>
      </div>

      <Image
        alt=""
        aria-hidden="true"
        className={styles.heroLogo}
        height={1394}
        src="/brand/siriranee-logo-gold-exact.svg"
        unoptimized
        width={1411}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
