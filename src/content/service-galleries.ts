import type {
  Service,
  ServiceGalleryImage,
} from "@/content/services";
import {
  DEFAULT_SERVICE_GALLERY_FOCAL_POSITION,
  MAX_SERVICE_GALLERY_IMAGES,
} from "@/domain/cms/service-gallery";

export type ServiceGallerySlide = ServiceGalleryImage;

export { MAX_SERVICE_GALLERY_IMAGES } from "@/domain/cms/service-gallery";

export function limitServiceGallerySlides(
  slides: readonly ServiceGallerySlide[],
): readonly ServiceGallerySlide[] {
  return slides.slice(0, MAX_SERVICE_GALLERY_IMAGES);
}

function withCenteredFocus(
  slides: readonly Omit<ServiceGallerySlide, "focalX" | "focalY">[],
): readonly ServiceGallerySlide[] {
  return slides.map((slide) => ({
    ...slide,
    focalX: DEFAULT_SERVICE_GALLERY_FOCAL_POSITION,
    focalY: DEFAULT_SERVICE_GALLERY_FOCAL_POSITION,
  }));
}

const serviceGallerySlides: Readonly<
  Record<string, readonly ServiceGallerySlide[]>
> = {
  "traditional-thai-massage": withCenteredFocus([
    {
      src: "/images/services/traditional-thai-massage/gallery-01.webp",
      alt: "Thai massage therapist guiding a fully clothed client through an assisted upper-body stretch in a warm treatment room",
      caption: "Assisted stretches and rhythmic pressure, adjusted to your comfort.",
    },
    {
      src: "/images/services/traditional-thai-massage/gallery-02.webp",
      alt: "Therapist applying rhythmic palm pressure over a clothed back during traditional Thai massage",
      caption: "Traditional palm pressure in a calm, unhurried setting.",
    },
    {
      src: "/images/services/traditional-thai-massage/gallery-03.webp",
      alt: "Prepared Thai massage floor mat with cushions, cream linens and an orchid",
      caption: "A peaceful room prepared for traditional Thai massage.",
    },
  ]),
  "hot-oil-massage": withCenteredFocus([
    {
      src: "/images/services/hot-oil-massage/gallery-01.webp",
      alt: "Warm massage oil, orchids and folded towels in a peaceful spa setting",
      caption: "Warm oil and carefully prepared spa details.",
    },
    {
      src: "/images/services/hot-oil-massage/gallery-02.webp",
      alt: "Therapist applying warm oil to the upper back of a modestly draped client",
      caption: "Smooth, flowing care shaped around your preferred pressure.",
    },
    {
      src: "/images/services/hot-oil-massage/gallery-03.webp",
      alt: "Prepared hot oil massage room with an amber bottle, warm towels and plum accents",
      caption: "A warm, restful setting for an unhurried treatment.",
    },
  ]),
  "neck-shoulder-upper-back-massage": withCenteredFocus([
    {
      src: "/images/services/neck-shoulder-upper-back-massage/gallery-01.webp",
      alt: "Therapist providing a focused seated neck and shoulder massage in a softly lit spa room",
      caption: "Focused attention for the neck, shoulders and upper back.",
    },
    {
      src: "/images/services/neck-shoulder-upper-back-massage/gallery-02.webp",
      alt: "Close view of natural hands applying controlled pressure to the shoulder and upper back",
      caption: "Controlled pressure for the upper-body areas you choose.",
    },
    {
      src: "/images/services/neck-shoulder-upper-back-massage/gallery-03.webp",
      alt: "Rolled cream towels, a warm neck wrap and an orchid prepared for treatment",
      caption: "A calm setting prepared for a focused 30-minute treatment.",
    },
  ]),
  "deep-tissue-massage": withCenteredFocus([
    {
      src: "/images/services/deep-tissue-massage/gallery-01.webp",
      alt: "Therapist applying controlled forearm pressure to the fully draped back of a client",
      caption: "Firm, controlled pressure adjusted through conversation.",
    },
    {
      src: "/images/services/deep-tissue-massage/gallery-02.webp",
      alt: "Close view of a therapist's hand applying focused pressure around the shoulder blade",
      caption: "Slower, focused techniques for the areas you choose.",
    },
    {
      src: "/images/services/deep-tissue-massage/gallery-03.webp",
      alt: "Prepared deep tissue massage room with cream towels and warm plum accents",
      caption: "A grounded setting for deeper, considered pressure.",
    },
  ]),
  "hot-stone-massage": withCenteredFocus([
    {
      src: "/images/services/hot-stone-massage/gallery-01.webp",
      alt: "Smooth black basalt stones aligned on the fully draped back of a client",
      caption: "Smooth basalt stones arranged for carefully managed warmth.",
    },
    {
      src: "/images/services/hot-stone-massage/gallery-02.webp",
      alt: "Basalt massage stones warming beside a ceramic bowl, orchid, candle and towels",
      caption: "Warm stones, soft light and thoughtful preparation.",
    },
    {
      src: "/images/services/hot-stone-massage/gallery-03.webp",
      alt: "Therapist placing a warm basalt stone on the securely draped upper back of a client",
      caption: "Heat and hands-on care combined in one unhurried treatment.",
    },
  ]),
};

export function getServiceGalleryImages(
  service: Pick<Service, "slug" | "name" | "image" | "gallery">,
): readonly ServiceGallerySlide[] {
  const primarySlide: ServiceGallerySlide = {
    ...service.image,
    caption: `An illustrative view of ${service.name.toLowerCase()}.`,
    focalX: DEFAULT_SERVICE_GALLERY_FOCAL_POSITION,
    focalY: DEFAULT_SERVICE_GALLERY_FOCAL_POSITION,
  };
  const preset =
    service.gallery === undefined
      ? serviceGallerySlides[service.slug]
      : service.gallery;

  if (!preset?.length) {
    return limitServiceGallerySlides([primarySlide]);
  }

  const uniqueSlides = new Map<string, ServiceGallerySlide>();
  preset.forEach((slide) => {
    if (!uniqueSlides.has(slide.src)) {
      uniqueSlides.set(slide.src, slide);
    }
  });

  return limitServiceGallerySlides([...uniqueSlides.values()]);
}
