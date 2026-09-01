import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  getServiceGalleryImages,
  limitServiceGallerySlides,
  MAX_SERVICE_GALLERY_IMAGES,
} from "../src/content/service-galleries";
import { services } from "../src/content/services";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("known services receive three unique local gallery images", async () => {
  for (const service of services) {
    const slides = getServiceGalleryImages(service);
    assert.equal(slides.length, 3, `${service.slug} should have three gallery slides`);
    assert.equal(new Set(slides.map((slide) => slide.src)).size, slides.length);

    for (const [index, slide] of slides.entries()) {
      assert.equal(
        slide.src,
        `/images/services/${service.slug}/gallery-0${index + 1}.webp`,
      );
      assert.ok(slide.alt.length >= 8);
      assert.ok(slide.caption.length >= 8);
      const absolutePath = path.join(root, "public", slide.src.replace(/^\//, ""));
      const file = await stat(absolutePath);
      assert.ok(file.size > 50_000, `${slide.src} should be a substantial image`);
      const metadata = await sharp(absolutePath).metadata();
      assert.equal(metadata.format, "webp");
      assert.ok((metadata.width ?? 0) >= 1_600);
      assert.ok((metadata.height ?? 0) >= 900);
      assert.ok(
        Math.abs((metadata.width ?? 0) / (metadata.height ?? 1) - 16 / 9) < 0.01,
        `${slide.src} should use a 16:9 composition`,
      );
    }
  }
});

test("unknown CMS services keep only their own image", () => {
  const slides = getServiceGalleryImages({
    slug: "cms-created-service",
    name: "CMS Created Service",
    image: {
      src: "/images/spa/spa-still-life.webp",
      alt: "Spa still life prepared for a CMS-created service",
    },
  });

  assert.equal(slides.length, 1);
  assert.equal(slides[0].src, "/images/spa/spa-still-life.webp");
});

test("long service galleries are limited to a practical image count", () => {
  const slides = Array.from({ length: 14 }, (_, index) => ({
    src: `/images/mock-${index + 1}.webp`,
    alt: `Mock service gallery image ${index + 1}`,
    caption: `Mock gallery caption ${index + 1}`,
    focalX: 50,
    focalY: 50,
  }));

  assert.equal(MAX_SERVICE_GALLERY_IMAGES, 10);
  assert.equal(limitServiceGallerySlides(slides).length, 10);
  assert.equal(limitServiceGallerySlides(slides)[9]?.src, "/images/mock-10.webp");
});

test("service gallery is manual, accessible and placed after treatment options", async () => {
  const [component, styles, servicePage] = await Promise.all([
    source("src/components/services/ServiceImageSlider.tsx"),
    source("src/components/services/ServiceImageSlider.module.css"),
    source("src/app/(site)/services/[slug]/page.tsx"),
  ]);

  assert.match(component, /aria-roledescription=\{hasMultipleSlides \? "carousel"/);
  assert.match(component, /Previous treatment image/);
  assert.match(component, /Next treatment image/);
  assert.match(component, /event\.key === "ArrowLeft"/);
  assert.match(component, /event\.key === "ArrowRight"/);
  assert.match(component, /event\.key === "Home"/);
  assert.match(component, /event\.key === "End"/);
  assert.match(component, /onPointerDown/);
  assert.match(component, /onPointerUp/);
  assert.match(component, /eventTarget\.closest\("button"\)/);
  assert.match(component, /Scroll image thumbnails backward/);
  assert.match(component, /Scroll image thumbnails forward/);
  assert.match(component, /ResizeObserver/);
  assert.match(component, /revealThumbnail\(activeIndex\)/);
  assert.match(component, /tabIndex=\{isActive \? 0 : -1\}/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /role="tab"/);
  assert.match(component, /role=\{hasMultipleSlides \? "tabpanel" : "group"\}/);
  assert.match(component, /aria-selected=\{isActive\}/);
  assert.match(component, /aria-live="polite"/);
  assert.doesNotMatch(component, /setInterval|autoplay|Pause slideshow/);

  assert.match(styles, /\.viewport\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9;/);
  assert.doesNotMatch(styles, /aspect-ratio:\s*(?:16 \/ 7|4 \/ 3);/);
  assert.match(styles, /touch-action:\s*pan-y;/);
  assert.match(styles, /object-fit:\s*cover;/);
  assert.match(styles, /\.thumbnail:first-child\s*\{[\s\S]*?margin-inline-start:\s*auto;/);
  assert.match(styles, /\.thumbnail:last-child\s*\{[\s\S]*?margin-inline-end:\s*auto;/);
  assert.match(styles, /scroll-snap-type:\s*x proximity;/);
  assert.match(styles, /scroll-snap-align:\s*center;/);
  assert.match(styles, /\.thumbnailScrollControl\[hidden\][\s\S]*?display:\s*none;/);
  assert.match(styles, /\.thumbnailCanScrollBackward::before/);
  assert.match(styles, /\.thumbnailCanScrollForward::after/);
  assert.match(styles, /\.viewport:focus-visible[\s\S]*?var\(--color-surface\)[\s\S]*?var\(--color-purple-700\)/);
  assert.match(styles, /\.thumbnail:focus-visible[\s\S]*?var\(--color-purple-700\)/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(styles, /^\s{2,}max-width\s*:|font-size\s*:\s*clamp\(/m);

  const optionsIndex = servicePage.indexOf("className={styles.optionsSection}");
  const galleryIndex = servicePage.indexOf("<ServiceImageSlider");
  const contentIndex = servicePage.indexOf("className={styles.contentSection}");
  assert.ok(optionsIndex >= 0 && optionsIndex < galleryIndex);
  assert.ok(galleryIndex < contentIndex);
  assert.match(servicePage, /<ServiceImageSlider[\s\S]*?key=\{service\.slug\}/);
});
