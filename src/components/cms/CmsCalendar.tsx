"use client";

import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { CalendarLegend } from "@/components/booking/CalendarLegend";
import calendarStyles from "@/components/booking/BookingCalendar.module.css";
import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import {
  buildCalendarMonthCells,
  calendarWeekdayLabels,
  formatCalendarDate,
  formatCalendarMonth,
  shiftCalendarMonth,
} from "@/domain/booking/calendar-month";
import type { BookingStatus } from "@/domain/cms/types";

import styles from "./CmsCalendar.module.css";

export type CmsCalendarBooking = {
  readonly id: string;
  readonly reference: string;
  readonly customerName: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly localDate: string;
  readonly localTime: string;
  readonly status: BookingStatus;
  readonly demo: boolean;
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
  readonly closures: readonly CmsCalendarClosure[];
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

function calendarHref(month: string, date?: string) {
  const params = new URLSearchParams({ month });
  if (date) params.set("date", date);
  return `/cms/calendar?${params.toString()}`;
}

function dayAriaLabel(
  localDate: string,
  bookings: readonly CmsCalendarBooking[],
  closures: readonly CmsCalendarClosure[],
  selected: boolean,
) {
  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending",
  ).length;
  const allDayClosure = closures.some((closure) => closure.closedAllDay);
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
  if (allDayClosure) {
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
  closures,
}: CmsCalendarProps) {
  const calendarHeadingId = useId();
  const calendarStatusId = useId();
  const agendaHeadingId = useId();
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const cells = useMemo(() => buildCalendarMonthCells(month), [month]);
  const bookingsByDate = useMemo(() => groupByDate(bookings), [bookings]);
  const closuresByDate = useMemo(() => groupByDate(closures), [closures]);
  const selectedBookings = useMemo(
    () =>
      [...(bookingsByDate.get(selectedDate) ?? [])].sort(
        (first, second) =>
          first.localTime.localeCompare(second.localTime) ||
          first.customerName.localeCompare(second.customerName),
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
  const previousMonth = shiftCalendarMonth(month, -1);
  const nextMonth = shiftCalendarMonth(month, 1);
  const todayMonth = today.slice(0, 7);

  function selectDate(localDate: string) {
    setSelectedDate(localDate);
    window.history.replaceState(null, "", calendarHref(month, localDate));
  }

  return (
    <div className={styles.calendarLayout}>
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
              href={calendarHref(previousMonth)}
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
                href={calendarHref(todayMonth, today)}
                scroll={false}
              >
                Today
              </Link>
            )}
            <Link
              aria-label={`Show ${formatCalendarMonth(nextMonth)}`}
              className={calendarStyles.monthButton}
              href={calendarHref(nextMonth)}
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
                )}
                aria-pressed={selected}
                className={`${calendarStyles.calendarDay} ${
                  allDayClosure
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
                  {allDayClosure ? <Ban className={styles.closedIcon} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <CalendarLegend />

        <div className={styles.operationalKey}>
          <strong>CMS indicators</strong>
          <ul aria-label="CMS calendar indicators">
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
          </ul>
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
            {selectedPendingCount ? ` · ${selectedPendingCount} pending` : ""}
            {selectedClosures.length
              ? ` · ${selectedClosures.length} active closure${selectedClosures.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      </section>

      <section aria-labelledby={agendaHeadingId} className={styles.agenda}>
        <header className={styles.agendaHeader}>
          <div>
            <span>Selected day</span>
            <h2 id={agendaHeadingId}>{formatCalendarDate(selectedDate)}</h2>
          </div>
          <div className={styles.agendaActions}>
            <Link href={`/cms/bookings/new?date=${selectedDate}`}>
              <Plus aria-hidden="true" /> Add booking
            </Link>
            <Link href={`/cms/calendar/closures?date=${selectedDate}`}>
              <Ban aria-hidden="true" /> Block this day
            </Link>
          </div>
        </header>

        <div className={styles.agendaBody}>
          {selectedClosures.length ? (
            <div className={styles.agendaGroup}>
              <h3>Closures</h3>
              <ul>
                {selectedClosures.map((closure) => (
                  <li key={closure.id}>
                    <Link
                      className={styles.closureItem}
                      href={`/cms/calendar/closures/${closure.id}/edit?date=${selectedDate}`}
                    >
                      <Ban aria-hidden="true" />
                      <span>
                        <strong>
                          {closure.closedAllDay
                            ? "Day off"
                            : `${closure.startsAtLocal}–${closure.endsAtLocal}`}
                        </strong>
                        <small>
                          {closure.reason}
                          {closure.publicLabel
                            ? ` · Public: ${closure.publicLabel}`
                            : ""}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedBookings.length ? (
            <div className={styles.agendaGroup}>
              <h3>Appointments</h3>
              <ul>
                {selectedBookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      className={styles.bookingItem}
                      href={`/cms/bookings/${booking.id}`}
                    >
                      <time dateTime={`${booking.localDate}T${booking.localTime}`}>
                        <Clock3 aria-hidden="true" /> {booking.localTime}
                      </time>
                      <span>
                        <strong>{booking.customerName}</strong>
                        <small>
                          {booking.serviceName} · {booking.durationMinutes} min ·{" "}
                          {booking.reference}
                          {booking.demo ? " · Fictional mock" : ""}
                        </small>
                        <CmsBookingStatus status={booking.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!selectedBookings.length && !selectedClosures.length ? (
            <div className={styles.emptyAgenda}>
              <CalendarDays aria-hidden="true" />
              <strong>No appointments or closures</strong>
              <p>This day is clear in the current operational calendar.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
