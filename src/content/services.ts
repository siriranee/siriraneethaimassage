export const serviceCategories = [
  {
    id: "thai-massage",
    label: "Thai & Deep Tissue",
    description: "Traditional Thai and focused, firmer-pressure treatments.",
  },
  {
    id: "oil-and-stone",
    label: "Oil & Stone",
    description: "Warm oil and hot-stone treatments for an unhurried spa visit.",
  },
  {
    id: "focused-massage",
    label: "Focused Massage",
    description: "A shorter treatment centred on the neck, shoulders and upper back.",
  },
] as const;

export type ServiceCategoryId = (typeof serviceCategories)[number]["id"];

export const serviceSlugs = [
  "traditional-thai-massage",
  "hot-oil-massage",
  "neck-shoulder-upper-back-massage",
  "deep-tissue-massage",
  "hot-stone-massage",
] as const;

// Seed slugs remain useful for validation and fallbacks, while CMS-created
// treatments use the same safe string contract at runtime.
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

export type ServiceSeo = {
  readonly title: string;
  readonly description: string;
};

export type Service = {
  readonly slug: ServiceSlug;
  readonly name: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly category: ServiceCategoryId;
  readonly image: ServiceImage;
  readonly durations: readonly string[];
  readonly pricing: readonly ServicePrice[];
  readonly priceNote?: string;
  readonly bookingNotice?: string;
  readonly idealFor: readonly string[];
  readonly highlights: readonly string[];
  readonly bookingUrl: string;
  readonly seo: ServiceSeo;
};

const bookingSetupNotice =
  "Online booking is coming soon.";

