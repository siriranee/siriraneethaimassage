import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "CMS | Siriranee Thai Massage",
    template: "%s | Siriranee CMS",
  },
  description: "Private content and booking management workspace.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function CmsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
