import type { ReactNode } from "react";

import { ContactFab } from "@/components/contact/ContactFab";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getPublicSiteData } from "@/server/cms/public-adapter";

export async function PublicShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const site = await getPublicSiteData();

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader site={site} />
      <main id="main-content">{children}</main>
      <SiteFooter site={site} />
      <ContactFab site={site} />
    </>
  );
}
