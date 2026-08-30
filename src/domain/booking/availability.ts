import { Temporal } from "@js-temporal/polyfill";

import type {
  BookingStatus,
  CmsBookingSettings,
  CmsClosure,
  CmsWeeklyHours,
} from "@/domain/cms/types";

export type AvailabilityOccupancy = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status?:
    | BookingStatus
    | "active"
    | "consumed"
    | "expired"
    | "released";
  readonly expiresAt?: string;
};

export type AvailabilitySlot = {
  readonly slotId: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly localTimeLabel: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly remainingCapacity: number;
  readonly timezone: "Europe/Dublin";
};

export type AvailabilityInput = {
  readonly localDate: string;
  readonly durationMinutes: number;
  readonly settings: CmsBookingSettings;
  readonly weeklyHours: readonly CmsWeeklyHours[];
  readonly closures: readonly CmsClosure[];
  readonly bookings: readonly AvailabilityOccupancy[];
  readonly holds: readonly AvailabilityOccupancy[];
  readonly now?: string;
  readonly enforceWindow?: boolean;
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseMinutes(value: string) {
  if (!timePattern.test(value)) throw new Error("Time must use HH:mm.");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function dublinInstant(localDate: string, localTime: string) {
  if (!datePattern.test(localDate) || !timePattern.test(localTime)) {
    throw new Error("Date and time must use YYYY-MM-DD and HH:mm.");
  }

  const date = Temporal.PlainDate.from(localDate);
  const [hour, minute] = localTime.split(":").map(Number);

  return Temporal.ZonedDateTime.from(
    {
      timeZone: "Europe/Dublin",
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
      minute,
    },
    { disambiguation: "reject" },
  ).toInstant();
}

function overlaps(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function maximumConcurrent(
  start: number,
  end: number,
  occupancy: readonly AvailabilityOccupancy[],
  settings: CmsBookingSettings,
  now: Temporal.Instant,
) {
  const events: { at: number; delta: number }[] = [];

  for (const item of occupancy) {
    if (
      item.status &&
      !["pending", "confirmed", "active"].includes(item.status)
    ) {
      continue;
    }
    if (item.expiresAt && Temporal.Instant.compare(Temporal.Instant.from(item.expiresAt), now) <= 0) {
      continue;
    }

    const itemStart =
      Temporal.Instant.from(item.startsAt).epochMilliseconds -
      settings.bufferBeforeMinutes * 60_000;
    const itemEnd =
      Temporal.Instant.from(item.endsAt).epochMilliseconds +
      settings.bufferAfterMinutes * 60_000;

    if (!overlaps(start, end, itemStart, itemEnd)) continue;

    events.push({ at: Math.max(start, itemStart), delta: 1 });
    events.push({ at: Math.min(end, itemEnd), delta: -1 });
  }

  events.sort((first, second) => first.at - second.at || first.delta - second.delta);
  let current = 0;
  let maximum = 0;

  for (const event of events) {
    current += event.delta;
    maximum = Math.max(maximum, current);
  }

  return maximum;
}

function intersectsClosure(
  localDate: string,
  start: number,
  end: number,
  closures: readonly CmsClosure[],
) {
  for (const closure of closures) {
    if (!closure.active || closure.localDate !== localDate) continue;
    if (closure.closedAllDay) return true;

    try {
      const closureStart = dublinInstant(localDate, closure.startsAtLocal).epochMilliseconds;
      const closureEnd = dublinInstant(localDate, closure.endsAtLocal).epochMilliseconds;
      if (overlaps(start, end, closureStart, closureEnd)) return true;
    } catch {
      return true;
    }
  }

  return false;
}

export function getAvailabilitySlots(input: AvailabilityInput): readonly AvailabilitySlot[] {
  if (!datePattern.test(input.localDate)) return [];
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 240 ||
    !Number.isInteger(input.settings.slotIntervalMinutes) ||
    input.settings.slotIntervalMinutes < 1
  ) {
    return [];
  }

  let date: Temporal.PlainDate;
  let now: Temporal.Instant;

  try {
    date = Temporal.PlainDate.from(input.localDate);
    now = input.now ? Temporal.Instant.from(input.now) : Temporal.Now.instant();
  } catch {
    return [];
  }

  if (input.enforceWindow !== false) {
    const today = now.toZonedDateTimeISO(input.settings.timezone).toPlainDate();
    const latest = today.add({ days: input.settings.bookingHorizonDays });
    if (Temporal.PlainDate.compare(date, today) < 0 || Temporal.PlainDate.compare(date, latest) > 0) {
      return [];
    }
  }

  const hours = input.weeklyHours[date.dayOfWeek - 1];
  if (!hours?.open) return [];

  const openMinutes = parseMinutes(hours.opens);
  const closeMinutes = parseMinutes(hours.closes);
  let openingStart: Temporal.Instant;
  let openingEnd: Temporal.Instant;

  try {
    openingStart = dublinInstant(input.localDate, hours.opens);
    openingEnd = dublinInstant(input.localDate, hours.closes);
  } catch {
    return [];
  }

  const slots: AvailabilitySlot[] = [];
  const occupancy = [...input.bookings, ...input.holds];

  for (
    let candidate = openMinutes;
    candidate + input.durationMinutes <= closeMinutes;
    candidate += input.settings.slotIntervalMinutes
  ) {
    const localTime = formatMinutes(candidate);
    let startsAt: Temporal.Instant;
    let endsAt: Temporal.Instant;

    try {
      startsAt = dublinInstant(input.localDate, localTime);
      endsAt = startsAt.add({ minutes: input.durationMinutes });
    } catch {
      continue;
    }

    const occupiedStart =
      startsAt.epochMilliseconds - input.settings.bufferBeforeMinutes * 60_000;
    const occupiedEnd =
      endsAt.epochMilliseconds + input.settings.bufferAfterMinutes * 60_000;
    if (
      occupiedStart < openingStart.epochMilliseconds ||
      occupiedEnd > openingEnd.epochMilliseconds
    ) continue;
    if (
      input.enforceWindow !== false &&
      startsAt.epochMilliseconds <
        now.epochMilliseconds + input.settings.minimumNoticeMinutes * 60_000
    ) {
      continue;
    }
    if (intersectsClosure(input.localDate, occupiedStart, occupiedEnd, input.closures)) {
      continue;
    }

    const used = maximumConcurrent(
      occupiedStart,
      occupiedEnd,
      occupancy,
      input.settings,
      now,
    );
    const remainingCapacity = input.settings.maxConcurrentBookings - used;
    if (remainingCapacity < 1) continue;

    slots.push({
      slotId: `${input.localDate}T${localTime}`,
      localDate: input.localDate,
      localTime,
      localTimeLabel: new Intl.DateTimeFormat("en-IE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: input.settings.timezone,
      }).format(new Date(startsAt.epochMilliseconds)),
      startsAt: startsAt.toString(),
      endsAt: endsAt.toString(),
      remainingCapacity,
      timezone: input.settings.timezone,
    });
  }

  return slots;
}
