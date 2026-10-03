import { AdminBookingForm } from "@/components/cms/AdminBookingForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import {
  currentCalendarDate,
  normalizeCalendarDate,
} from "@/domain/booking/calendar-month";
import { compareCmsTeamMembersByName } from "@/domain/cms/team";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CmsNewBookingPage({ searchParams }: PageProps) {
  await requireCmsPageUser("bookings:write");
  const params = await searchParams;
  const selectedDate = normalizeCalendarDate(
    typeof params.date === "string" ? params.date : "",
  ) ?? currentCalendarDate("Europe/Dublin");
  const [content, mode] = await Promise.all([
    getCmsContent(),
    Promise.resolve(getCmsMode()),
  ]);
  const variants = content.services
    .filter((service) => service.prices.some((price) => price.active))
    .flatMap((service) =>
      service.prices
        .filter((price) => price.active)
        .map((price) => ({
          serviceId: service.id,
          serviceName: service.name,
          durationMinutes: price.durationMinutes,
          priceCents: price.priceCents,
        })),
    );
  const therapists = content.team
    .filter((member) => member.operationalActive && !member.archived)
    .sort(compareCmsTeamMembersByName)
    .map((member) => ({
      id: member.id,
      name: member.name,
      serviceIds: member.serviceIds,
    }));
  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/bookings" secondary>Back to bookings</CmsPrimaryLink>}
        description="Record an appointment received by phone, WhatsApp, walk-in or the administrator. New bookings are confirmed immediately; availability is checked again when saved."
        eyebrow="Booking operations"
        title="Add booking"
      />
      {mode === "mock" ? (
        <CmsNotice tone="warning" title="Fictional local data only">
          Use a Demo customer name and placeholder contact details. This record
          resets when the local server restarts.
        </CmsNotice>
      ) : null}
      <AdminBookingForm
        defaultDate={selectedDate}
        isMock={mode === "mock"}
        therapists={therapists}
        variants={variants}
      />
    </>
  );
}
