export type ServiceSlug = string;

export type ServicePrice = {
  readonly durationMinutes: number;
  readonly priceEur: number;
  readonly label: string;
};

export type ServiceImage = {
  readonly src: string;
  readonly alt: string;
};

export type ServiceGalleryImage = {
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
};

export type ServiceSeo = {
  readonly title: string;
  readonly description: string;
};

export type Service = {
  readonly slug: ServiceSlug;
  readonly name: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly image: ServiceImage;
  readonly gallery?: readonly ServiceGalleryImage[];
  readonly durations: readonly string[];
  readonly pricing: readonly ServicePrice[];
  readonly priceNote?: string;
  readonly idealFor: readonly string[];
  readonly highlights: readonly string[];
  readonly bookingUrl: string;
  readonly seo: ServiceSeo;
};
