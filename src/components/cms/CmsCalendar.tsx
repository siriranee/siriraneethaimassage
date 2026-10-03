"use client";

import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useMemo } from "react";

import { CmsTherapistPortrait as TherapistPortrait } from "@/components/cms/CmsTherapistPortrait";
import { CmsWorkSchedule } from "@/components/cms/CmsWorkSchedule";
import { CalendarLegend } from "@/components/booking/CalendarLegend";
import calendarStyles from "@/components/booking/BookingCalendar.module.css";
import { CmsBookingEmailAttentionNotice } from "@/components/cms/CmsBookingEmailAttentionNotice";
import { cmsCalendarHref as calendarHref, filterCmsCalendarBookings } from "@/domain/booking/cms-calendar";
import {
  buildCalendarMonthCells,
  calendarWeekdayLabels,
  formatCalendarDate,
  formatCalendarMonth,
  normalizeCalendarDate,
  shiftCalendarMonth,
} from "@/domain/booking/calendar-month";
import type { BookingStatus, CmsWeeklyHours } from "@/domain/cms/types";
import type { CmsBookingEmailAttention } from "@/domain/cms/notification-presentation";

import styles from "./CmsCalendar.module.css";

export type CmsCalendarBooking = {
  readonly id: string;
  readonly reference: string;
  readonly assignedStaffId: string;
  readonly therapistName: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly customerEmail: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly endsAt: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly status: BookingStatus;
};

export type CmsCalendarTherapist = {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
};

export type CmsCalendarClosure = {
  readonly id: string;
  readonly localDate: string;
  readonly closedAllDay: boolean;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly reason: string;
  readonly publicLabel: string;
};

type CmsCalendarProps = {
  readonly month: string;
  readonly today: string;
  readonly initialSelectedDate: string;
  readonly bookings: readonly CmsCalendarBooking[];
  readonly therapists: readonly CmsCalendarTherapist[];
  readonly emailAttention: readonly (CmsBookingEmailAttention & { readonly assignedStaffId: string })[];
  readonly closures: readonly CmsCalendarClosure[];
  readonly canManageBookings: boolean;
  readonly closedWeekdays: readonly boolean[];
  readonly weeklyHours: readonly CmsWeeklyHours[];
};

function groupByDate<T extends { readonly localDate: string }>(
  items: readonly T[],
) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const group = groups.get(item.localDate) ?? [];
    group.push(item);
    groups.set(item.localDate, group);
  }

  return groups;
}

function isRegularDayOff(
  localDate: string,
  closedWeekdays: readonly boolean[],
) {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  const mondayFirstIndex = weekday === 0 ? 6 : weekday - 1;
  return closedWeekdays[mondayFirstIndex] === true;
}

function dayAriaLabel(
  localDate: string,
  bookings: readonly CmsCalendarBooking[],
  closures: readonly CmsCalendarClosure[],
  selected: boolean,
  dayOff: boolean,
) {
  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending",
  ).length;
  const partialClosureCount = closures.filter(
    (closure) => !closure.closedAllDay,
  ).length;
  const details = [
    bookings.length
      ? `${bookings.length} appointment${bookings.length === 1 ? "" : "s"}`
      : "no appointments",
  ];

  if (pendingCount) {
    details.push(`${pendingCount} pending`);
  }
  if (dayOff) {
    details.push("Day off");
  } else if (partialClosureCount) {
    details.push(
      `${partialClosureCount} partial closure${partialClosureCount === 1 ? "" : "s"}`,
    );
  }
  if (selected) details.push("selected");

  return `${formatCalendarDate(localDate)} — ${details.join(", ")}`;
}

