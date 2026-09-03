import { redirect } from "next/navigation";

import { requireCmsPageUser } from "@/server/cms/auth/guards";

export default async function CmsUsersPage() {
  await requireCmsPageUser("users:manage");
  redirect("/cms/admin");
}
