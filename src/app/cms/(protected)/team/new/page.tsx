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
  imageUrl: "",
  imageAlt: "",
  serviceIds: [],
  publicProfile: true,
  operationalActive: true,
  archived: false,
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
      <CmsNotice title="Therapist contact details">
        The contact phone appears with the therapist&apos;s name in website contact
        areas when available for booking and shown online. The notification email
        is private and used only for booking notifications.
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
