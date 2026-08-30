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
        description="Create a profile draft while keeping public presentation separate from internal scheduling."
        eyebrow="Team editor"
        title="Add team profile"
      />
      <CmsNotice title="Customers never select a therapist">
        A profile may be public, internally available, both or neither. New profiles
        are hidden and operationally inactive until those choices are deliberately enabled.
      </CmsNotice>
      <TeamEditorForm isNew member={blankMember} />
    </>
  );
}
