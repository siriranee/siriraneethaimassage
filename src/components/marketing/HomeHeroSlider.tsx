"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { defaultHomeHeroSlides } from "@/content/home-hero";
import type { CmsPageHeroSlide } from "@/domain/cms/page-hero";

import styles from "./HomeHeroSlider.module.css";

const AUTOPLAY_DELAY_MS = 3_000;

export const homeHeroSlides = defaultHomeHeroSlides;

type HomeHeroSliderProps = {
  eyebrow: string;
  title: string;
  description: string;
  slides?: readonly CmsPageHeroSlide[];
};

function normaliseSlide(index: number, slideCount: number) {
  return (index + slideCount) % slideCount;
}

export function HomeHeroSlider({
  eyebrow,
  title,
  description,
  slides,
}: HomeHeroSliderProps) {
  const resolvedSlides = slides?.length ? slides : homeHeroSlides;
  const hasMultipleSlides = resolvedSlides.length > 1;
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
    const nextIndex = normaliseSlide(index, resolvedSlides.length);
    setAnnouncement(
      `${resolvedSlides[nextIndex].title}, slide ${nextIndex + 1} of ${resolvedSlides.length}.`,
    );
  }, [resolvedSlides]);

  const selectSlide = useCallback(
    (index: number) => {
      const nextIndex = normaliseSlide(index, resolvedSlides.length);
      setActiveIndex(nextIndex);
      announceSlide(nextIndex);
    },
    [announceSlide, resolvedSlides.length],
  );

  useEffect(() => {
    if (
      !hasMultipleSlides ||
      isPointerPaused ||
      isFocusPaused ||
      !isDocumentVisible ||
      prefersReducedMotion
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) =>
        normaliseSlide(current + 1, resolvedSlides.length),
      );
    }, AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(timer);
  }, [
    isDocumentVisible,
    isFocusPaused,
    hasMultipleSlides,
    isPointerPaused,
    prefersReducedMotion,
    resolvedSlides.length,
  ]);

  return (
    <section
      aria-label="Siriranee massage highlights"
      aria-roledescription={hasMultipleSlides ? "carousel" : undefined}
      className={styles.hero}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusPaused(false);
        }
      }}
      onFocusCapture={() => setIsFocusPaused(true)}
      onKeyDown={(event) => {
        if (!hasMultipleSlides) return;

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
        {resolvedSlides.map((slide, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              aria-hidden={!isActive}
              className={`${styles.slide} ${isActive ? styles.slideActive : ""}`}
              data-hero-slide
              data-hero-slide-active={isActive ? "true" : "false"}
              id={`home-hero-slide-${index + 1}`}
              key={slide.id}
            >
              <Image
                alt={slide.altText}
                fill
                preload={index === 0}
                quality={90}
                sizes="(max-width: 620px) 400vw, (max-width: 900px) 180vw, 100vw"
                src={slide.imageUrl}
                style={{ objectPosition: `${slide.focalX}% ${slide.focalY}%` }}
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
        height={1200}
        sizes="(max-width: 380px) 6.2rem, (max-width: 620px) 7.2rem, (max-width: 900px) 6.5rem, (max-width: 1100px) 5.8rem, 7.5rem"
        src="/siriranee_logo.svg"
        width={1200}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
