import { AdminBookingForm } from "@/components/cms/AdminBookingForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";
import { getCmsContent } from "@/server/cms/content-service";

function nextDublinDate() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

type PageProps = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CmsNewBookingPage({ searchParams }: PageProps) {
  await requireCmsPageUser("bookings:write");
  const params = await searchParams;
  const requestedDate = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "";
  const [content, mode] = await Promise.all([
    getCmsContent(),
    Promise.resolve(getCmsMode()),
  ]);
  const variants = content.services
    .filter((service) => service.status === "published")
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
  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/bookings" secondary>Back to bookings</CmsPrimaryLink>}
        description="Record an appointment received by phone, WhatsApp, walk-in or the administrator. Availability is checked again atomically when saved."
        eyebrow="Booking operations"
        title="Add booking"
      />
      {mode === "mock" ? (
        <CmsNotice tone="warning" title="Fictional local data only">
          Use a Demo customer name and placeholder contact details. This record
          resets when the local server restarts.
        </CmsNotice>
      ) : null}
      <AdminBookingForm defaultDate={requestedDate || nextDublinDate()} isMock={mode === "mock"} variants={variants} />
    </>
  );
}
