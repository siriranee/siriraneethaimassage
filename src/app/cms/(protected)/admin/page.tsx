import {
  Pencil,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  CmsNotice,
  CmsPageHeader,
  CmsPrimaryLink,
  CmsStatCard,
  CmsStatusBadge,
} from "@/components/cms/CmsUi";
import { getCmsRoleLabel } from "@/domain/cms/permissions";
import type { CmsUserSummary } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";
import { listCmsUsers } from "@/server/cms/read-service";

import styles from "./page.module.css";

const dublinDateTime = new Intl.DateTimeFormat("en-IE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Dublin",
});

function formatLastLogin(user: CmsUserSummary) {
  if (!user.lastLoginAt) return "Not signed in yet";
  const value = new Date(user.lastLoginAt);
  return Number.isNaN(value.getTime())
    ? "Last sign-in unavailable"
    : dublinDateTime.format(value);
}

export default async function CmsAdminPage() {
  const actor = await requireCmsPageUser("users:manage");
  const users = await listCmsUsers();
  const activeAdministrators = users.filter(
    (user) => user.active && user.role === "administrator",
  ).length;
  const activeStaff = users.filter(
    (user) => user.active && user.role === "staff",
  ).length;
  const disabled = users.filter((user) => !user.active).length;

  return (
    <>
      <CmsPageHeader
        actions={
          <CmsPrimaryLink href="/cms/admin/new">
            <Plus aria-hidden="true" /> Add account
          </CmsPrimaryLink>
        }
        description="Create accounts, control access, reset passwords and revoke signed-in sessions."
        eyebrow="Security"
        title="Admin users"
      />

      {getCmsMode() === "mock" ? (
        <CmsNotice title="Local mock accounts">
          Changes on this screen are fictional and reset when the local server
          restarts.
        </CmsNotice>
      ) : (
        <CmsNotice title="Protected account management">
          Passwords are hashed on the server and never shown here. Sensitive
          changes require your current administrator password and are recorded
          in the audit log.
        </CmsNotice>
      )}

      <div className={styles.stats}>
        <CmsStatCard
          detail="Full CMS and user access"
          icon={ShieldCheck}
          label="Active administrators"
          tone="purple"
          value={activeAdministrators}
        />
        <CmsStatCard
          detail="Bookings and calendar access"
          icon={Users}
          label="Active staff"
          tone="green"
          value={activeStaff}
        />
        <CmsStatCard
          detail="Cannot sign in"
          icon={UserRound}
          label="Disabled accounts"
          tone="gold"
          value={disabled}
        />
      </div>

      <section aria-labelledby="account-directory-title">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="account-directory-title">Account directory</h2>
            <p>{users.length} account{users.length === 1 ? "" : "s"}</p>
          </div>
          <span>Times shown in Dublin time</span>
        </header>

        <div className={styles.userGrid}>
          {users.map((user) => {
            const current = user.id === actor.id;
            return (
              <article className={styles.userCard} key={user.id}>
                <div className={styles.userCardTop}>
                  <span className={styles.userIcon}>
                    {user.role === "administrator" ? (
                      <ShieldCheck aria-hidden="true" />
                    ) : (
                      <UserRound aria-hidden="true" />
                    )}
                  </span>
                  <div className={styles.badges}>
                    {current ? <CmsStatusBadge label="You" tone="purple" /> : null}
                    <CmsStatusBadge
                      label={user.active ? "Active" : "Disabled"}
                      tone={user.active ? "success" : "danger"}
                    />
                  </div>
                </div>

                <div className={styles.identity}>
                  <h3>{user.displayName}</h3>
                  <p>@{user.username}</p>
                </div>

                <dl className={styles.details}>
                  <div>
                    <dt>Role</dt>
                    <dd>{getCmsRoleLabel(user.role)}</dd>
                  </div>
                  <div>
                    <dt>Last sign-in</dt>
                    <dd>{formatLastLogin(user)}</dd>
                  </div>
                </dl>

                <Link className={styles.manageLink} href={`/cms/admin/${user.id}/edit`}>
                  <Pencil aria-hidden="true" /> Manage account
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
