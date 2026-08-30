import { History } from "lucide-react";

import { CmsEmptyState, CmsPageHeader, CmsPanel, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsAudit } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Dublin",
  }).format(new Date(value));
}

export default async function CmsAuditLogPage() {
  await requireCmsPageUser("audit:view");
  const events = await listCmsAudit(200);

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>}
        description="An append-only record of sign-ins, publishing and administrative changes, shown in Dublin time."
        eyebrow="Security & accountability"
        title="Audit log"
      />
      <CmsPanel title={`Recent events · ${events.length}`} description="Passwords, session tokens and customer notes are excluded.">
        {events.length ? (
          <ul className={styles.activityList}>
            {events.map((event) => (
              <li key={event.id}>
                <History aria-hidden="true" />
                <div>
                  <strong>{event.summary}</strong>
                  <span>{formatTimestamp(event.createdAt)} · {event.actorName} · {event.entityType} · {event.requestId}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CmsEmptyState title="No audit activity yet">
            Actions such as sign-in, content changes and publishing will appear here.
          </CmsEmptyState>
        )}
      </CmsPanel>
    </>
  );
}
