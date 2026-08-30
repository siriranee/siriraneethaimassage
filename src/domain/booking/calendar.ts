import { Temporal } from "@js-temporal/polyfill";

import {
  getAvailabilitySlots,
  type AvailabilityInput,
} from "@/domain/booking/availability";

export const availabilityCalendarDayStates = [
  "available",
  "fully-booked",
  "day-off",
  "unavailable",
  "outside-window",
] as const;

export type AvailabilityCalendarDayState =
  (typeof availabilityCalendarDayStates)[number];

export type AvailabilityCalendarDaySummary = {
  readonly state: AvailabilityCalendarDayState;
  readonly availableSlotCount: number;
};

export type AvailabilityCalendarInput = AvailabilityInput & {
  readonly minimumDate: string;
  readonly maximumDate: string;
};

function plainDate(value: string) {
  try {
    const date = Temporal.PlainDate.from(value);
    return date.toString() === value ? date : null;
  } catch {
    return null;
  }
}

export function classifyAvailabilityCalendarDay(
  input: AvailabilityCalendarInput,
): AvailabilityCalendarDaySummary {
  const date = plainDate(input.localDate);
  const minimumDate = plainDate(input.minimumDate);
  const maximumDate = plainDate(input.maximumDate);

  if (!date || !minimumDate || !maximumDate) {
    return { state: "outside-window", availableSlotCount: 0 };
  }

  if (
    Temporal.PlainDate.compare(date, minimumDate) < 0 ||
    Temporal.PlainDate.compare(date, maximumDate) > 0
  ) {
    return { state: "outside-window", availableSlotCount: 0 };
  }

  const regularHours = input.weeklyHours[date.dayOfWeek - 1];
  const hasAllDayClosure = input.closures.some(
    (closure) =>
      closure.active &&
      closure.localDate === input.localDate &&
      closure.closedAllDay,
  );

  if (!regularHours?.open || hasAllDayClosure) {
    return { state: "day-off", availableSlotCount: 0 };
  }

  const availabilityInput: AvailabilityInput = input;

  const availableSlots = getAvailabilitySlots(availabilityInput);
  if (availableSlots.length) {
    return {
      state: "available",
      availableSlotCount: availableSlots.length,
    };
  }

  const unoccupiedSlots = getAvailabilitySlots({
    ...availabilityInput,
    bookings: [],
    holds: [],
  });

  return {
    state: unoccupiedSlots.length ? "fully-booked" : "unavailable",
    availableSlotCount: 0,
  };
}
