import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { CmsAdminUserEditor } from "@/components/cms/CmsAdminUserForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";
import { getCmsUserSummary } from "@/server/cms/read-service";

type PageProps = {
  readonly params: Promise<{ readonly userId: string }>;
};

export default async function CmsEditAdminUserPage({ params }: PageProps) {
  const actor = await requireCmsPageUser("users:manage");
  const { userId } = await params;
  const user = await getCmsUserSummary(userId);
  if (!user) notFound();

  return (
    <>
      <CmsPageHeader
        actions={
          <CmsPrimaryLink href="/cms/admin" secondary>
            <ArrowLeft aria-hidden="true" /> Back to users
          </CmsPrimaryLink>
        }
        description="Update access safely without displaying or storing plaintext credentials."
        eyebrow="Admin users"
        title={`Manage ${user.displayName}`}
      />
      <CmsAdminUserEditor
        current={user.id === actor.id}
        mockMode={getCmsMode() === "mock"}
        user={user}
      />
    </>
  );
}
