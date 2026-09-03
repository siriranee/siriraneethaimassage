import { redirect } from "next/navigation";

import { requireCmsPageUser } from "@/server/cms/auth/guards";

export default async function CmsServiceAliasPage() {
  await requireCmsPageUser("content:view");
  redirect("/cms/services");
}
