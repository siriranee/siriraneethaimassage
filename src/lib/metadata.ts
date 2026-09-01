import type { Metadata } from "next";

import { siteConfig } from "@/content/site";
import { isConfiguredCloudinaryImageUrl } from "@/lib/media/cloudinary-delivery";

export type CreateMetadataInput = {
  readonly title: string;
  readonly description: string;
  readonly path?: string;
  readonly noIndex?: boolean;
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
};

export function absoluteUrl(path = "/"): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`Canonical paths must start with a single slash: ${path}`);
  }

  const url = new URL(path, `${siteConfig.canonicalUrl}/`);
  url.hash = "";
  return url.toString();
}

export function absoluteMediaUrl(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return absoluteUrl(value);
  }

  if (isConfiguredCloudinaryImageUrl(value)) {
    return new URL(value).toString();
  }

  throw new Error(`Media URLs must be local or use the configured Cloudinary account: ${value}`);
}

export function formatMetadataTitle(title: string): string {
  return title.toLocaleLowerCase("en-IE").includes("siriranee")
    ? title
    : `${title} | Siriranee`;
}

export function createMetadata({
  title,
  description,
  path = "/",
  noIndex = false,
  image,
}: CreateMetadataInput): Metadata {
  const formattedTitle = formatMetadataTitle(title);
  const canonical = absoluteUrl(path);
  const socialImage = absoluteMediaUrl(image?.src ?? "/opengraph-image");
  const socialImageAlt =
    image?.alt ?? `${siteConfig.name} in Howth, Dublin`;

  return {
    metadataBase: new URL(siteConfig.canonicalUrl),
    title: formattedTitle,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: canonical,
      siteName: siteConfig.name,
      title: formattedTitle,
      description,
      images: [
        image
          ? {
              url: socialImage,
              alt: socialImageAlt,
            }
          : {
              url: socialImage,
              width: 1200,
              height: 630,
              alt: socialImageAlt,
            },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: formattedTitle,
      description,
      images: [socialImage],
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false,
            googleBot: { index: false, follow: false },
          },
        }
      : {}),
  };
}

export const defaultMetadata = createMetadata({
  title: siteConfig.seo.homeTitle,
  description: siteConfig.seo.homeDescription,
  path: "/",
});
