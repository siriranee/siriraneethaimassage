import type {
  Service,
  ServiceGalleryImage,
} from "@/domain/service";
import { MAX_SERVICE_GALLERY_IMAGES } from "@/domain/cms/service-gallery";

export type ServiceGallerySlide = ServiceGalleryImage;

export { MAX_SERVICE_GALLERY_IMAGES } from "@/domain/cms/service-gallery";

export function limitServiceGallerySlides(
  slides: readonly ServiceGallerySlide[],
): readonly ServiceGallerySlide[] {
  return slides.slice(0, MAX_SERVICE_GALLERY_IMAGES);
}

export function getServiceGalleryImages(
  service: Pick<Service, "name" | "image" | "gallery">,
): readonly ServiceGallerySlide[] {
  const primarySlide: ServiceGallerySlide = {
    ...service.image,
    caption: `An illustrative view of ${service.name.toLowerCase()}.`,
  };
  const preset = service.gallery;

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
