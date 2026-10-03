"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";

import { CmsTherapistPortrait } from "@/components/cms/CmsTherapistPortrait";
import {
  buildScheduleRange,
  buildScheduleRows,
  formatScheduleTime,
  layoutScheduleIntervals,
  parseScheduleTime,
  scheduleBookingDisplayInterval,
  scheduleBookingEndLabel,
} from "@/domain/booking/work-schedule";
import type { CmsWeeklyHours } from "@/domain/cms/types";
import type { CmsCalendarBooking, CmsCalendarClosure, CmsCalendarTherapist } from "./CmsCalendar";

import styles from "./CmsWorkSchedule.module.css";

type Props = {
  readonly date: string;
  readonly bookings: readonly CmsCalendarBooking[];
  readonly therapists: readonly CmsCalendarTherapist[];
  readonly closures: readonly CmsCalendarClosure[];
  readonly hours: CmsWeeklyHours | undefined;
};

const pixelsPerMinute = 2.4;
const priceFormatter = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

function useDublinMinute(date: string) {
  const [minute, setMinute] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date());
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      setMinute(`${values.year}-${values.month}-${values.day}` === date
        ? Number(values.hour) * 60 + Number(values.minute) : null);
    }
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [date]);
  return minute;
}

export function CmsWorkSchedule({ date, bookings, therapists, closures, hours }: Props) {
  const currentMinute = useDublinMinute(date);
  const timedBookings = useMemo(() => bookings.flatMap((booking) => {
    const interval = scheduleBookingDisplayInterval(booking.localTime, booking.durationMinutes, booking.endsAt, date);
    return interval ? [{ ...interval, id: booking.id, booking }] : [];
  }), [bookings, date]);
  const invalidBookings = bookings.filter((booking) => !scheduleBookingDisplayInterval(booking.localTime, booking.durationMinutes, booking.endsAt, date));
  const partialClosures = closures.flatMap((closure) => {
    const startMinute = parseScheduleTime(closure.startsAtLocal);
    const endMinute = parseScheduleTime(closure.endsAtLocal);
    return !closure.closedAllDay && startMinute !== null && endMinute !== null && endMinute > startMinute
      ? [{ startMinute, endMinute, closure }] : [];
  });
  const range = buildScheduleRange([...timedBookings, ...partialClosures], hours?.opens, hours?.closes);
  const openingMinute = parseScheduleTime(hours?.opens ?? "") ?? range.startMinute;
  const closingMinute = Math.min((parseScheduleTime(hours?.closes ?? "") ?? range.endMinute) + 60, 1440);
  const rows = buildScheduleRows(range, [
    ...timedBookings,
    ...partialClosures,
    { startMinute: range.startMinute, endMinute: openingMinute },
    { startMinute: closingMinute, endMinute: range.endMinute },
  ]);
  const gridRowByMinute = new Map([...rows.map((row, index) => [row.startMinute, index + 2] as const), [range.endMinute, rows.length + 2]]);
  const allDayClosure = closures.find((closure) => closure.closedAllDay);
  const closed = hours?.open === false || Boolean(allDayClosure);
  const columns = therapists.map((therapist) => {
    const entries = layoutScheduleIntervals(timedBookings.filter(({ booking }) =>
      therapist.id === "unassigned" ? !booking.assignedStaffId.trim() : booking.assignedStaffId === therapist.id));
    return { therapist, entries, width: Math.max(220, ...entries.map((entry) => entry.laneCount * 175)) };
  });
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `4.5rem ${columns.map((column) => `minmax(${column.width}px, 1fr)`).join(" ")}`,
    gridTemplateRows: `5rem ${rows.map((row) => `minmax(${(row.endMinute - row.startMinute) * pixelsPerMinute}px, auto)`).join(" ")} 1.5rem`,
    minWidth: `calc(4.5rem + ${columns.reduce((width, column) => width + column.width, 0)}px)`,
  } as CSSProperties;
  const intervalStyle = (startMinute: number, endMinute: number): CSSProperties => ({
    gridRow: `${gridRowByMinute.get(startMinute)} / ${gridRowByMinute.get(endMinute)}`,
  });
  const nowRowIndex = currentMinute === null ? -1 : rows.findIndex((row) => currentMinute >= row.startMinute && currentMinute < row.endMinute);
  const nowRow = rows[nowRowIndex];

  return (
    <div className={styles.schedule}>
      <div className={styles.legend} aria-label="Schedule legend">
        <span><i className={styles.confirmedKey} />Confirmed</span>
        <span><i className={styles.pendingKey} />Pending</span>
        <span><i className={styles.completedKey} />Completed</span>
        <span><i className={styles.closedKey} />Shop closed / blocked</span>
        <small>Dublin time · Scroll to see more times and therapists</small>
      </div>
      {closed ? <p className={styles.closedNotice}>{allDayClosure?.reason || "Day off — closed in the weekly business hours."} Existing appointments are still shown.</p> : null}
      {!bookings.length ? <p className={styles.emptyNotice}>No appointments for this selection. Therapist columns remain visible.</p> : null}
      {columns.length ? (
        <div className={styles.scrollArea} tabIndex={0} role="region" aria-label="Daily therapist work schedule, Dublin time">
          <div className={styles.canvas} style={gridStyle}>
            <div className={styles.corner}>Dublin<br />time</div>
            {columns.map(({ therapist }, columnIndex) => (
              <div className={styles.therapistHeader} style={{ gridColumn: columnIndex + 2, gridRow: 1 }} key={therapist.id}>
                <CmsTherapistPortrait {...therapist} />
                <strong>{therapist.name}</strong>
              </div>
            ))}
            {rows.map((row, index) => <Fragment key={row.startMinute}>
              <div className={styles.timeRuler} style={{ gridRow: index + 2 }} aria-hidden="true">
                {row.startMinute % 30 === 0 ? <span className={styles.timeLabel}>{formatScheduleTime(row.startMinute)}</span> : null}
              </div>
              {row.startMinute % 15 === 0 ? <div className={styles.gridLine} data-hour={row.startMinute % 60 === 0 || undefined} style={{ gridRow: index + 2 }} aria-hidden="true" /> : null}
            </Fragment>)}
            <div className={styles.timeRuler} style={{ gridRow: rows.length + 2 }} aria-hidden="true"><span className={styles.timeLabel}>{formatScheduleTime(range.endMinute)}</span></div>
            {columns.map(({ therapist, entries }, columnIndex) => (
              <Fragment key={therapist.id}>
                <div className={styles.lane} style={{ gridColumn: columnIndex + 2, gridRow: `2 / ${rows.length + 2}` }} aria-hidden="true" />
                {closed ? <div className={styles.allDayBlocked} style={{ gridColumn: columnIndex + 2, gridRow: `2 / ${rows.length + 2}` }} aria-hidden="true" /> : null}
                {!closed && hours?.open ? <>
                  {range.startMinute < openingMinute ? <div aria-hidden="true" className={styles.offHours} style={{ ...intervalStyle(range.startMinute, openingMinute), gridColumn: columnIndex + 2 }} /> : null}
                  {range.endMinute > closingMinute ? <div aria-hidden="true" className={styles.offHours} style={{ ...intervalStyle(closingMinute, range.endMinute), gridColumn: columnIndex + 2 }} /> : null}
                </> : null}
                {partialClosures.map(({ closure, startMinute, endMinute }) => (
                  <Link className={styles.closureBlock} style={{ ...intervalStyle(startMinute, endMinute), gridColumn: columnIndex + 2 }} key={closure.id}
                    href={`/cms/calendar/closures/${closure.id}/edit?date=${date}`}
                    aria-label={`${therapist.name}: shop blocked ${closure.startsAtLocal} to ${closure.endsAtLocal}, ${closure.reason}`}>
                    <strong>{closure.startsAtLocal}–{closure.endsAtLocal}</strong><span>{closure.reason || "Shop blocked"}</span>
                  </Link>
                ))}
                {entries.map(({ item, lane, laneCount }) => {
                  const { booking, startMinute, endMinute } = item;
                  const time = `${formatScheduleTime(startMinute)}–${scheduleBookingEndLabel(booking.endsAt, date, endMinute)}`;
                  const status = booking.status.charAt(0).toUpperCase() + booking.status.slice(1);
                  const durationAndPrice = `${booking.durationMinutes} min · ${priceFormatter.format(booking.priceCents / 100)}`;
                  const phone = booking.customerPhone.trim() || "Not provided";
                  const email = booking.customerEmail.trim() || "Not provided";
                  const label = `${time} · ${booking.customerName} · ${booking.serviceName} · ${durationAndPrice} · ${status} · ${booking.reference} · Phone: ${phone} · Email: ${email}`;
                  return <Link key={booking.id} href={`/cms/bookings/${booking.id}`}
                    className={styles.bookingBlock} data-status={booking.status}
                    style={{ ...intervalStyle(startMinute, endMinute), gridColumn: columnIndex + 2, marginLeft: `calc(${lane / laneCount * 100}% + 3px)`, width: `calc(${100 / laneCount}% - 6px)` }}
                    aria-label={`Open booking: ${therapist.name} · ${label}`} title={label}>
                    <strong>{time}</strong>
                    <span className={styles.customer}>{booking.customerName}</span>
                    <span className={styles.treatment}>{booking.serviceName}</span>
                    <span className={styles.bookingMeta}>{durationAndPrice}</span>
                    <span className={styles.bookingStatus}>{status}</span>
                    <span className={styles.bookingDetail}><b>Ref</b> {booking.reference}</span>
                    <span className={styles.bookingDetail}><b>Phone</b> {phone}</span>
                    <span className={styles.bookingDetail}><b>Email</b> {email}</span>
                  </Link>;
                })}
              </Fragment>
            ))}
            {nowRow && currentMinute !== null ? <div className={styles.nowMarker} style={{ gridRow: nowRowIndex + 2 }}>
              <div className={styles.nowLine} style={{ top: `${(currentMinute - nowRow.startMinute) / (nowRow.endMinute - nowRow.startMinute) * 100}%` }} aria-label={`Current Dublin time ${formatScheduleTime(currentMinute)}`} />
            </div> : null}
          </div>
        </div>
      ) : <p className={styles.emptyNotice}>No therapist matches this selection. Choose All therapists to reset the filter.</p>}
      {invalidBookings.length ? <div className={styles.invalidBookings}>
        <strong>Appointments needing time review</strong>
        {invalidBookings.map((booking) => <Link href={`/cms/bookings/${booking.id}`} key={booking.id}>{booking.reference} · {booking.customerName}</Link>)}
      </div> : null}
      <p className={styles.note}>Rows expand to fit booking details; use the time labels to read appointment times. Tap an appointment to view or manage it. Striped time applies to the whole shop, not individual therapist shifts.</p>
    </div>
  );
}
