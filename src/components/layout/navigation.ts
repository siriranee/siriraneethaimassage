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
