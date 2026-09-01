import type { CmsPageHeroSlide } from "@/domain/cms/page-hero";

export const defaultHomeHeroSlides = [
  {
    id: "traditional-thai-treatment",
    imageUrl: "/images/Hero/Home/1.png",
    altText:
      "A client receiving traditional Thai massage in an elegant purple treatment room",
    title: "Traditional Thai care",
    focalX: 50,
    focalY: 50,
  },
  {
    id: "relaxing-thai-massage",
    imageUrl: "/images/Hero/Home/2.png",
    altText:
      "A therapist providing a relaxing massage in a softly lit spa room",
    title: "Time to unwind",
    focalX: 50,
    focalY: 50,
  },
  {
    id: "restorative-massage",
    imageUrl: "/images/Hero/Home/3.png",
    altText:
      "A client enjoying a restorative massage in a calm purple spa setting",
    title: "Restorative massage",
    focalX: 50,
    focalY: 50,
  },
  {
    id: "focused-back-massage",
    imageUrl: "/images/Hero/Home/4.png",
    altText:
      "A client receiving focused back massage in warm candlelight",
    title: "Care shaped around you",
    focalX: 50,
    focalY: 50,
  },
  {
    id: "warm-oil-massage",
    imageUrl: "/images/Hero/Home/5.png",
    altText:
      "Warm massage oil being applied during a candlelit treatment",
    title: "Warm oil massage",
    focalX: 50,
    focalY: 50,
  },
  {
    id: "coordinated-thai-care",
    imageUrl: "/images/Hero/Home/6.png",
    altText:
      "A client receiving coordinated Thai massage care in warm ambient light",
    title: "Thai massage in Howth",
    focalX: 50,
    focalY: 50,
  },
] as const satisfies readonly CmsPageHeroSlide[];

const legacyHomeHeroImageUrls = new Set([
  "/images/hero/slide-traditional-thai.webp",
  "/images/hero/slide-hot-oil.webp",
  "/images/hero/slide-hot-stone.webp",
]);
const previousHomeHeroImageUrls = [
  "/images/Hero/Home/1.png",
  "/images/Hero/Home/2.png",
  "/images/Hero/Home/3.png",
  "/images/Hero/Home/4.png",
] as const;

export function migrateLegacyHomeHeroSlides(
  slides: readonly CmsPageHeroSlide[],
): readonly CmsPageHeroSlide[] {
  if (
    slides.length === legacyHomeHeroImageUrls.size &&
    slides.every((slide) => legacyHomeHeroImageUrls.has(slide.imageUrl))
  ) {
    return defaultHomeHeroSlides.map((slide) => ({ ...slide }));
  }

  if (
    slides.length === previousHomeHeroImageUrls.length &&
    slides.every(
      (slide, index) => slide.imageUrl === previousHomeHeroImageUrls[index],
    )
  ) {
    return defaultHomeHeroSlides.map((slide) => ({ ...slide }));
  }

  return slides;
}
