import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CmsShell } from "@/components/cms/CmsShell";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";
import { listCmsNotificationBellItems } from "@/server/cms/read-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedCmsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const mode = getCmsMode();
  if (mode === "disabled") redirect("/cms/login");

  const user = await requireCmsPageUser("dashboard:view");
  const notifications = canCmsRole(user.role, "bookings:view")
    ? await listCmsNotificationBellItems()
    : [];

  return (
    <CmsShell
      mode={mode}
      notifications={notifications}
      user={{
        displayName: user.displayName,
        username: user.username,
        role: user.role,
      }}
    >
      {children}
    </CmsShell>
  );
}
