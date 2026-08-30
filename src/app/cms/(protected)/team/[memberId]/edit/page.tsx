import { notFound } from "next/navigation";

import { TeamEditorForm } from "@/components/cms/TeamEditorForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = {
  readonly params: Promise<{ readonly memberId: string }>;
};

export default async function CmsTeamEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { memberId } = await params;
  const content = await getCmsContent();
  const member = content.team.find((item) => item.id === memberId);
  if (!member) notFound();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/team" secondary>Back to team</CmsPrimaryLink>}
        description="Edit public identity and internal scheduling status as separate responsibilities."
        eyebrow="Team editor"
        title={member.fullName}
      />
      <TeamEditorForm member={member} />
    </>
  );
}
