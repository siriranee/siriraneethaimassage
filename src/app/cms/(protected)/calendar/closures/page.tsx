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
import { getCmsContent } from "@/server/cms/content-service";
import { cmsCalendarHref } from "@/domain/booking/cms-calendar";
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
  const [closures, content] = await Promise.all([listCmsClosures(), getCmsContent()]);
  const requestedTherapistId = typeof params.therapistId === "string" ? params.therapistId : "";
  const therapistId = content.team.some((member) => member.id === requestedTherapistId && !member.archived) ? requestedTherapistId : "";
  const calendarHref = cmsCalendarHref((requestedDate ?? currentCalendarDate("Europe/Dublin")).slice(0, 7), requestedDate ?? undefined, therapistId);
  const therapists = content.team.filter((member) => !member.archived).map(({ id, name }) => ({ id, name }));

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href={calendarHref} secondary>Back to calendar</CmsPrimaryLink>}
        description="Add a day off or block part of a day. The public booking calendar updates immediately and existing appointments remain protected."
        eyebrow="Availability"
        title="Days off & blocked time"
      />

      <ClosureForm defaultDate={requestedDate ?? tomorrowInDublin()} defaultTherapistId={therapistId} therapists={therapists} />

      <CmsPanel title={`Current days off & closures · ${closures.length}`} description="All times use Europe/Dublin.">
        {closures.length ? (
          <ul className={styles.activityList}>
            {closures.map((closure) => (
              <li key={closure.id}>
                <Ban aria-hidden="true" />
                <div>
                  <strong>{closure.therapistId ? content.team.find((member) => member.id === closure.therapistId)?.name ?? "Former therapist" : "All therapists"} · {closure.localDate} · {closure.closedAllDay ? "All day" : `${closure.startsAtLocal}–${closure.endsAtLocal}`} <CmsStatusBadge label={closure.active ? "Active" : "Inactive"} tone={closure.active ? "warning" : "neutral"} /></strong>
                  <span>{closure.reason}{closure.publicLabel ? ` · Public: ${closure.publicLabel}` : ""}</span>
                </div>
                <Link className={styles.miniLink} href={`/cms/calendar/closures/${closure.id}/edit?date=${closure.localDate}`}><Pencil aria-hidden="true" /> Edit</Link>
              </li>
            ))}
          </ul>
        ) : (
          <CmsEmptyState title="No days off or closures recorded">Use the form above for holidays, days off, maintenance or blocked appointment periods.</CmsEmptyState>
        )}
      </CmsPanel>

    </>
  );
}
