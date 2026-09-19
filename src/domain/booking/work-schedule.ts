import { Temporal } from "@js-temporal/polyfill";

export type ScheduleInterval = {
  readonly id: string;
  readonly startMinute: number;
  readonly endMinute: number;
};

type ScheduleBounds = Pick<ScheduleInterval, "startMinute" | "endMinute">;

const minutesInDay = 24 * 60;
// Keep the displayed workday aligned with the owner-approved booking window
// in availability.ts: appointments may finish one hour after published closing.
const closingExtensionMinutes = 60;

function validInterval(interval: ScheduleBounds): boolean {
  return (
    Number.isInteger(interval.startMinute) &&
    Number.isInteger(interval.endMinute) &&
    interval.startMinute >= 0 &&
    interval.endMinute <= minutesInDay &&
    interval.startMinute < interval.endMinute
  );
}

/** Strict local wall-clock time; 24:00 is accepted only as a day-end boundary. */
export function parseScheduleTime(value: string): number | null {
  if (value === "24:00") return minutesInDay;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatScheduleTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > minutesInDay) {
    return "--:--";
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Use the stored end instant, not wall-clock addition across a DST transition. */
export function scheduleBookingEndLabel(
  endsAt: string,
  localDate: string,
  fallbackEndMinute: number,
): string {
  const fallback = formatScheduleTime(fallbackEndMinute);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return fallback;
  try {
    const appointmentDate = Temporal.PlainDate.from(localDate);
    const end = Temporal.Instant.from(endsAt).toZonedDateTimeISO("Europe/Dublin");
    const endDate = end.toPlainDate();
    const time = formatScheduleTime(end.hour * 60 + end.minute);
    if (endDate.equals(appointmentDate)) return time;
    if (
      endDate.equals(appointmentDate.add({ days: 1 })) &&
      end.hour === 0 && end.minute === 0 && end.second === 0 &&
      end.millisecond === 0 && end.microsecond === 0 && end.nanosecond === 0
    ) {
      return "24:00";
    }
    return `${time} (${endDate.toString()})`;
  } catch {
    return fallback;
  }
}

export function scheduleBookingInterval(
  localTime: string,
  durationMinutes: number,
): ScheduleBounds | null {
  const startMinute = parseScheduleTime(localTime);
  if (
    startMinute === null ||
    startMinute >= minutesInDay ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }
  return {
    startMinute,
    endMinute: Math.min(minutesInDay, startMinute + durationMinutes),
  };
}

/** Match timeline geometry to the stored local end time across clock changes. */
export function scheduleBookingDisplayInterval(
  localTime: string,
  durationMinutes: number,
  endsAt: string,
  localDate: string,
): ScheduleBounds | null {
  const base = scheduleBookingInterval(localTime, durationMinutes);
  if (!base || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return base;
  try {
    const appointmentDate = Temporal.PlainDate.from(localDate);
    const end = Temporal.Instant.from(endsAt).toZonedDateTimeISO("Europe/Dublin");
    const dateOrder = Temporal.PlainDate.compare(end.toPlainDate(), appointmentDate);
    if (dateOrder > 0) return { ...base, endMinute: minutesInDay };
    if (dateOrder < 0) return base;
    const endMinute = end.hour * 60 + end.minute;
    // A repeated fall-back hour cannot be represented twice on this plain-time
    // grid. Retain the positive duration rather than collapsing/reversing a card.
    return endMinute > base.startMinute ? { ...base, endMinute } : base;
  } catch {
    return base;
  }
}

/** Calendar-day bounds, expanded to retain every valid out-of-hours booking. */
export function buildScheduleRange(
  intervals: readonly ScheduleBounds[],
  opens?: string,
  closes?: string,
): ScheduleBounds {
  const opening = parseScheduleTime(opens ?? "");
  const closing = parseScheduleTime(closes ?? "");
  const hasHours = opening !== null && closing !== null && opening < closing;
  let startMinute = hasHours ? opening : 9 * 60;
  let endMinute = hasHours
    ? Math.min(minutesInDay, closing + closingExtensionMinutes)
    : 20 * 60;

  for (const interval of intervals) {
    if (!validInterval(interval)) continue;
    startMinute = Math.min(startMinute, interval.startMinute);
    endMinute = Math.max(endMinute, interval.endMinute);
  }

  return {
    startMinute: Math.floor(startMinute / 60) * 60,
    endMinute: Math.ceil(endMinute / 60) * 60,
  };
}

/** Shared grid rows include every appointment boundary so cards can grow without
 * overlapping later appointments or losing alignment across therapist columns. */
export function buildScheduleRows(
  range: ScheduleBounds,
  intervals: readonly ScheduleBounds[],
): readonly ScheduleBounds[] {
  if (!validInterval(range)) return [];
  const boundaries = new Set([range.startMinute, range.endMinute]);
  for (let minute = Math.ceil(range.startMinute / 15) * 15; minute < range.endMinute; minute += 15) {
    boundaries.add(minute);
  }
  for (const interval of intervals) {
    if (!validInterval(interval)) continue;
    for (const minute of [interval.startMinute, interval.endMinute]) {
      if (minute > range.startMinute && minute < range.endMinute) boundaries.add(minute);
    }
  }
  const minutes = [...boundaries].sort((first, second) => first - second);
  return minutes.slice(0, -1).map((startMinute, index) => ({ startMinute, endMinute: minutes[index + 1] }));
}

/**
 * Greedy interval partitioning: overlapping requests use separate lanes.
 * Every connected overlap group keeps one width; touching end/start times do
 * not overlap. Invalid intervals are omitted, and caller data is never changed.
 */
export function layoutScheduleIntervals<T extends ScheduleInterval>(
  items: readonly T[],
): readonly { readonly item: T; readonly lane: number; readonly laneCount: number }[] {
  const sorted = items.filter(validInterval).sort(
    (first, second) =>
      first.startMinute - second.startMinute ||
      second.endMinute - first.endMinute ||
      first.id.localeCompare(second.id),
  );
  const result: { item: T; lane: number; laneCount: number }[] = [];
  let groupStart = 0;

  while (groupStart < sorted.length) {
    let groupEnd = groupStart + 1;
    let latestEnd = sorted[groupStart].endMinute;
    while (groupEnd < sorted.length && sorted[groupEnd].startMinute < latestEnd) {
      latestEnd = Math.max(latestEnd, sorted[groupEnd].endMinute);
      groupEnd += 1;
    }

    const laneEnds: number[] = [];
    const group: { item: T; lane: number; laneCount: number }[] = [];
    for (let index = groupStart; index < groupEnd; index += 1) {
      const item = sorted[index];
      const freeLane = laneEnds.findIndex((end) => end <= item.startMinute);
      const lane = freeLane === -1 ? laneEnds.length : freeLane;
      laneEnds[lane] = item.endMinute;
      group.push({ item, lane, laneCount: 0 });
    }

    result.push(...group.map((entry) => ({ ...entry, laneCount: laneEnds.length })));
    groupStart = groupEnd;
  }
  return result;
}

/** Sunday through Saturday, using plain dates so DST cannot shift a day. */
export function buildScheduleWeek(selectedDate: string): readonly string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return [];
  try {
    const selected = Temporal.PlainDate.from(selectedDate);
    const sunday = selected.subtract({ days: selected.dayOfWeek % 7 });
    return Array.from({ length: 7 }, (_, day) => sunday.add({ days: day }).toString());
  } catch {
    return [];
  }
}
