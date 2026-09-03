"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  limitServiceGallerySlides,
  type ServiceGallerySlide,
} from "@/content/service-galleries";

import styles from "./ServiceImageSlider.module.css";

const SWIPE_DISTANCE_PX = 48;
const SCROLL_EDGE_TOLERANCE_PX = 2;

type ServiceImageSliderProps = {
  readonly serviceName: string;
  readonly slides: readonly ServiceGallerySlide[];
};

function normaliseSlide(index: number, total: number) {
  return (index + total) % total;
}

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function ServiceImageSlider({
  serviceName,
  slides,
}: ServiceImageSliderProps) {
  const visibleSlides = limitServiceGallerySlides(slides);
  const [selectedIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [thumbnailScroll, setThumbnailScroll] = useState({
    hasOverflow: false,
    canScrollBackward: false,
    canScrollForward: false,
  });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const headingId = `${useId()}-service-gallery-heading`;
  const slidesId = `${headingId}-slides`;
  const thumbnailsId = `${headingId}-thumbnails`;
  const hasMultipleSlides = visibleSlides.length > 1;
  const activeIndex = Math.min(
    selectedIndex,
    Math.max(visibleSlides.length - 1, 0),
  );

  const updateThumbnailScrollState = useCallback(() => {
    const strip = thumbnailStripRef.current;

    if (!strip) {
      return;
    }

    const maximumScrollLeft = Math.max(
      0,
      strip.scrollWidth - strip.clientWidth,
    );
    const nextState = {
      hasOverflow: maximumScrollLeft > SCROLL_EDGE_TOLERANCE_PX,
      canScrollBackward: strip.scrollLeft > SCROLL_EDGE_TOLERANCE_PX,
      canScrollForward:
        strip.scrollLeft < maximumScrollLeft - SCROLL_EDGE_TOLERANCE_PX,
    };

    setThumbnailScroll((currentState) =>
      currentState.hasOverflow === nextState.hasOverflow &&
      currentState.canScrollBackward === nextState.canScrollBackward &&
      currentState.canScrollForward === nextState.canScrollForward
        ? currentState
        : nextState,
    );
  }, []);

  const revealThumbnail = useCallback((index: number) => {
    const strip = thumbnailStripRef.current;
    const thumbnail = thumbnailRefs.current[index];

    if (!strip || !thumbnail) {
      return;
    }

    const stripRect = strip.getBoundingClientRect();
    const thumbnailRect = thumbnail.getBoundingClientRect();
    const thumbnailCenter =
      thumbnailRect.left -
      stripRect.left +
      strip.scrollLeft +
      thumbnailRect.width / 2;
    const maximumScrollLeft = Math.max(
      0,
      strip.scrollWidth - strip.clientWidth,
    );
    const targetScrollLeft = Math.min(
      maximumScrollLeft,
      Math.max(0, thumbnailCenter - strip.clientWidth / 2),
    );

    if (Math.abs(strip.scrollLeft - targetScrollLeft) > SCROLL_EDGE_TOLERANCE_PX) {
      strip.scrollTo({
        behavior: preferredScrollBehavior(),
        left: targetScrollLeft,
      });
    }
  }, []);

  useEffect(() => {
    const strip = thumbnailStripRef.current;

    if (!strip || !hasMultipleSlides) {
      return;
    }

    const handleGeometryChange = () => {
      updateThumbnailScrollState();
      revealThumbnail(activeIndex);
    };

    handleGeometryChange();
    strip.addEventListener("scroll", updateThumbnailScrollState, {
      passive: true,
    });
    window.addEventListener("resize", handleGeometryChange);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(handleGeometryChange);
    resizeObserver?.observe(strip);

    return () => {
      resizeObserver?.disconnect();
      strip.removeEventListener("scroll", updateThumbnailScrollState);
      window.removeEventListener("resize", handleGeometryChange);
    };
  }, [
    activeIndex,
    hasMultipleSlides,
    revealThumbnail,
    updateThumbnailScrollState,
    visibleSlides.length,
  ]);

  if (!visibleSlides.length) {
    return null;
  }

  const showSlide = (index: number) => {
    const nextIndex = normaliseSlide(index, visibleSlides.length);
    const nextSlide = visibleSlides[nextIndex];
    setActiveIndex(nextIndex);
    setAnnouncement(
      `${nextSlide.caption} Image ${nextIndex + 1} of ${visibleSlides.length}.`,
    );
  };

  const focusThumbnail = (index: number) => {
    const nextIndex = normaliseSlide(index, visibleSlides.length);
    showSlide(nextIndex);
    window.requestAnimationFrame(() => {
      thumbnailRefs.current[nextIndex]?.focus();
    });
  };

  const scrollThumbnailStrip = (direction: -1 | 1) => {
    const strip = thumbnailStripRef.current;

    if (!strip) {
      return;
    }

    strip.scrollBy({
      behavior: preferredScrollBehavior(),
      left: direction * Math.max(strip.clientWidth * 0.72, 1),
    });
  };

  const finishSwipe = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const start = pointerStart.current;
    pointerStart.current = null;

    if (!start || !hasMultipleSlides) {
      return;
    }

    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;
    const isHorizontalSwipe =
      Math.abs(distanceX) >= SWIPE_DISTANCE_PX &&
      Math.abs(distanceX) > Math.abs(distanceY) * 1.2;

    if (!isHorizontalSwipe) {
      return;
    }

    showSlide(activeIndex + (distanceX < 0 ? 1 : -1));
  };

  return (
    <section
      aria-labelledby={headingId}
      aria-roledescription={hasMultipleSlides ? "carousel" : undefined}
      className={styles.section}
      role="region"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Illustrative gallery</p>
          <h2 id={headingId}>{serviceName} in focus</h2>
          <p>A closer look at the atmosphere and details around this treatment.</p>
        </header>

        <div className={styles.slider}>
          <div
            aria-label={
              hasMultipleSlides
                ? "Treatment image gallery. Use the left and right arrow keys to browse."
                : "Treatment image"
            }
            className={styles.viewport}
            onKeyDown={(event) => {
              if (!hasMultipleSlides) {
                return;
              }

              if (event.key === "ArrowLeft") {
                event.preventDefault();
                showSlide(activeIndex - 1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                showSlide(activeIndex + 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                showSlide(0);
              } else if (event.key === "End") {
                event.preventDefault();
                showSlide(visibleSlides.length - 1);
              }
            }}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
            onPointerDown={(event) => {
              const eventTarget = event.target;
              const startedOnControl =
                eventTarget instanceof Element &&
                eventTarget.closest("button") !== null;

              if (!event.isPrimary || !hasMultipleSlides || startedOnControl) {
                return;
              }

              pointerStart.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              finishSwipe(event);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            tabIndex={hasMultipleSlides ? 0 : -1}
          >
            <div className={styles.slides} id={slidesId}>
              {visibleSlides.map((slide, index) => {
                const isActive = index === activeIndex;

                return (
                  <figure
                    aria-hidden={!isActive}
                    aria-label={
                      hasMultipleSlides
                        ? undefined
                        : `${index + 1} of ${visibleSlides.length}: ${slide.caption}`
                    }
                    aria-labelledby={
                      hasMultipleSlides
                        ? `${thumbnailsId}-${index}`
                        : undefined
                    }
                    aria-roledescription="slide"
                    className={`${styles.slide} ${isActive ? styles.slideActive : ""}`}
                    id={`${slidesId}-${index}`}
                    key={slide.src}
                    role={hasMultipleSlides ? "tabpanel" : "group"}
                  >
                    <Image
                      alt={slide.alt}
                      className={styles.image}
                      draggable={false}
                      fill
                      quality={90}
                      sizes="(max-width: 290px) calc(100vw - 2rem), (max-width: 1963px) 89vw, calc(100vw - 13.5rem)"
                      src={slide.src}
                    />
                    <figcaption className={styles.caption}>
                      {slide.caption}
                    </figcaption>
                  </figure>
                );
              })}
            </div>

            {hasMultipleSlides ? (
              <>
                <button
                  aria-controls={slidesId}
                  aria-label="Previous treatment image"
                  className={`${styles.control} ${styles.previous}`}
                  onClick={() => showSlide(activeIndex - 1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  aria-controls={slidesId}
                  aria-label="Next treatment image"
                  className={`${styles.control} ${styles.next}`}
                  onClick={() => showSlide(activeIndex + 1)}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>

          {hasMultipleSlides ? (
            <div
              className={`${styles.thumbnailNavigation} ${thumbnailScroll.canScrollBackward ? styles.thumbnailCanScrollBackward : ""} ${thumbnailScroll.canScrollForward ? styles.thumbnailCanScrollForward : ""}`}
            >
              <button
                aria-controls={thumbnailsId}
                aria-label="Scroll image thumbnails backward"
                className={`${styles.thumbnailScrollControl} ${styles.thumbnailScrollPrevious}`}
                disabled={!thumbnailScroll.canScrollBackward}
                hidden={!thumbnailScroll.hasOverflow}
                onClick={() => scrollThumbnailStrip(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" />
              </button>

              <div
                aria-label="Choose a treatment image"
                className={styles.thumbnails}
                id={thumbnailsId}
                ref={thumbnailStripRef}
                role="tablist"
              >
                {visibleSlides.map((slide, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <button
                      aria-controls={`${slidesId}-${index}`}
                      aria-label={`Show image ${index + 1}: ${slide.caption}`}
                      aria-selected={isActive}
                      className={`${styles.thumbnail} ${isActive ? styles.thumbnailActive : ""}`}
                      id={`${thumbnailsId}-${index}`}
                      key={slide.src}
                      onClick={() => showSlide(index)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          focusThumbnail(index - 1);
                        } else if (event.key === "ArrowRight") {
                          event.preventDefault();
                          focusThumbnail(index + 1);
                        } else if (event.key === "Home") {
                          event.preventDefault();
                          focusThumbnail(0);
                        } else if (event.key === "End") {
                          event.preventDefault();
                          focusThumbnail(visibleSlides.length - 1);
                        }
                      }}
                      ref={(element) => {
                        thumbnailRefs.current[index] = element;
                      }}
                      tabIndex={isActive ? 0 : -1}
                      role="tab"
                      type="button"
                    >
                      <Image
                        alt=""
                        aria-hidden="true"
                        className={styles.thumbnailImage}
                        fill
                        sizes="(max-width: 620px) 5rem, 7rem"
                        src={slide.src}
                      />
                    </button>
                  );
                })}
              </div>

              <button
                aria-controls={thumbnailsId}
                aria-label="Scroll image thumbnails forward"
                className={`${styles.thumbnailScrollControl} ${styles.thumbnailScrollNext}`}
                disabled={!thumbnailScroll.canScrollForward}
                hidden={!thumbnailScroll.hasOverflow}
                onClick={() => scrollThumbnailStrip(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        {hasMultipleSlides ? (
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        ) : null}
      </div>
    </section>
  );
}
