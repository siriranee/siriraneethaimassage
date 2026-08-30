import { Ban, Pencil } from "lucide-react";
import Link from "next/link";

import { ClosureForm } from "@/components/cms/ClosureForm";
import { CmsEmptyState, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsClosures } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

function tomorrowInDublin() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function CmsClosuresPage() {
  await requireCmsPageUser("calendar:write");
  const closures = await listCmsClosures();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/calendar" secondary>Back to calendar</CmsPrimaryLink>}
        description="Add a day off or block part of a day. The public booking calendar updates immediately and existing appointments remain protected."
        eyebrow="Availability"
        title="Days off & blocked time"
      />

      <CmsPanel title={`Current days off & closures · ${closures.length}`} description="All times use Europe/Dublin.">
        {closures.length ? (
          <ul className={styles.activityList}>
            {closures.map((closure) => (
              <li key={closure.id}>
                <Ban aria-hidden="true" />
                <div>
                  <strong>{closure.localDate} · {closure.closedAllDay ? "All day" : `${closure.startsAtLocal}–${closure.endsAtLocal}`} <CmsStatusBadge label={closure.active ? "Active" : "Inactive"} tone={closure.active ? "warning" : "neutral"} /></strong>
                  <span>{closure.reason}{closure.publicLabel ? ` · Public: ${closure.publicLabel}` : ""}</span>
                </div>
                <Link className={styles.miniLink} href={`/cms/calendar/closures/${closure.id}/edit`}><Pencil aria-hidden="true" /> Edit</Link>
              </li>
            ))}
          </ul>
        ) : (
          <CmsEmptyState title="No days off or closures recorded">Use the form below for holidays, days off, maintenance or blocked appointment periods.</CmsEmptyState>
        )}
      </CmsPanel>

      <ClosureForm defaultDate={tomorrowInDublin()} />
    </>
  );
}
