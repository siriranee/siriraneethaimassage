import { Ban, Clock3 } from "lucide-react";

import {
  CmsCalendar,
  type CmsCalendarBooking,
  type CmsCalendarClosure,
  type CmsCalendarTherapist,
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
import { isApprovedImageUrlForOwnership } from "@/lib/media/cloudinary-delivery";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { listCmsBookingEmailAttention, listCmsBookings, listCmsClosures } from "@/server/cms/read-service";
import { getCloudinaryMediaOwnershipConfig } from "@/server/media/config";

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
  const cloudinaryOwnership = getCloudinaryMediaOwnershipConfig();
  const therapistProfiles = new Map<string, CmsCalendarTherapist>(
    content.team.map((member) => [member.id, {
      id: member.id,
      name: member.name,
      imageUrl: isApprovedImageUrlForOwnership(member.imageUrl, cloudinaryOwnership) ? member.imageUrl : "",
      imageAlt: member.imageAlt,
    }]),
  );
  // Include cancelled bookings: a hidden appointment can still need email review.
  const bookingAssignments = new Map(bookings.map((booking) => [booking.id, booking.assignedStaffId]));
  const emailAttention = (await listCmsBookingEmailAttention(bookings.map((booking) => booking.id), bookings.length))
    .map((item) => ({ ...item, assignedStaffId: bookingAssignments.get(item.bookingId) ?? "" }));
  // Keep historical assignments accessible even if their profile no longer exists.
  for (const booking of bookings) {
    if (booking.assignedStaffId && !therapistProfiles.has(booking.assignedStaffId)) {
      therapistProfiles.set(booking.assignedStaffId, {
        id: booking.assignedStaffId,
        name: booking.assignedStaffName || "Former therapist",
        imageUrl: "",
        imageAlt: "",
      });
    }
  }
  const calendarBookings: readonly CmsCalendarBooking[] = bookings
    .filter(
      (booking) =>
        booking.status !== "cancelled" &&
        booking.status !== "no-show",
    )
    .map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      assignedStaffId: booking.assignedStaffId,
      therapistName: therapistProfiles.get(booking.assignedStaffId)?.name ?? booking.assignedStaffName,
      customerName: booking.customer.name,
      customerPhone: booking.customer.phone,
      customerEmail: booking.customer.email,
      serviceName: booking.serviceName,
      durationMinutes: booking.durationMinutes,
      priceCents: booking.priceCents,
      endsAt: booking.endsAt,
      localDate: booking.localDate,
      localTime: booking.localTime,
      status: booking.status,
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
        emailAttention={emailAttention}
        initialSelectedDate={selectedDate}
        key={`${month}:${selectedDate}`}
        month={month}
        therapists={[...therapistProfiles.values()].sort((first, second) => first.name.localeCompare(second.name))}
        today={today}
        weeklyHours={content.site.weeklyHours}
      />

      <CmsNotice title="Customer booking rule">
        <Clock3 aria-hidden="true" /> Customers select a treatment, qualified
        massage therapist, date and time. New website requests appear here as pending appointments.
      </CmsNotice>
    </>
  );
}
