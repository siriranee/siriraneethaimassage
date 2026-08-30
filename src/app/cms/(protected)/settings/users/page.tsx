import { ShieldCheck, UserRound } from "lucide-react";

import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { getCmsRoleLabel } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsUsers } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsUsersPage() {
  await requireCmsPageUser("users:manage");
  const users = await listCmsUsers();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>}
        description="Review administrator and staff access. This directory is intentionally read-only."
        eyebrow="Security"
        title="CMS users"
      />
      <CmsNotice title="Read-only account directory">
        Passwords are never displayed or stored in plaintext. The first
        production administrator uses the one-time provisioning command;
        further account, password and session controls require explicit
        authorization before they are implemented.
      </CmsNotice>
      <CmsPanel title={`Accounts · ${users.length}`} description="The local mock administrator is fictional.">
        <ul className={styles.activityList}>
          {users.map((user) => (
            <li key={user.id}>
              {user.role === "administrator" ? <ShieldCheck aria-hidden="true" /> : <UserRound aria-hidden="true" />}
              <div>
                <strong>{user.displayName} <CmsStatusBadge label={user.active ? "Active" : "Disabled"} tone={user.active ? "success" : "danger"} /></strong>
                <span>{user.email} · {getCmsRoleLabel(user.role)} · session version {user.authVersion}</span>
              </div>
            </li>
          ))}
        </ul>
      </CmsPanel>
    </>
  );
}
