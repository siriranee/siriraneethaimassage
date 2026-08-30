import type { Service } from "@/content/services";
import { siteConfig } from "@/content/site";
import type { PublicSiteData } from "@/domain/public-site";
import { absoluteUrl } from "@/lib/metadata";

type PostalAddressJsonLd = {
  readonly "@type": "PostalAddress";
  readonly streetAddress: string;
  readonly addressLocality: string;
  readonly addressRegion: string;
  readonly postalCode?: string;
  readonly addressCountry: string;
};

type PlaceJsonLd = {
  readonly "@type": "Place";
  readonly name: string;
};

type OpeningHoursJsonLd = {
  readonly "@type": "OpeningHoursSpecification";
  readonly dayOfWeek: string | readonly string[];
  readonly opens: string;
  readonly closes: string;
};

export type DaySpaJsonLd = {
  readonly "@context": "https://schema.org";
  readonly "@type": "DaySpa";
  readonly "@id": string;
  readonly name: string;
  readonly alternateName: string;
  readonly url: string;
  readonly description: string;
  readonly currenciesAccepted: "EUR";
  readonly image: string;
  readonly priceRange: string;
  readonly hasMap: string;
  readonly telephone: string;
  readonly email?: string;
  readonly address: PostalAddressJsonLd;
  readonly openingHoursSpecification?: readonly OpeningHoursJsonLd[];
  readonly areaServed: readonly PlaceJsonLd[];
  readonly sameAs?: readonly string[];
};

export type WebSiteJsonLd = {
  readonly "@context": "https://schema.org";
  readonly "@type": "WebSite";
  readonly "@id": string;
  readonly url: string;
  readonly name: string;
  readonly alternateName: string;
  readonly inLanguage: string;
  readonly publisher: { readonly "@id": string };
};

type OfferJsonLd = {
  readonly "@type": "Offer";
  readonly name: string;
  readonly price: string;
  readonly priceCurrency: "EUR";
  readonly url: string;
};

export type ServiceJsonLd = {
  readonly "@context": "https://schema.org";
  readonly "@type": "Service";
  readonly "@id": string;
  readonly name: string;
  readonly serviceType: string;
  readonly description: string;
  readonly url: string;
  readonly inLanguage: string;
  readonly provider: { readonly "@id": string };
  readonly areaServed: readonly PlaceJsonLd[];
  readonly offers?: readonly OfferJsonLd[];
};

export type BreadcrumbItem = {
  readonly name: string;
  readonly path: string;
};

export type BreadcrumbJsonLd = {
  readonly "@context": "https://schema.org";
  readonly "@type": "BreadcrumbList";
  readonly itemListElement: readonly {
    readonly "@type": "ListItem";
    readonly position: number;
    readonly name: string;
    readonly item: string;
  }[];
};

export type JsonLdSchema =
  | DaySpaJsonLd
  | WebSiteJsonLd
  | ServiceJsonLd
  | BreadcrumbJsonLd;

type StructuredSiteData = typeof siteConfig | PublicSiteData;

function businessId(site: StructuredSiteData) {
  return `${site.canonicalUrl}/#business`;
}

function siteDescription(site: StructuredSiteData) {
  return "defaultDescription" in site.seo
    ? site.seo.defaultDescription
    : site.seo.description;
}

export function buildDaySpaJsonLd(
  site: StructuredSiteData = siteConfig,
): DaySpaJsonLd {
  const booksyUrl =
    "booksy" in site.social
      ? site.social.booksy?.url
      : site.booking.booksyUrl;
  const reviewUrl =
    "reviews" in site ? site.reviews.googleUrl : site.booking.reviewUrl;
  const sameAs = [
    site.social.instagram?.url,
    booksyUrl,
    reviewUrl,
  ].filter((url): url is string => Boolean(url));

  return {
    "@context": "https://schema.org",
    "@type": "DaySpa",
    "@id": businessId(site),
    name: site.name,
    alternateName: site.alternateName,
    url: `${site.canonicalUrl}/`,
    description: siteDescription(site),
    currenciesAccepted: site.currency,
    image: absoluteUrl("/opengraph-image"),
    priceRange: "€40–€95",
    hasMap: site.address.directionsUrl,
    telephone: site.contact.phone.e164,
    ...(site.contact.email
      ? { email: site.contact.email.address }
      : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.streetAddress,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      ...(site.address.postalCode
        ? { postalCode: site.address.postalCode }
        : {}),
      addressCountry: site.address.countryCode,
    },
    ...(site.openingHoursConfirmed
      ? {
          openingHoursSpecification: site.openingHours
            .filter((entry) => !("open" in entry) || entry.open)
            .map((entry) => ({
              "@type": "OpeningHoursSpecification" as const,
              dayOfWeek: entry.day,
              opens: entry.opens,
              closes: entry.closes,
            })),
        }
      : {}),
    areaServed: site.serviceAreas.map((area) => ({
      "@type": "Place" as const,
      name: area,
    })),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function buildWebSiteJsonLd(
  site: StructuredSiteData = siteConfig,
): WebSiteJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.canonicalUrl}/#website`,
    url: `${site.canonicalUrl}/`,
    name: site.name,
    alternateName: site.shortName,
    inLanguage: site.language,
    publisher: { "@id": businessId(site) },
  };
}

export function buildServiceJsonLd(
  service: Service,
  site: StructuredSiteData = siteConfig,
): ServiceJsonLd {
  const url = absoluteUrl(`/services/${service.slug}`);
  const offers = service.pricing.map((price) => ({
    "@type": "Offer" as const,
    name: `${service.name} — ${price.durationMinutes} minutes`,
    price: price.priceEur.toFixed(2),
    priceCurrency: "EUR" as const,
    url,
  }));

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name: service.name,
    serviceType: service.name,
    description: service.shortDescription,
    url,
    inLanguage: site.language,
    provider: { "@id": businessId(site) },
    areaServed: site.serviceAreas.map((area) => ({
      "@type": "Place" as const,
      name: area,
    })),
    ...(offers.length > 0 ? { offers } : {}),
  };
}

export function buildBreadcrumbJsonLd(
  items: readonly BreadcrumbItem[],
): BreadcrumbJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function serializeJsonLd(
  data: JsonLdSchema | readonly JsonLdSchema[],
): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function jsonLdScriptProps(
  data: JsonLdSchema | readonly JsonLdSchema[],
) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: serializeJsonLd(data) },
  } as const;
}
