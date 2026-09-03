import { ArrowLeft } from "lucide-react";

import { CmsAdminUserCreateForm } from "@/components/cms/CmsAdminUserForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";

export default async function CmsNewAdminUserPage() {
  await requireCmsPageUser("users:manage");

  return (
    <>
      <CmsPageHeader
        actions={
          <CmsPrimaryLink href="/cms/admin" secondary>
            <ArrowLeft aria-hidden="true" /> Back to users
          </CmsPrimaryLink>
        }
        description="Create a named account with the minimum access needed for its owner."
        eyebrow="Admin users"
        title="Add CMS account"
      />
      <CmsAdminUserCreateForm mockMode={getCmsMode() === "mock"} />
    </>
  );
}
