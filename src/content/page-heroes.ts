export type PageHeroImage = Readonly<{
  image: string;
  imageAlt: string;
  focalX: number;
  focalY: number;
  mobileFocalX: number;
  mobileFocalY: number;
}>;

export const pageHeroImages = {
  about: {
    image: "/images/Hero/About/About hero image.png",
    imageAlt: "Massage stones, an orchid and candlelight beside calm water",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  book: {
    image: "/images/Hero/Book/Book hero image.png",
    imageAlt: "Massage stones, flowers and candles in a peaceful spa setting",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  contact: {
    image: "/images/Hero/Contact/Contact hero image.png",
    imageAlt: "Floating candles and citrus slices in a tranquil spa arrangement",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  gallery: {
    image: "/images/Hero/Gallery/Gallery hero image.png",
    imageAlt: "A relaxing massage treatment in warm ambient light",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  services: {
    image: "/images/Hero/Services/services-hero-image.png",
    imageAlt: "Massage oils, towels, flowers and candles prepared for treatment",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
} as const satisfies Readonly<Record<string, PageHeroImage>>;

const serviceHeroImages = {
  "traditional-thai-massage": {
    image:
      "/images/Hero/Services/Traditional Thai Massage/Traditional Thai Massage hero image.png",
    imageAlt: "Traditional Thai massage treatment in a warm candlelit room",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  "hot-oil-massage": {
    image:
      "/images/Hero/Services/Hot Oil Massage/Hot Oil Massage hero image.png",
    imageAlt: "Warm oil being applied during a relaxing massage treatment",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  "neck-shoulder-upper-back-massage": {
    image:
      "/images/Hero/Services/Neck, Shoulder & Upper Back Massage/Neck, Shoulder & Upper Back Massage hero image.png",
    imageAlt: "Focused neck and shoulder massage in a calm treatment room",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  "deep-tissue-massage": {
    image:
      "/images/Hero/Services/Deep Tissue Massage/Deep Tissue Massage hero image.png",
    imageAlt: "Deep tissue back massage with warm spa lighting",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
  "hot-stone-massage": {
    image:
      "/images/Hero/Services/Hot Stone Massage/Hot Stone Massage hero image.png",
    imageAlt: "Hot stone massage treatment surrounded by soft candlelight",
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
  },
} as const satisfies Readonly<Record<string, PageHeroImage>>;

export function getServicePageHero(slug: string): PageHeroImage {
  return (
    serviceHeroImages[slug as keyof typeof serviceHeroImages] ??
    pageHeroImages.services
  );
}

export const allNamedPageHeroImages = [
  ...Object.values(pageHeroImages),
  ...Object.values(serviceHeroImages),
] as const;
