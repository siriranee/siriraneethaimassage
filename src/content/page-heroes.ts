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

export const allNamedPageHeroImages = Object.values(pageHeroImages);
