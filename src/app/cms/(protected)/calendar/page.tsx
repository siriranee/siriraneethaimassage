import { Ban, Clock3 } from "lucide-react";

import {
  CmsCalendar,
  type CmsCalendarBooking,
  type CmsCalendarClosure,
} from "@/components/cms/CmsCalendar";
import {
  CmsNotice,
  CmsPageHeader,
  CmsPrimaryLink,
} from "@/components/cms/CmsUi";
import {
  calendarMonthRange,
  currentCalendarDate,
  monthFromCalendarDate,
  normalizeCalendarDate,
  normalizeCalendarMonth,
} from "@/domain/booking/calendar-month";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { listCmsBookings, listCmsClosures } from "@/server/cms/read-service";

type PageProps = {
  readonly searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function CmsCalendarPage({ searchParams }: PageProps) {
  const user = await requireCmsPageUser("calendar:view");
  const canManageBookings = canCmsRole(user.role, "bookings:write");

  const params = await searchParams;
  const today = currentCalendarDate("Europe/Dublin");
  const requestedDate = normalizeCalendarDate(single(params.date));
  const requestedMonth = normalizeCalendarMonth(single(params.month));
  const month =
    requestedMonth ??
    (requestedDate ? monthFromCalendarDate(requestedDate) : today.slice(0, 7));
  const range =
    calendarMonthRange(month) ?? calendarMonthRange(today.slice(0, 7))!;
  const selectedDate =
    requestedDate && monthFromCalendarDate(requestedDate) === month
      ? requestedDate
      : monthFromCalendarDate(today) === month
        ? today
        : range.from;
  const [content, bookings, closures] = await Promise.all([
    getCmsContent(),
    listCmsBookings({ from: range.from, to: range.to }),
    listCmsClosures(range.from, range.to),
  ]);
  const calendarBookings: readonly CmsCalendarBooking[] = bookings
    .filter(
      (booking) =>
        booking.status !== "cancelled" &&
        booking.status !== "no-show",
    )
    .map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      customerName: booking.customer.name,
      customerPhone: booking.customer.phone,
      customerNotes: booking.customer.notes,
      serviceName: booking.serviceName,
      durationMinutes: booking.durationMinutes,
      localDate: booking.localDate,
      localTime: booking.localTime,
      status: booking.status,
      version: booking.version,
      demo: booking.demo,
    }));
  const calendarClosures: readonly CmsCalendarClosure[] = closures
    .filter((closure) => closure.active)
    .map((closure) => ({
      id: closure.id,
      localDate: closure.localDate,
      closedAllDay: closure.closedAllDay,
      startsAtLocal: closure.startsAtLocal,
      endsAtLocal: closure.endsAtLocal,
      reason: closure.reason,
      publicLabel: closure.publicLabel,
    }));

  return (
    <>
      <CmsPageHeader
        actions={
          <CmsPrimaryLink href="/cms/calendar/closures" secondary>
            <Ban aria-hidden="true" /> Days off &amp; closures
          </CmsPrimaryLink>
        }
        description="A Dublin-time month view for appointments, pending requests and blocked time."
        eyebrow="Availability"
        title="Calendar"
      />

      {!content.bookingSettings.rulesConfirmed ? (
        <CmsNotice tone="warning" title="Availability rules are provisional">
          This calendar can be used with fictional mock appointments, but public
          time slots remain disabled until the owner confirms the operating rules.
        </CmsNotice>
      ) : null}

      <CmsCalendar
        bookings={calendarBookings}
        canManageBookings={canManageBookings}
        closedWeekdays={content.site.weeklyHours.map((hours) => !hours.open)}
        closures={calendarClosures}
        initialSelectedDate={selectedDate}
        key={`${month}:${selectedDate}`}
        month={month}
        today={today}
      />

      <CmsNotice title="Customer booking rule">
        <Clock3 aria-hidden="true" /> Customers select only the treatment, date
        and time. New website requests appear here as pending appointments.
      </CmsNotice>
    </>
  );
}
