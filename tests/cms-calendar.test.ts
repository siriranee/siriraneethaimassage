import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("day agenda always renders the full therapist roster with content-sized pills", async () => {
  const [page, calendar, styles] = await Promise.all([
    readFile("src/app/cms/(protected)/calendar/page.tsx", "utf8"),
    readFile("src/components/cms/CmsCalendar.tsx", "utf8"),
    readFile("src/components/cms/CmsCalendar.module.css", "utf8"),
  ]);
  assert.match(page, /content\.team\.map\(\(member\)/);
  const agenda = calendar.slice(calendar.indexOf('<div className={styles.agendaBody}>'));
  assert.match(agenda, /^<div className=\{styles\.agendaBody\}>\s*<fieldset className=\{styles\.therapistFilter\}>/);
  const roster = agenda.slice(0, agenda.indexOf("</fieldset>"));
  assert.match(roster, /therapists\.map\(\(therapist\)/);
  assert.doesNotMatch(roster, /selectedBookings|therapists\.filter/);
  assert.match(roster, /onClick=\{\(\) => selectTherapist\(therapist\.id\)\}/);
  assert.match(styles, /\.therapistChoices\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap;/);
  assert.match(styles, /\.therapistChoice\s*\{[^}]*flex: 0 1 auto;[^}]*width: fit-content;[^}]*min-width: 0;/);
});

