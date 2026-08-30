import { Ban, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import Link from "next/link";

import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { isPendingCapacityExpired } from "@/domain/booking/status";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { listCmsBookings, listCmsClosures } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

type CalendarView = "day" | "week" | "month";
type PageProps = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dublinToday() {
  const parts = new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, count: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function calendarRange(anchor: string, view: CalendarView) {
  const date = new Date(`${anchor}T12:00:00.000Z`);
  let from = anchor;
  let to = anchor;
  let previous = addDays(anchor, -1);
  let next = addDays(anchor, 1);

  if (view === "week") {
    const weekday = date.getUTCDay() || 7;
    from = addDays(anchor, 1 - weekday);
    to = addDays(from, 6);
    previous = addDays(anchor, -7);
    next = addDays(anchor, 7);
  } else if (view === "month") {
    from = `${anchor.slice(0, 7)}-01`;
    const nextMonth = new Date(`${from}T12:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    to = addDays(nextMonth.toISOString().slice(0, 10), -1);
    const previousMonth = new Date(`${from}T12:00:00.000Z`);
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    previous = previousMonth.toISOString().slice(0, 10);
    next = nextMonth.toISOString().slice(0, 10);
  }

  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return { from, to, days, previous, next };
}

export default async function CmsCalendarPage({ searchParams }: PageProps) {
  await requireCmsPageUser("calendar:view");
  const params = await searchParams;
  const viewValue = single(params.view);
  const view: CalendarView = viewValue === "day" || viewValue === "month" ? viewValue : "week";
  const requestedDate = single(params.date);
  const anchor = validDate(requestedDate) ? requestedDate : dublinToday();
  const range = calendarRange(anchor, view);
  const [content, bookings, closures] = await Promise.all([
    getCmsContent(),
    listCmsBookings({ from: range.from, to: range.to }),
    listCmsClosures(range.from, range.to),
  ]);
  const active = bookings.filter(
    (booking) =>
      booking.status !== "cancelled" &&
      booking.status !== "no-show" &&
      !isPendingCapacityExpired(booking),
  );
  const appointmentCount = active.length;

  return (
    <>
      <CmsPageHeader
        actions={<><CmsPrimaryLink href={`/cms/bookings/new?date=${anchor}`}><Plus aria-hidden="true" /> Add booking</CmsPrimaryLink><CmsPrimaryLink href="/cms/calendar/closures" secondary><Ban aria-hidden="true" /> Days off & closures</CmsPrimaryLink></>}
        description="A Dublin-time agenda for the whole treatment space. Staff assignment remains an optional internal operation."
        eyebrow="Availability"
        title="Calendar"
      />

      <CmsPanel>
        <form className={styles.searchForm}>
          <label>Calendar view<select defaultValue={view} name="view"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label>
          <label>Focus date<input defaultValue={anchor} name="date" required type="date" /></label>
          <div className={styles.filterActions}><button type="submit">Open view</button><Link className={styles.miniLink} href={`/cms/calendar?view=${view}&date=${dublinToday()}`}>Today</Link></div>
        </form>
        <div className={styles.toolbar}>
          <Link className={styles.miniLink} href={`/cms/calendar?view=${view}&date=${range.previous}`}><ChevronLeft aria-hidden="true" /> Previous</Link>
          <strong>{formatDate(range.from)}{range.to !== range.from ? ` – ${formatDate(range.to)}` : ""} · {appointmentCount} appointment{appointmentCount === 1 ? "" : "s"}</strong>
          <Link className={styles.miniLink} href={`/cms/calendar?view=${view}&date=${range.next}`}>Next <ChevronRight aria-hidden="true" /></Link>
        </div>
      </CmsPanel>

      {!content.bookingSettings.rulesConfirmed ? (
        <CmsNotice tone="warning" title="Availability rules are provisional">
          This agenda can be used with fictional mock appointments, but public
          time slots remain disabled until the owner confirms the operating rules.
        </CmsNotice>
      ) : null}

      <div className={styles.calendarGrid}>
        {range.days.map((day) => {
          const appointments = active.filter((booking) => booking.localDate === day);
          const dayClosures = closures.filter((closure) => closure.localDate === day && closure.active);

          return (
            <section className={styles.dayCard} key={day}>
              <header>
                <div><strong>{formatDate(day)}</strong><span>{appointments.length} appointment{appointments.length === 1 ? "" : "s"}</span></div>
                <CalendarPlus aria-hidden="true" />
              </header>
              {dayClosures.map((closure) => (
                <div className={styles.appointment} key={closure.id}>
                  <Ban aria-hidden="true" />
                  <div><strong>{closure.closedAllDay ? "Closed all day" : `${closure.startsAtLocal}–${closure.endsAtLocal}`}</strong><small>{closure.reason}</small></div>
                </div>
              ))}
              {appointments.map((booking) => (
                <Link className={styles.appointment} href={`/cms/bookings/${booking.id}`} key={booking.id}>
                  <time>{booking.localTime}</time>
                  <div>
                    <strong>{booking.customer.name} · {booking.serviceName}</strong>
                    <small>{booking.durationMinutes} min · {booking.assignedStaffId || "Unassigned"}</small>
                    <CmsBookingStatus status={booking.status} />
                  </div>
                </Link>
              ))}
              {!appointments.length && !dayClosures.length ? <p className={styles.emptyDay}>No appointments or closures.</p> : null}
            </section>
          );
        })}
      </div>

      {!appointmentCount ? (
        <CmsNotice title="No appointments in the current agenda">
          Use <Link className={styles.miniLink} href="/cms/bookings/new">Add booking</Link> to record a phone, WhatsApp or walk-in appointment.
        </CmsNotice>
      ) : null}

      <CmsNotice title="Customer booking rule">
        <Clock3 aria-hidden="true" /> Customers select the treatment, date and time.
        They do not see or select a therapist; assignment is handled here by staff.
      </CmsNotice>
    </>
  );
}
