import { Pencil, Plus, UserRoundCog } from "lucide-react";
import Link from "next/link";

import { CmsNotice, CmsPageHeader, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsTeamPage() {
  await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  const team = [...content.team].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/team/new"><Plus aria-hidden="true" /> Add profile</CmsPrimaryLink>}
        description="Keep public biographies separate from scheduling. Operational status is internal and never becomes a customer therapist picker."
        eyebrow="People"
        title="Team"
      />

      <CmsNotice title="No therapist selection in customer booking">
        Team profiles can introduce the people at Siriranee. Appointment staff
        assignment stays optional and internal to the CMS.
      </CmsNotice>

      <div className={styles.serviceGrid}>
        {team.map((member) => (
          <article className={styles.serviceCard} key={member.id}>
            <div className={styles.serviceTop}>
              <span>{member.publicRole}</span>
              <CmsStatusBadge label={member.archived ? "Archived" : member.publicProfile ? "Public profile" : "Hidden"} tone={member.archived ? "neutral" : member.publicProfile ? "success" : "warning"} />
            </div>
            <span className={styles.cardIcon}><UserRoundCog aria-hidden="true" /></span>
            <h2>{member.fullName}</h2>
            <p>
              {member.operationalActive
                ? "Available for internal scheduling where confirmed."
                : "Operational availability is not yet confirmed."}
            </p>
            <dl>
              <div><dt>Website name</dt><dd>{member.name}</dd></div>
              <div><dt>Scheduling</dt><dd>{member.operationalActive ? "Active" : "Not confirmed"}</dd></div>
            </dl>
            <Link href={`/cms/team/${member.id}/edit`}><Pencil aria-hidden="true" /> Edit profile</Link>
          </article>
        ))}
      </div>
    </>
  );
}
