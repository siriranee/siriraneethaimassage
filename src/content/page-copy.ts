import { defaultHomeHeroSlides } from "@/content/home-hero";

export const pageIds = [
  "home",
  "services",
  "book",
  "about",
  "contact",
  "visit",
  "privacy",
  "promotions",
  "gallery",
] as const;

export type PageId = (typeof pageIds)[number];

const pageCopy = {
  home: {
    eyebrow: "Welcome to Siriranee",
    title: "Thai Massage in Howth, Dublin",
    description: "Ease tension, restore balance and leave feeling renewed.",
    seoTitle: "Thai Massage in Howth, Dublin | Siriranee",
    seoDescription:
      "Explore Thai massage, hot oil, deep tissue, back and neck massage, head spa and foot reflexology treatments at Siriranee in Howth, Dublin.",
    heroSlides: defaultHomeHeroSlides,
  },
  services: {
    eyebrow: "Treatments & prices",
    title: "Massage in Howth, Dublin",
    description: "Clear options for every schedule and preference.",
    seoTitle: "Massage Treatments in Howth, Dublin",
    seoDescription:
      "Explore Thai massage, hot oil, deep tissue, hot stone, back and neck massage, head spa and foot reflexology treatments in Howth, Dublin.",
  },
  book: {
    eyebrow: "Massage appointments in Howth",
    title: "Book Your Massage",
    description: "Choose a treatment, date and time.",
    seoTitle: "Book a Massage in Howth, Dublin",
    seoDescription:
      "Book a massage at Siriranee Thai Massage in Howth, Dublin. Choose a treatment, duration and preferred date and time, then send your appointment request.",
  },
  about: {
    eyebrow: "Our approach",
    title: "Thai Massage with Thoughtful Care",
    description: "A calm, welcoming treatment space in Howth, Dublin.",
    seoTitle: "About Siriranee Thai Massage | Howth, Dublin",
    seoDescription:
      "Learn about Siriranee Thai Massage, a calm destination for Thai massage and spa treatments in Howth, Dublin.",
  },
  contact: {
    eyebrow: "Find or message us",
    title: "Contact Siriranee in Howth",
    description:
      "Find us at Harbour House or view the currently available contact options.",
    seoTitle: "Contact Siriranee Thai Massage | Howth, Dublin",
    seoDescription:
      "Find Siriranee Thai Massage at Harbour House in Howth, Dublin. View the confirmed address, Google Maps directions and current contact options.",
  },
  visit: {
    eyebrow: "Plan your journey",
    title: "Find Us in Howth",
    description: "View our confirmed address, directions and arrival guidance.",
    seoTitle: "Visit Siriranee Thai Massage in Howth, Dublin",
    seoDescription:
      "Find Siriranee Thai Massage on Floor 3 of Harbour House, Harbour Road, Howth, with Google Maps directions and nearby Dublin areas served.",
  },
  privacy: {
    eyebrow: "Your information",
    title: "Privacy Notice",
    description:
      "How we use and protect information from website visits and appointment requests.",
    seoTitle: "Privacy Notice",
    seoDescription:
      "How Siriranee Thai Massage handles website visits, appointment requests and external services.",
  },
  promotions: {
    eyebrow: "Treat someone",
    title: "Massage Gifts & Offers",
    description: "Explore Siriranee gift vouchers and any current offers.",
    seoTitle: "Massage Gift Ideas & Offers in Howth, Dublin",
    seoDescription:
      "Arrange a Siriranee massage or spa gift voucher and explore current offers in Howth, Dublin.",
  },
  gallery: {
    eyebrow: "Gallery",
    title: "A Look Inside Siriranee",
    description:
      "A visual preview of our treatments and calm Howth setting.",
    seoTitle: "Siriranee Thai Massage Gallery | Howth, Dublin",
    seoDescription:
      "Preview the calm visual direction for Siriranee Thai Massage in Howth, Dublin, with illustrative treatment and spa imagery.",
  },
} as const satisfies Readonly<
  Record<
    PageId,
    {
      readonly eyebrow: string;
      readonly title: string;
      readonly description: string;
      readonly seoTitle: string;
      readonly seoDescription: string;
      readonly heroSlides?: typeof defaultHomeHeroSlides;
    }
  >
>;

export function getPageCopy<Page extends PageId>(pageId: Page) {
  return pageCopy[pageId];
}
