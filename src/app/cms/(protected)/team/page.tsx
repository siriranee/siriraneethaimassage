import {
  ImageOff,
  MailCheck,
  MailWarning,
  Pencil,
  Plus,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  CmsPageHeader,
  CmsPrimaryLink,
  CmsStatusBadge,
} from "@/components/cms/CmsUi";
import { compareCmsTeamMembersByName } from "@/domain/cms/team";
import { isApprovedImageUrlForOwnership } from "@/lib/media/cloudinary-delivery";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsTeamEditorRecords } from "@/server/cms/content-service";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

import styles from "./page.module.css";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default async function CmsTeamPage() {
  await requireCmsPageUser("content:write");
  const [team, cloudinaryOwnership] = await Promise.all([
    listCmsTeamEditorRecords(),
    Promise.resolve(getCloudinaryMediaOwnershipConfig()),
  ]);
  const members = [...team].sort(compareCmsTeamMembersByName);

  const headerActions = (
    <div className={styles.headerActions}>
      <CmsPrimaryLink href="/cms/team/new">
        <Plus aria-hidden="true" /> Add therapist
      </CmsPrimaryLink>
    </div>
  );

  return (
    <>
      <CmsPageHeader
        actions={headerActions}
        description="Manage therapist records, online booking visibility, treatment eligibility and private contact details."
        eyebrow="People & availability"
        title="Therapists"
      />

      {members.length ? (
        <div className={styles.teamGrid}>
          {members.map((member) => {
            const canPreviewImage = isApprovedImageUrlForOwnership(
              member.imageUrl,
              cloudinaryOwnership,
            );
            const publicProfile = member.publicProfile && !member.archived;
            const bookable = member.operationalActive && !member.archived;
            const hasEmail = Boolean(member.notificationEmail.trim());

            return (
              <article className={styles.memberCard} key={member.id}>
                <div className={styles.portraitFrame}>
                  {canPreviewImage ? (
                    <Image
                      alt={member.imageAlt || `Portrait of ${member.name}`}
                      className={styles.portrait}
                      fill
                      sizes="(max-width: 720px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      src={member.imageUrl}
                    />
                  ) : (
                    <div className={styles.portraitFallback}>
                      <span aria-hidden="true">{getInitials(member.name)}</span>
                      <small>
                        <ImageOff aria-hidden="true" /> Portrait not set
                      </small>
                    </div>
                  )}
                  <div className={styles.badges}>
                    {member.archived ? (
                      <CmsStatusBadge label="Archived" tone="danger" />
                    ) : (
                      <CmsStatusBadge
                        label={bookable ? "Bookable" : "Not bookable"}
                        tone={bookable ? "success" : "warning"}
                      />
                    )}
                    <CmsStatusBadge
                      label={publicProfile ? "Shown in booking" : "Hidden from booking"}
                      tone={publicProfile ? "purple" : "neutral"}
                    />
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.identity}>
                    <span>{member.publicRole || "Massage therapist"}</span>
                    <h2>{member.name}</h2>
                    <p>{member.shortBio || "Add a short public introduction."}</p>
                  </div>

                  <dl className={styles.facts}>
                    <div>
                      <dt>
                        <Sparkles aria-hidden="true" /> Treatments
                      </dt>
                      <dd>{member.serviceIds.length}</dd>
                    </div>
                    <div>
                      <dt>
                        {hasEmail ? (
                          <MailCheck aria-hidden="true" />
                        ) : (
                          <MailWarning aria-hidden="true" />
                        )}
                        Notifications
                      </dt>
                      <dd>{hasEmail ? "Ready" : "Email needed"}</dd>
                    </div>
                  </dl>

                  <div className={styles.cardActions}>
                    <Link
                      className={styles.editLink}
                      href={`/cms/team/${member.id}/edit`}
                    >
                      <Pencil aria-hidden="true" /> Edit therapist
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <UsersRound aria-hidden="true" />
          </span>
          <h2>No therapists have been added</h2>
          <p>
            Create the first therapist record, choose their treatments and add
            their private notification email.
          </p>
          <CmsPrimaryLink href="/cms/team/new">
            <Plus aria-hidden="true" /> Add first therapist
          </CmsPrimaryLink>
        </section>
      )}
    </>
  );
}
