import { TeamEditorForm } from "@/components/cms/TeamEditorForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import type { CmsTeamEditorRecord } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

const blankTherapist: CmsTeamEditorRecord = {
  id: "new",
  slug: "",
  name: "",
  fullName: "",
  publicRole: "Massage therapist",
  shortBio: "",
  biography: "",
  imageUrl: "",
  imageAlt: "",
  specialties: [],
  languages: [],
  serviceIds: [],
  publicProfile: true,
  operationalActive: true,
  archived: false,
  sortOrder: 0,
  notificationEmail: "",
  contactPhone: "",
  version: 0,
  contactVersion: 0,
  updatedAt: "",
};

export default async function CmsNewTeamMemberPage() {
  await requireCmsPageUser("content:write");
  const [content, cloudinaryOwnership] = await Promise.all([
    getCmsContent(),
    Promise.resolve(getCloudinaryMediaOwnershipConfig()),
  ]);
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
        description="Create customer-facing booking details, treatment eligibility and private notification settings."
        eyebrow="Therapist editor"
        title="Add therapist"
      />
      <CmsNotice title="Private contact stays private">
        The notification email and optional phone number are available only
        inside the protected CMS. They are never sent to the public therapist
        profile.
      </CmsNotice>
      <TeamEditorForm
        cloudinaryOwnership={cloudinaryOwnership}
        isNew
        member={blankTherapist}
        services={services}
      />
    </>
  );
}
