import { Temporal } from "@js-temporal/polyfill";

export const calendarWeekdayLabels = [
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
  "Su",
] as const;

const monthFormatter = new Intl.DateTimeFormat("en-IE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-IE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function plainDate(value: string) {
  try {
    const date = Temporal.PlainDate.from(value);
    return date.year >= 1 && date.toString() === value ? date : null;
  } catch {
    return null;
  }
}

function firstDateOfMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;

  const date = plainDate(`${value}-01`);
  return date?.toString().slice(0, 7) === value ? date : null;
}

export function normalizeCalendarDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? (plainDate(value)?.toString() ?? null)
    : null;
}

export function normalizeCalendarMonth(value: string) {
  return firstDateOfMonth(value)?.toString().slice(0, 7) ?? null;
}

export function monthFromCalendarDate(value: string) {
  return normalizeCalendarDate(value)?.slice(0, 7) ?? "";
}

export function formatCalendarMonth(value: string) {
  const date = firstDateOfMonth(value);
  if (!date) return value;

  return monthFormatter.format(new Date(`${date.toString()}T12:00:00Z`));
}

export function formatCalendarDate(value: string) {
  const date = plainDate(value);
  if (!date) return value;

  return fullDateFormatter.format(new Date(`${date.toString()}T12:00:00Z`));
}

export function shiftCalendarMonth(value: string, amount: number) {
  const date = firstDateOfMonth(value);
  if (!date || !Number.isInteger(amount)) return value;

  const shiftedMonth = date.add({ months: amount }).toString().slice(0, 7);
  return normalizeCalendarMonth(shiftedMonth) ?? value;
}

export function shiftCalendarDate(value: string, amount: number) {
  const date = plainDate(value);
  if (!date || !Number.isInteger(amount)) return value;

  return date.add({ days: amount }).toString();
}

export function buildCalendarMonthCells(value: string) {
  const firstDate = firstDateOfMonth(value);
  if (!firstDate) return [] as readonly (string | null)[];

  const leadingDays = firstDate.dayOfWeek - 1;
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - leadingDays + 1;
    if (day < 1 || day > firstDate.daysInMonth) return null;

    return firstDate.with({ day }).toString();
  });
}

export function calendarMonthRange(value: string) {
  const firstDate = firstDateOfMonth(value);
  if (!firstDate) return null;

  return {
    from: firstDate.toString(),
    to: firstDate.with({ day: firstDate.daysInMonth }).toString(),
  } as const;
}

export function currentCalendarDate(timezone: string) {
  return Temporal.Now.instant().toZonedDateTimeISO(timezone).toPlainDate().toString();
}