test("original month calendar remains always visible above the daily work schedule", async () => {
  const [calendar, styles] = await Promise.all([
    readFile("src/components/cms/CmsCalendar.tsx", "utf8"),
    readFile("src/components/cms/CmsCalendar.module.css", "utf8"),
  ]);
  const monthCalendar = calendar.indexOf("className={calendarStyles.calendar}");
  const agenda = calendar.indexOf("className={styles.agenda}");
  const schedule = calendar.indexOf("<CmsWorkSchedule");

  assert.ok(monthCalendar >= 0 && agenda > monthCalendar && schedule > agenda);
  assert.doesNotMatch(calendar, /<details|monthPicker|weekStrip|weekControls|buildScheduleWeek/);
  assert.doesNotMatch(styles, /\.monthPicker|\.weekStrip|\.weekControls|\.weekDay/);
  assert.match(calendar, /aria-label="Calendar month navigation"/);
  assert.match(calendar, /calendarHref\(previousMonth, undefined, selectedTherapistId\)/);
  assert.match(calendar, /calendarHref\(nextMonth, undefined, selectedTherapistId\)/);
  assert.match(calendar, /calendarHref\(todayMonth, today, selectedTherapistId\)/);
  assert.match(calendar, /onClick=\{\(\) => selectDate\(today\)\}/);
  assert.match(calendar, /calendarWeekdayLabels\.map/);
  assert.match(calendar, /cells\.map\(\(localDate, index\)/);
  assert.match(calendar, /className=\{styles\.bookingCount\}>\{dayBookings\.length\}/);
  assert.match(calendar, /pendingCount \? <i className=\{styles\.pendingDot\}/);
  assert.match(calendar, /<CalendarLegend>/);
  assert.match(calendar, /className=\{calendarStyles\.calendarStatus\}/);
});

test("daily work schedule retains empty columns, time-sized bookings and safe details", async () => {
  const [page, calendar, schedule, styles] = await Promise.all([
    readFile("src/app/cms/(protected)/calendar/page.tsx", "utf8"),
    readFile("src/components/cms/CmsCalendar.tsx", "utf8"),
    readFile("src/components/cms/CmsWorkSchedule.tsx", "utf8"),
    readFile("src/components/cms/CmsWorkSchedule.module.css", "utf8"),
  ]);
  assert.match(page, /durationMinutes: booking\.durationMinutes/);
  assert.match(page, /endsAt: booking\.endsAt/);
  assert.match(page, /weeklyHours=\{content\.site\.weeklyHours\}/);
  assert.doesNotMatch(schedule, /customerNotes|internalNotes/);
  assert.match(calendar, /<CmsWorkSchedule/);
  assert.match(schedule, /const columns = therapists\.map/);
  assert.match(schedule, /layoutScheduleIntervals\(timedBookings\.filter/);
  assert.match(schedule, /scheduleBookingEndLabel\(booking\.endsAt, date, endMinute\)/);
  assert.match(schedule, /gridTemplateRows:.*minmax\(/);
  assert.match(schedule, /gridRow: `\$\{gridRowByMinute\.get\(startMinute\)\} \/ \$\{gridRowByMinute\.get\(endMinute\)\}`/);
  assert.match(schedule, /href=\{`\/cms\/bookings\/\$\{booking\.id\}`\}/);
  assert.match(schedule, /partialClosures\.map/);
  assert.match(schedule, /timeZone: "Europe\/Dublin"/);
  assert.match(schedule, /window\.clearInterval\(timer\)/);
  assert.match(styles, /\.scrollArea\s*\{[^}]*overflow: auto/);
  assert.match(styles, /\.timeRuler\s*\{[^}]*position: sticky;[^}]*left: 0/);
  assert.match(styles, /data-status="pending"/);
  assert.match(styles, /data-status="completed"/);
});

test("schedule blocks include booking and contact details without hiding shorter appointments", async () => {
  const [page, calendar, schedule, styles] = await Promise.all([
    readFile("src/app/cms/(protected)/calendar/page.tsx", "utf8"),
    readFile("src/components/cms/CmsCalendar.tsx", "utf8"),
    readFile("src/components/cms/CmsWorkSchedule.tsx", "utf8"),
    readFile("src/components/cms/CmsWorkSchedule.module.css", "utf8"),
  ]);
  assert.match(page, /requireCmsPageUser\("calendar:view"\)/);
  for (const field of ["phone", "email"]) {
    assert.match(page, new RegExp(`customer${field[0].toUpperCase()}${field.slice(1)}: booking\\.customer\\.${field}`));
  }
  assert.match(page, /priceCents: booking\.priceCents/);
  assert.match(calendar, /readonly priceCents: number/);
  assert.match(schedule, /priceFormatter\.format\(booking\.priceCents \/ 100\)/);
  assert.match(schedule, /booking\.customerPhone\.trim\(\) \|\| "Not provided"/);
  assert.match(schedule, /booking\.customerEmail\.trim\(\) \|\| "Not provided"/);
  assert.match(schedule, /<b>Ref<\/b> \{booking\.reference\}/);
  assert.match(schedule, /<b>Phone<\/b> \{phone\}/);
  assert.match(schedule, /<b>Email<\/b> \{email\}/);
  assert.doesNotMatch(schedule, /data-compact|customerNotes|internalNotes/);
  assert.match(styles, /\.bookingBlock\s*\{[^}]*position: relative/);
  assert.doesNotMatch(styles, /\.bookingBlock\s*\{[^}]*;\s*(?:overflow(?:-[xy])?|height):/);
  assert.doesNotMatch(schedule, /Scroll inside an appointment/);
  assert.match(schedule, /buildScheduleRows\(range/);
  assert.match(styles, /\.bookingBlock > \*\s*\{[^}]*flex-shrink: 0/);
  assert.doesNotMatch(styles, /data-compact/);
});

import {
  cmsCalendarHref,
  filterCmsCalendarBookings,
} from "@/domain/booking/cms-calendar";

const bookings = Object.freeze([
  Object.freeze({
    id: "a-confirmed",
    assignedStaffId: "therapist-a",
    localDate: "2026-09-19",
    status: "confirmed",
  }),
  Object.freeze({
    id: "b-pending",
    assignedStaffId: "therapist-b",
    localDate: "2026-09-19",
    status: "pending",
  }),
  Object.freeze({
    id: "a-pending",
    assignedStaffId: "therapist-a",
    localDate: "2026-09-20",
    status: "pending",
  }),
  Object.freeze({
    id: "unassigned",
    assignedStaffId: "",
    localDate: "2026-09-19",
    status: "pending",
  }),
  Object.freeze({
    id: "blank-assignment",
    assignedStaffId: "   ",
    localDate: "2026-09-19",
    status: "confirmed",
  }),
]);

test("calendar filters simultaneous appointments by exact therapist ID", () => {
  assert.deepEqual(
    filterCmsCalendarBookings(bookings, "therapist-a").map((booking) => booking.id),
    ["a-confirmed", "a-pending"],
  );
  assert.deepEqual(
    filterCmsCalendarBookings(bookings, "therapist-b").map((booking) => booking.id),
    ["b-pending"],
  );
});

test("all therapists includes assigned and unassigned appointments", () => {
  assert.deepEqual(filterCmsCalendarBookings(bookings, ""), bookings);
});

test("unassigned includes only blank therapist assignments", () => {
  assert.deepEqual(
    filterCmsCalendarBookings(bookings, "unassigned").map((booking) => booking.id),
    ["unassigned", "blank-assignment"],
  );
});

test("unknown or inexact therapist IDs never fall back to every booking", () => {
  for (const therapistId of ["missing", "therapist", "THERAPIST-A", " therapist-a "]) {
    assert.deepEqual(filterCmsCalendarBookings(bookings, therapistId), []);
  }
  assert.deepEqual(filterCmsCalendarBookings([], "therapist-a"), []);
});

test("calendar filtering preserves input order, objects and data", () => {
  const before = JSON.stringify(bookings);
  const selected = filterCmsCalendarBookings(bookings, "therapist-a");

  assert.equal(selected[0], bookings[0]);
  assert.equal(selected[1], bookings[2]);
  assert.equal(JSON.stringify(bookings), before);
});

test("day appointment and pending counts can use the same filtered scope", () => {
  const selectedDay = filterCmsCalendarBookings(bookings, "therapist-a").filter(
    (booking) => booking.localDate === "2026-09-19",
  );

  assert.equal(selectedDay.length, 1);
  assert.equal(selectedDay.filter((booking) => booking.status === "pending").length, 0);
});

test("calendar links omit empty optional filters", () => {
  assert.equal(cmsCalendarHref("2026-09"), "/cms/calendar?month=2026-09");
  assert.equal(cmsCalendarHref("2026-09", "", ""), "/cms/calendar?month=2026-09");
  assert.equal(
    cmsCalendarHref("2026-09", "2026-09-19"),
    "/cms/calendar?month=2026-09&date=2026-09-19",
  );
});

test("date, month and Today navigation preserve encoded therapist IDs", () => {
  const therapistId = "therapist / A&B+?=ภาษาไทย";
  const navigations = [
    { month: "2026-09", date: "2026-09-20" },
    { month: "2026-10", date: undefined },
    { month: "2026-09", date: "2026-09-19" },
  ];

  for (const { month, date } of navigations) {
    const url = new URL(cmsCalendarHref(month, date, therapistId), "http://localhost");
    assert.equal(url.pathname, "/cms/calendar");
    assert.equal(url.searchParams.get("month"), month);
    assert.equal(url.searchParams.get("date"), date ?? null);
    assert.equal(url.searchParams.get("therapistId"), therapistId);
    assert.equal(url.searchParams.size, date ? 3 : 2);
  }
});

test("unassigned selection survives calendar navigation", () => {
  assert.equal(
    cmsCalendarHref("2026-10", undefined, "unassigned"),
    "/cms/calendar?month=2026-10&therapistId=unassigned",
  );
});
