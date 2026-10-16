import { notFound } from "next/navigation";

import { ClosureForm } from "@/components/cms/ClosureForm";
import { CmsDeleteClosureButton } from "@/components/cms/CmsDeleteClosureButton";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { normalizeCalendarDate } from "@/domain/booking/calendar-month";
import { cmsCalendarHref } from "@/domain/booking/cms-calendar";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { listCmsClosures } from "@/server/cms/read-service";

type PageProps = {
  readonly params: Promise<{ readonly closureId: string }>;
  readonly searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

export default async function CmsEditClosurePage({ params, searchParams }: PageProps) {
  await requireCmsPageUser("calendar:write");
  const { closureId } = await params;
  const query = await searchParams;
  const returnDate = normalizeCalendarDate(
    typeof query.date === "string" ? query.date : "",
  );
  const closure = (await listCmsClosures()).find((item) => item.id === closureId);
  if (!closure) notFound();
  const content = await getCmsContent();
  const therapists = content.team.filter((member) => !member.archived || member.id === closure.therapistId).map(({ id, name }) => ({ id, name }));
  const closuresHref = `/cms/calendar/closures?${new URLSearchParams({ date: returnDate ?? closure.localDate, ...(closure.therapistId ? { therapistId: closure.therapistId } : {}) }).toString()}`;
  const calendarHref = cmsCalendarHref(closure.localDate.slice(0, 7), closure.localDate, closure.therapistId);
  const therapistName = therapists.find((therapist) => therapist.id === closure.therapistId)?.name ?? "Former therapist";
  return (
    <>
      <CmsPageHeader actions={<><CmsPrimaryLink href={closuresHref} secondary>Back to closures</CmsPrimaryLink><CmsDeleteClosureButton closure={closure} therapistName={therapistName} returnHref={calendarHref} /></>} description="Edit this day off or blocked time, deactivate it to keep its history, or delete it." eyebrow="Availability" title={`Closure · ${closure.localDate}`} />
      <CmsNotice title="Soft deactivation preserves history">Turning a closure off releases its time while keeping the reason and audit event available.</CmsNotice>
      <ClosureForm closure={closure} defaultDate={closure.localDate} therapists={therapists} />
    </>
  );
}
