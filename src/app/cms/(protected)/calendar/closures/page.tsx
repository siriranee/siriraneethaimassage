import { Ban, Pencil } from "lucide-react";
import Link from "next/link";

import { ClosureForm } from "@/components/cms/ClosureForm";
import { CmsEmptyState, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import {
  currentCalendarDate,
  normalizeCalendarDate,
  shiftCalendarDate,
} from "@/domain/booking/calendar-month";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsClosures } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

function tomorrowInDublin() {
  return shiftCalendarDate(currentCalendarDate("Europe/Dublin"), 1);
}

type PageProps = {
  readonly searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

export default async function CmsClosuresPage({ searchParams }: PageProps) {
  await requireCmsPageUser("calendar:write");
  const params = await searchParams;
  const requestedDate = normalizeCalendarDate(
    typeof params.date === "string" ? params.date : "",
  );
  const calendarHref = requestedDate
    ? `/cms/calendar?month=${requestedDate.slice(0, 7)}&date=${requestedDate}`
    : "/cms/calendar";
  const closures = await listCmsClosures();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href={calendarHref} secondary>Back to calendar</CmsPrimaryLink>}
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
                <Link className={styles.miniLink} href={`/cms/calendar/closures/${closure.id}/edit?date=${closure.localDate}`}><Pencil aria-hidden="true" /> Edit</Link>
              </li>
            ))}
          </ul>
        ) : (
          <CmsEmptyState title="No days off or closures recorded">Use the form below for holidays, days off, maintenance or blocked appointment periods.</CmsEmptyState>
        )}
      </CmsPanel>

      <ClosureForm defaultDate={requestedDate ?? tomorrowInDublin()} />
    </>
  );
}
