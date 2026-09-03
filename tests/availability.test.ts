import assert from "node:assert/strict";
import test from "node:test";

import { classifyAvailabilityCalendarDay } from "@/domain/booking/calendar";
import {
  buildCalendarMonthCells,
  calendarMonthRange,
  monthFromCalendarDate,
  normalizeCalendarDate,
  normalizeCalendarMonth,
  shiftCalendarDate,
  shiftCalendarMonth,
} from "@/domain/booking/calendar-month";
import { getAvailabilitySlots } from "@/domain/booking/availability";
import type {
  CmsBookingSettings,
  CmsClosure,
  CmsWeeklyHours,
} from "@/domain/cms/types";

const days: readonly CmsWeeklyHours["day"][] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

test("calendar month helpers reject invalid dates and build a Monday-first grid", () => {
  assert.equal(normalizeCalendarMonth("2024-02"), "2024-02");
  assert.equal(normalizeCalendarMonth("2024-13"), null);
  assert.equal(normalizeCalendarMonth("2024-2"), null);
  assert.equal(normalizeCalendarDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeCalendarDate("2023-02-29"), null);
  assert.equal(monthFromCalendarDate("2024-02-29"), "2024-02");
  assert.equal(monthFromCalendarDate("2024-02-30"), "");
  assert.equal(shiftCalendarDate("2026-10-25", 1), "2026-10-26");
  assert.equal(shiftCalendarDate("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftCalendarDate("2024-02-30", 1), "2024-02-30");
  assert.equal(shiftCalendarMonth("2024-01", -1), "2023-12");
  assert.deepEqual(calendarMonthRange("2024-02"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });

  const cells = buildCalendarMonthCells("2024-02");
  assert.equal(cells.length, 42);
  assert.equal(cells[0], null);
  assert.equal(cells[2], null);
  assert.equal(cells[3], "2024-02-01");
  assert.equal(cells[31], "2024-02-29");
  assert.equal(cells[32], null);
});

function settings(
  overrides: Partial<CmsBookingSettings> = {},
): CmsBookingSettings {
  return {
    timezone: "Europe/Dublin",
    currency: "EUR",
    publicBookingEnabled: false,
    rulesConfirmed: true,
    slotIntervalMinutes: 30,
    maxConcurrentBookings: 1,
    minimumNoticeMinutes: 0,
    bookingHorizonDays: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    holdMinutes: 10,
    cancellationCutoffMinutes: 1440,
    provisionalNotice: "",
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function weeklyHours(
  opens = "10:00",
  closes = "14:00",
): readonly CmsWeeklyHours[] {
  return days.map((day) => ({ day, open: true, opens, closes }));
}

function closure(overrides: Partial<CmsClosure> = {}): CmsClosure {
  return {
    id: "closure-1",
    localDate: "2026-06-01",
    closedAllDay: true,
    startsAtLocal: "",
    endsAtLocal: "",
    reason: "Private closure reason",
    publicLabel: "Day off",
    active: true,
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    updatedBy: "test",
    ...overrides,
  };
}

function slots(
  overrides: Partial<Parameters<typeof getAvailabilitySlots>[0]> = {},
) {
  return getAvailabilitySlots({
    localDate: "2026-06-01",
    durationMinutes: 60,
    settings: settings(),
    weeklyHours: weeklyHours(),
    closures: [],
    bookings: [],
    holds: [],
    now: "2026-05-01T10:00:00Z",
    enforceWindow: false,
    ...overrides,
  });
}

test("fully booked overlapping slots are removed", () => {
  const result = slots({
    bookings: [
      {
        startsAt: "2026-06-01T09:00:00Z",
        endsAt: "2026-06-01T10:00:00Z",
        status: "confirmed",
      },
    ],
  });

  assert.deepEqual(
    result.map((slot) => slot.localTime),
    ["11:00", "11:30", "12:00", "12:30", "13:00"],
  );
});

test("remaining capacity is reported when concurrent capacity is greater than one", () => {
  const result = slots({
    settings: settings({ maxConcurrentBookings: 2 }),
    bookings: [
      {
        startsAt: "2026-06-01T09:00:00Z",
        endsAt: "2026-06-01T10:00:00Z",
        status: "confirmed",
      },
    ],
  });

  assert.equal(
    result.find((slot) => slot.localTime === "10:00")?.remainingCapacity,
    1,
  );
});

test("partial and all-day closures remove intersecting slots", () => {
  const partial: CmsClosure = {
    id: "closure-1",
    localDate: "2026-06-01",
    closedAllDay: false,
    startsAtLocal: "11:00",
    endsAtLocal: "12:00",
    reason: "Private appointment",
    publicLabel: "Unavailable",
    active: true,
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    updatedBy: "test",
  };

  assert.deepEqual(
    slots({ closures: [partial] }).map((slot) => slot.localTime),
    ["10:00", "12:00", "12:30", "13:00"],
  );
  assert.equal(
    slots({ closures: [{ ...partial, closedAllDay: true }] }).length,
    0,
  );
});

test("expired pending capacity is ignored while an active hold blocks the slot", () => {
  const expired = slots({
    now: "2026-06-01T08:00:00Z",
    bookings: [
      {
        startsAt: "2026-06-01T09:00:00Z",
        endsAt: "2026-06-01T10:00:00Z",
        status: "pending",
        expiresAt: "2026-06-01T07:59:59Z",
      },
    ],
  });
  const active = slots({
    now: "2026-06-01T08:00:00Z",
    bookings: [
      {
        startsAt: "2026-06-01T09:00:00Z",
        endsAt: "2026-06-01T10:00:00Z",
        status: "pending",
        expiresAt: "2026-06-01T08:10:00Z",
      },
    ],
  });

  assert.ok(expired.some((slot) => slot.localTime === "10:00"));
  assert.ok(!active.some((slot) => slot.localTime === "10:00"));
});

test("buffers, notice windows and booking horizon are enforced", () => {
  const buffered = slots({
    settings: settings({ bufferAfterMinutes: 30 }),
    bookings: [
      {
        startsAt: "2026-06-01T10:00:00Z",
        endsAt: "2026-06-01T11:00:00Z",
        status: "confirmed",
      },
    ],
  });
  assert.ok(!buffered.some((slot) => slot.localTime === "10:00"));

  const notice = slots({
    now: "2026-06-01T09:00:00Z",
    enforceWindow: true,
    settings: settings({ minimumNoticeMinutes: 120, bookingHorizonDays: 2 }),
  });
  assert.ok(!notice.some((slot) => slot.localTime === "11:30"));
  assert.ok(notice.some((slot) => slot.localTime === "12:00"));

  assert.equal(
    slots({
      localDate: "2026-06-04",
      now: "2026-06-01T09:00:00Z",
      enforceWindow: true,
      settings: settings({ bookingHorizonDays: 2 }),
    }).length,
    0,
  );
});

test("treatment duration remains elapsed time across the Dublin DST jump", () => {
  const result = slots({
    localDate: "2026-03-29",
    durationMinutes: 90,
    weeklyHours: weeklyHours("00:00", "04:00"),
  });

  assert.ok(result.length > 0);
  for (const slot of result) {
    assert.equal(Date.parse(slot.endsAt) - Date.parse(slot.startsAt), 90 * 60_000);
  }
});

test("ambiguous opening boundaries fail closed", () => {
  assert.equal(
    slots({
      localDate: "2026-10-25",
      weeklyHours: weeklyHours("01:30", "03:30"),
    }).length,
    0,
  );
});

test("calendar marks regular closed weekdays and all-day closures as days off", () => {
  const mondayClosed = weeklyHours().map((entry, index) =>
    index === 0 ? { ...entry, open: false } : entry,
  );
  const base = {
    localDate: "2026-06-01",
    durationMinutes: 60,
    settings: settings(),
    weeklyHours: mondayClosed,
    closures: [],
    bookings: [],
    holds: [],
    now: "2026-05-01T10:00:00Z",
    minimumDate: "2026-05-01",
    maximumDate: "2026-06-30",
  } as const;

  assert.equal(classifyAvailabilityCalendarDay(base).state, "day-off");
  assert.equal(
    classifyAvailabilityCalendarDay({
      ...base,
      weeklyHours: weeklyHours(),
      closures: [closure()],
    }).state,
    "day-off",
  );
});

test("calendar distinguishes available, fully booked and outside-window days", () => {
  const base = {
    localDate: "2026-06-01",
    durationMinutes: 60,
    settings: settings(),
    weeklyHours: weeklyHours("10:00", "11:00"),
    closures: [],
    bookings: [],
    holds: [],
    now: "2026-05-01T10:00:00Z",
    minimumDate: "2026-05-01",
    maximumDate: "2026-06-30",
  } as const;

  assert.deepEqual(classifyAvailabilityCalendarDay(base), {
    state: "available",
    availableSlotCount: 1,
  });
  assert.equal(
    classifyAvailabilityCalendarDay({
      ...base,
      bookings: [
        {
          startsAt: "2026-06-01T09:00:00Z",
          endsAt: "2026-06-01T10:00:00Z",
          status: "confirmed",
        },
      ],
    }).state,
    "fully-booked",
  );
  assert.equal(
    classifyAvailabilityCalendarDay({
      ...base,
      localDate: "2026-07-01",
    }).state,
    "outside-window",
  );
});

test("calendar keeps partially open days available and labels no-slot days unavailable", () => {
  const base = {
    localDate: "2026-06-01",
    durationMinutes: 60,
    settings: settings(),
    weeklyHours: weeklyHours(),
    closures: [
      closure({
        closedAllDay: false,
        startsAtLocal: "11:00",
        endsAtLocal: "12:00",
      }),
    ],
    bookings: [],
    holds: [],
    now: "2026-05-01T10:00:00Z",
    minimumDate: "2026-05-01",
    maximumDate: "2026-06-30",
  } as const;

  assert.equal(classifyAvailabilityCalendarDay(base).state, "available");
  assert.equal(
    classifyAvailabilityCalendarDay({
      ...base,
      closures: [],
      settings: settings({ minimumNoticeMinutes: 240 }),
      weeklyHours: weeklyHours("10:00", "11:00"),
      now: "2026-06-01T09:30:00Z",
      minimumDate: "2026-06-01",
    }).state,
    "unavailable",
  );
});
