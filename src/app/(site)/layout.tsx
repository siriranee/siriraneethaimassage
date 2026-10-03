import type { ReactNode } from "react";

import { AnalyticsConsent } from "@/components/analytics/AnalyticsConsent";
import { PublicShell } from "@/components/layout/PublicShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <PublicShell>{children}</PublicShell>
      <AnalyticsConsent />
    </>
  );
}
