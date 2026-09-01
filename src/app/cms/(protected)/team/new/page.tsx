import { TeamEditorForm } from "@/components/cms/TeamEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsTeamRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

const blankMember: CmsTeamRecord = {
  id: "new",
  name: "",
  fullName: "",
  publicRole: "Massage therapist",
  publicProfile: false,
  operationalActive: false,
  sortOrder: 50,
  version: 0,
  updatedAt: "",
};

export default async function CmsNewTeamPage() {
  await requireCmsPageUser("content:write");

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/team" secondary>Back to team</CmsPrimaryLink>}
        description="Create an informational profile for the public team page."
        eyebrow="Team editor"
        title="Add team profile"
      />
      <CmsNotice title="Customers never select a therapist">
        Team profiles are website content only. New profiles stay hidden until
        they are reviewed and deliberately enabled for public display.
      </CmsNotice>
      <TeamEditorForm isNew member={blankMember} />
    </>
  );
}