export const services: readonly Service[] = [
  {
    slug: "traditional-thai-massage",
    name: "Traditional Thai Massage",
    shortDescription:
      "Rhythmic pressure and assisted movement in an oil-free treatment, always adjusted to your comfort.",
    longDescription:
      "Traditional Thai massage combines measured pressure with guided movement and stretches. Your therapist will ask about your preferences before the treatment and adapt the pace and pressure throughout your visit.",
    category: "thai-massage",
    image: {
      src: "/images/spa/traditional-thai-massage.webp",
      alt: "Illustrative traditional Thai massage treatment in a warm spa room",
    },
    durations: ["60 minutes", "90 minutes"],
    pricing: [
      { durationMinutes: 60, priceEur: 65, label: "60 minutes — €65" },
      { durationMinutes: 90, priceEur: 95, label: "90 minutes — €95" },
    ],
    bookingNotice: bookingSetupNotice,
    idealFor: [
      "Guests who prefer an oil-free massage",
      "Those who enjoy a more active treatment style",
    ],
    highlights: [
      "Traditional assisted movement",
      "Pressure and pace tailored to you",
      "60- and 90-minute appointments",
    ],
    bookingUrl: "/book?service=traditional-thai-massage&duration=60",
    seo: {
      title: "Traditional Thai Massage in Howth, Dublin",
      description:
        "Explore traditional Thai massage at Siriranee Thai Massage in Howth, Dublin, with 60- and 90-minute appointments.",
    },
  },
  {
    slug: "hot-oil-massage",
    name: "Hot Oil Massage",
    shortDescription:
      "A flowing massage using warmed oil for a calm, comfort-led treatment.",
    longDescription:
      "Hot oil massage combines comfortably warmed oil with smooth, flowing massage techniques. Tell your therapist about your preferred pressure and any product sensitivities before the session so the treatment can be adapted for you.",
    category: "oil-and-stone",
    image: {
      src: "/images/spa/aromatherapy-oil.webp",
      alt: "Illustrative warm massage oil prepared beside folded spa towels",
    },
    durations: ["60 minutes", "90 minutes"],
    pricing: [
      { durationMinutes: 60, priceEur: 65, label: "60 minutes — €65" },
      { durationMinutes: 90, priceEur: 95, label: "90 minutes — €95" },
    ],
    bookingNotice: bookingSetupNotice,
    idealFor: [
      "Guests who enjoy smooth, flowing massage",
      "A warm and unhurried treatment",
    ],
    highlights: [
      "Comfortably warmed massage oil",
      "Pressure tailored to your preference",
      "60- and 90-minute appointments",
    ],
    bookingUrl: "/book?service=hot-oil-massage&duration=60",
    seo: {
      title: "Hot Oil Massage in Howth, Dublin",
      description:
        "Explore hot oil massage at Siriranee Thai Massage in Howth, Dublin, with 60- and 90-minute appointments.",
    },
  },
  {
    slug: "neck-shoulder-upper-back-massage",
    name: "Neck, Shoulder & Upper Back Massage",
    shortDescription:
      "A focused 30-minute massage centred on the upper-body areas you choose.",
    longDescription:
      "Choose this focused massage when you would like your appointment centred on the neck, shoulders and upper back. Your therapist will ask about your comfort and preferred pressure before beginning.",
    category: "focused-massage",
    image: {
      src: "/images/spa/hero-massage.webp",
      alt: "Illustrative focused upper-back massage in a calm treatment room",
    },
    durations: ["30 minutes"],
    pricing: [
      { durationMinutes: 30, priceEur: 40, label: "30 minutes — €40" },
    ],
    bookingNotice: bookingSetupNotice,
    idealFor: [
      "A shorter, area-focused appointment",
      "Guests who want to prioritise the upper body",
    ],
    highlights: [
      "Neck, shoulders and upper back prioritised",
      "Pressure tailored to you",
      "Convenient 30-minute appointment",
    ],
    bookingUrl:
      "/book?service=neck-shoulder-upper-back-massage&duration=30",
    seo: {
      title: "Neck & Shoulder Massage in Howth, Dublin",
      description:
        "Explore a 30-minute neck, shoulder and upper back massage for €40 at Siriranee Thai Massage in Howth, Dublin.",
    },
  },
  {
    slug: "deep-tissue-massage",
    name: "Deep Tissue Massage",
    shortDescription:
      "A slower, firmer massage shaped around your preferred pressure and focus areas.",
    longDescription:
      "Deep tissue massage uses slower, more focused techniques and firmer pressure than a flowing relaxation massage. Your therapist will discuss the areas you would like prioritised and keep the treatment within your comfort.",
    category: "thai-massage",
    image: {
      src: "/images/spa/deep-tissue-massage.webp",
      alt: "Illustrative deep tissue massage in a warm aubergine treatment room",
    },
    durations: ["60 minutes", "90 minutes"],
    pricing: [
      { durationMinutes: 60, priceEur: 65, label: "60 minutes — €65" },
      { durationMinutes: 90, priceEur: 95, label: "90 minutes — €95" },
    ],
    bookingNotice: bookingSetupNotice,
    idealFor: [
      "Guests who prefer focused, firmer pressure",
      "Appointments centred on selected areas",
    ],
    highlights: [
      "Pressure discussed before treatment",
      "Focus areas chosen with your therapist",
      "60- and 90-minute appointments",
    ],
    bookingUrl: "/book?service=deep-tissue-massage&duration=60",
    seo: {
      title: "Deep Tissue Massage in Howth, Dublin",
      description:
        "Explore deep tissue massage at Siriranee Thai Massage in Howth, Dublin, with 60- and 90-minute appointments.",
    },
  },
  {
    slug: "hot-stone-massage",
    name: "Hot Stone Massage",
    shortDescription:
      "A 90-minute massage combining carefully managed warmth with hands-on treatment.",
    longDescription:
      "Hot stone massage uses carefully warmed stones alongside hands-on massage. Your therapist will check that the temperature and pressure remain comfortable throughout your 90-minute appointment.",
    category: "oil-and-stone",
    image: {
      src: "/images/spa/spa-still-life.webp",
      alt: "Illustrative smooth massage stones and spa details in warm light",
    },
    durations: ["90 minutes"],
    pricing: [
      { durationMinutes: 90, priceEur: 95, label: "90 minutes — €95" },
    ],
    bookingNotice: bookingSetupNotice,
    idealFor: [
      "Guests who enjoy gentle warmth during massage",
      "An extended, unhurried spa treatment",
    ],
    highlights: [
      "Carefully warmed stones",
      "Temperature checked for comfort",
      "90-minute appointment",
    ],
    bookingUrl: "/book?service=hot-stone-massage&duration=90",
    seo: {
      title: "Hot Stone Massage in Howth, Dublin",
      description:
        "Explore a 90-minute hot stone massage for €95 at Siriranee Thai Massage in Howth, Dublin.",
    },
  },
];

export function getServiceBySlug(slug: string): Service | undefined {
  return services.find((service) => service.slug === slug);
}

export function getServicesByCategory(
  category: ServiceCategoryId,
): readonly Service[] {
  return services.filter((service) => service.category === category);
}
