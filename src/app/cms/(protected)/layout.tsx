import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CmsShell } from "@/components/cms/CmsShell";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedCmsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const mode = getCmsMode();
  if (mode === "disabled") redirect("/cms/login");

  const user = await requireCmsPageUser("dashboard:view");

  return (
    <CmsShell
      mode={mode}
      user={{
        displayName: user.displayName,
        email: user.email,
        role: user.role,
      }}
    >
      {children}
    </CmsShell>
  );
}
