export const publicNavigation = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Treatments" },
  { href: "/therapists", label: "Our Team" },
  { href: "/promotions", label: "Promotions" },
  { href: "/about", label: "About" },
  { href: "/gallery", label: "Gallery" },
  { href: "/visit", label: "Visit" },
  { href: "/contact", label: "Contact" },
] as const;

const headerHiddenRoutes = new Set(["/therapists", "/promotions", "/visit"]);

export const headerNavigation = publicNavigation.filter(
  (item) => !headerHiddenRoutes.has(item.href),
);

export const treatmentNavigation = [
  {
    href: "/services/traditional-thai-massage",
    label: "Traditional Thai Massage",
  },
  {
    href: "/services/hot-oil-massage",
    label: "Hot Oil Massage",
  },
  {
    href: "/services/neck-shoulder-upper-back-massage",
    label: "Neck, Shoulder & Upper Back Massage",
  },
  {
    href: "/services/deep-tissue-massage",
    label: "Deep Tissue Massage",
  },
  {
    href: "/services/hot-stone-massage",
    label: "Hot Stone Massage",
  },
] as const;
