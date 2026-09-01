import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { defaultMetadata } from "@/lib/metadata";

import "./globals.css";

export const metadata: Metadata = {
  ...defaultMetadata,
};

export const viewport: Viewport = {
  themeColor: "#4a2246",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-IE">
      <body>{children}</body>
    </html>
  );
}
