import { notFound } from "next/navigation";

import { TeamEditorForm } from "@/components/cms/TeamEditorForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import {
  getCmsContent,
  getCmsTeamEditorRecord,
} from "@/server/cms/content-service";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

type PageProps = {
  readonly params: Promise<{ readonly memberId: string }>;
};

export default async function CmsTeamMemberEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { memberId } = await params;
  const [member, content, cloudinaryOwnership] = await Promise.all([
    getCmsTeamEditorRecord(memberId),
    getCmsContent(),
    Promise.resolve(getCloudinaryMediaOwnershipConfig()),
  ]);
  if (!member) notFound();

  const services = [...content.services]
    .sort((first, second) => first.name.localeCompare(second.name, "en-IE"))
    .map(({ id, name }) => ({ id, name }));
  return (
    <>
      <CmsPageHeader
        actions={
          <CmsPrimaryLink href="/cms/team" secondary>
            Back to therapists
          </CmsPrimaryLink>
        }
        description="Update this therapist’s customer-facing details, eligible treatments and private notification settings."
        eyebrow="Therapist editor"
        title={member.name}
      />
      <TeamEditorForm
        cloudinaryOwnership={cloudinaryOwnership}
        member={member}
        services={services}
      />
    </>
  );
}