export function CmsCalendar({
  month,
  today,
  initialSelectedDate,
  bookings,
  therapists,
  emailAttention,
  closures,
  canManageBookings,
  closedWeekdays,
  weeklyHours,
}: CmsCalendarProps) {
  const calendarHeadingId = useId();
  const calendarStatusId = useId();
  const agendaHeadingId = useId();
  const searchParams = useSearchParams();
  const requestedDate = normalizeCalendarDate(searchParams.get("date") ?? "");
  const selectedDate = requestedDate?.startsWith(`${month}-`) ? requestedDate : initialSelectedDate;
  const selectedTherapistId = searchParams.get("therapistId") ?? "";
  const selectedTherapistName = selectedTherapistId === "unassigned"
    ? "Unassigned"
    : therapists.find((therapist) => therapist.id === selectedTherapistId)?.name ?? "Selected therapist";
  const filteredBookings = useMemo(
    () => filterCmsCalendarBookings(bookings, selectedTherapistId),
    [bookings, selectedTherapistId],
  );
  const cells = useMemo(() => buildCalendarMonthCells(month), [month]);
  const filteredEmailAttention = useMemo(
    () => filterCmsCalendarBookings(emailAttention, selectedTherapistId).slice(0, 8),
    [emailAttention, selectedTherapistId],
  );
  const bookingsByDate = useMemo(() => groupByDate(filteredBookings), [filteredBookings]);
  const closuresByDate = useMemo(() => groupByDate(closures), [closures]);
  const selectedBookings = useMemo(
    () =>
      [...(bookingsByDate.get(selectedDate) ?? [])].sort(
        (first, second) =>
          first.localTime.localeCompare(second.localTime) ||
          first.therapistName.localeCompare(second.therapistName) || first.id.localeCompare(second.id),
      ),
    [bookingsByDate, selectedDate],
  );
  const selectedClosures = useMemo(
    () =>
      [...(closuresByDate.get(selectedDate) ?? [])].sort((first, second) => {
        if (first.closedAllDay !== second.closedAllDay) {
          return first.closedAllDay ? -1 : 1;
        }
        return first.startsAtLocal.localeCompare(second.startsAtLocal);
      }),
    [closuresByDate, selectedDate],
  );
  const selectedPendingCount = selectedBookings.filter(
    (booking) => booking.status === "pending",
  ).length;
  const selectedRegularDayOff = isRegularDayOff(
    selectedDate,
    closedWeekdays,
  );
  const previousMonth = shiftCalendarMonth(month, -1);
  const nextMonth = shiftCalendarMonth(month, 1);
  const todayMonth = today.slice(0, 7);
  const weekday = new Date(`${selectedDate}T12:00:00Z`).getUTCDay();
  const hours = weeklyHours[weekday === 0 ? 6 : weekday - 1];
  const scheduleTherapists = useMemo(() => {
    const roster = [...therapists];
    if (selectedTherapistId === "unassigned" || bookings.some((booking) => !booking.assignedStaffId.trim()) || emailAttention.some((item) => !item.assignedStaffId.trim())) {
      roster.push({ id: "unassigned", name: "Unassigned", imageUrl: "", imageAlt: "" });
    }
    return selectedTherapistId ? roster.filter((therapist) => therapist.id === selectedTherapistId) : roster;
  }, [therapists, bookings, emailAttention, selectedTherapistId]);

  function selectDate(localDate: string) {
    window.history.replaceState(null, "", calendarHref(month, localDate, selectedTherapistId));
  }

  function selectTherapist(therapistId: string) {
    if (therapistId === selectedTherapistId) return;
    window.history.pushState(null, "", calendarHref(month, selectedDate, therapistId));
  }

  return (
    <div className={styles.calendarLayout}>
      <CmsBookingEmailAttentionNotice items={filteredEmailAttention} />
      <section
        aria-describedby={calendarStatusId}
        aria-labelledby={calendarHeadingId}
        className={calendarStyles.calendar}
      >
        <header className={calendarStyles.calendarHeader}>
          <div className={calendarStyles.calendarTitle}>
            <span className={calendarStyles.calendarIcon} aria-hidden="true">
              <CalendarDays />
            </span>
            <div>
              <span>Appointment calendar</span>
              <h2 id={calendarHeadingId}>{formatCalendarMonth(month)}</h2>
            </div>
          </div>

          <nav aria-label="Calendar month navigation" className={calendarStyles.monthControls}>
            <Link
              aria-label={`Show ${formatCalendarMonth(previousMonth)}`}
              className={calendarStyles.monthButton}
              href={calendarHref(previousMonth, undefined, selectedTherapistId)}
              scroll={false}
            >
              <ChevronLeft aria-hidden="true" />
            </Link>
            {todayMonth === month ? (
              <button
                className={calendarStyles.todayButton}
                disabled={selectedDate === today}
                onClick={() => selectDate(today)}
                type="button"
              >
                Today
              </button>
            ) : (
              <Link
                className={calendarStyles.todayButton}
                href={calendarHref(todayMonth, today, selectedTherapistId)}
                scroll={false}
              >
                Today
              </Link>
            )}
            <Link
              aria-label={`Show ${formatCalendarMonth(nextMonth)}`}
              className={calendarStyles.monthButton}
              href={calendarHref(nextMonth, undefined, selectedTherapistId)}
              scroll={false}
            >
              <ChevronRight aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <div aria-hidden="true" className={calendarStyles.weekdays}>
          {calendarWeekdayLabels.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div
          aria-label={`${formatCalendarMonth(month)} appointment schedule`}
          className={calendarStyles.monthGrid}
        >
          {cells.map((localDate, index) => {
            if (!localDate) {
              return <span aria-hidden="true" key={`empty-${index}`} />;
            }

            const dayBookings = bookingsByDate.get(localDate) ?? [];
            const dayClosures = closuresByDate.get(localDate) ?? [];
            const pendingCount = dayBookings.filter(
              (booking) => booking.status === "pending",
            ).length;
            const allDayClosure = dayClosures.some(
              (closure) => closure.closedAllDay,
            );
            const regularDayOff = isRegularDayOff(
              localDate,
              closedWeekdays,
            );
            const dayOff = regularDayOff || allDayClosure;
            const hasPartialClosure = dayClosures.some(
              (closure) => !closure.closedAllDay,
            );
            const selected = selectedDate === localDate;
            const isToday = today === localDate;

            return (
              <button
                aria-current={isToday ? "date" : undefined}
                aria-label={dayAriaLabel(
                  localDate,
                  dayBookings,
                  dayClosures,
                  selected,
                  dayOff,
                )}
                aria-pressed={selected}
                className={`${calendarStyles.calendarDay} ${
                  dayOff
                    ? calendarStyles.dayOff
                    : calendarStyles.dayAvailable
                } ${
                  dayBookings.length ? styles.dayHasBookings : ""
                } ${pendingCount ? styles.dayHasPending : ""} ${
                  hasPartialClosure ? styles.dayHasClosure : ""
                } ${
                  selected
                    ? `${calendarStyles.daySelected} ${styles.daySelected}`
                    : ""
                } ${isToday ? calendarStyles.dayToday : ""}`}
                data-date={localDate}
                key={localDate}
                onClick={() => selectDate(localDate)}
                type="button"
              >
                <span className={calendarStyles.dayNumber}>
                  {Number(localDate.slice(-2))}
                </span>
                <span aria-hidden="true" className={styles.dayIndicators}>
                  {dayBookings.length ? (
                    <span className={styles.bookingCount}>{dayBookings.length}</span>
                  ) : null}
                  {pendingCount ? <i className={styles.pendingDot} /> : null}
                  {hasPartialClosure ? <i className={styles.closureMark} /> : null}
                  {dayOff ? <Ban className={styles.closedIcon} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.operationalKey}>
          <CalendarLegend>
            <li>
              <i aria-hidden="true" className={styles.indicatorBooking}>1</i>
              Appointments
            </li>
            <li>
              <i aria-hidden="true" className={styles.indicatorPending} />
              Pending
            </li>
            <li>
              <i aria-hidden="true" className={styles.indicatorClosure} />
              Partial closure
            </li>
          </CalendarLegend>
        </div>

        <div
          aria-live="polite"
          className={calendarStyles.calendarStatus}
          id={calendarStatusId}
          role="status"
        >
          <p>
            {formatCalendarDate(selectedDate)} selected · {selectedBookings.length}{" "}
            appointment{selectedBookings.length === 1 ? "" : "s"}
            {selectedTherapistId ? ` · ${selectedTherapistName}` : ""}
            {selectedPendingCount ? ` · ${selectedPendingCount} pending` : ""}
            {selectedRegularDayOff ? " · Day off" : ""}
            {selectedClosures.length
              ? ` · ${selectedClosures.length} active closure${selectedClosures.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      </section>

      <section aria-labelledby={agendaHeadingId} className={styles.agenda}>
        <header className={styles.agendaHeader}>
          <div>
            <span>Daily work schedule · Dublin time</span>
            <h2 id={agendaHeadingId}>{formatCalendarDate(selectedDate)}</h2>
          </div>
          {canManageBookings ? <div className={styles.agendaActions}>
            <Link href={`/cms/bookings/new?date=${selectedDate}`}>
              <Plus aria-hidden="true" /> Add booking
            </Link>
            <Link href={`/cms/calendar/closures?date=${selectedDate}`}>
              <Ban aria-hidden="true" /> Block this day
            </Link>
          </div> : null}
        </header>

        <div className={styles.agendaBody}>
          <fieldset className={styles.therapistFilter}>
            <legend>Massage therapist</legend>
            <div className={styles.therapistChoices}>
              <button aria-pressed={!selectedTherapistId} className={styles.therapistChoice} onClick={() => selectTherapist("")} type="button">
                <span className={styles.therapistPortrait}><UsersRound aria-hidden="true" /></span>
                <strong>All therapists</strong>
              </button>
              {therapists.map((therapist) => (
                <button
                  aria-label={`Show bookings for ${therapist.name}`}
                  aria-pressed={selectedTherapistId === therapist.id}
                  className={styles.therapistChoice}
                  key={therapist.id}
                  onClick={() => selectTherapist(therapist.id)}
                  type="button"
                >
                  <TherapistPortrait {...therapist} />
                  <strong>{therapist.name}</strong>
                </button>
              ))}
              {bookings.some((booking) => !booking.assignedStaffId.trim()) || emailAttention.some((item) => !item.assignedStaffId.trim()) ? (
                <button aria-pressed={selectedTherapistId === "unassigned"} className={styles.therapistChoice} onClick={() => selectTherapist("unassigned")} type="button">
                  <TherapistPortrait name="Unassigned" imageUrl="" imageAlt="" />
                  <strong>Unassigned</strong>
                </button>
              ) : null}
            </div>
          </fieldset>
          <p className={styles.scheduleStatus} role="status" aria-live="polite">
            {selectedBookings.length} appointment{selectedBookings.length === 1 ? "" : "s"}
            {selectedTherapistId ? ` · ${selectedTherapistName}` : " · All therapists"}
            {selectedPendingCount ? ` · ${selectedPendingCount} pending` : ""}
          </p>
          <CmsWorkSchedule
            date={selectedDate}
            bookings={selectedBookings}
            therapists={scheduleTherapists}
            closures={selectedClosures}
            hours={hours}
          />
        </div>
      </section>
    </div>
  );
}
