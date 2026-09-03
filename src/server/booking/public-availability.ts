import "server-only";

import { Temporal } from "@js-temporal/polyfill";

import { classifyAvailabilityCalendarDay } from "@/domain/booking/calendar";
import { getAvailabilitySlots } from "@/domain/booking/availability";
import { isLivePublicBookingReady } from "@/server/booking/readiness";
import { getCmsMode } from "@/server/cms/config";
import { getPublishedCmsContent } from "@/server/cms/content-service";
import { getCmsRepository } from "@/server/cms/repositories";

export type PublicAvailabilityStatus = "disabled" | "planning" | "live";

function currentDublinDate() {
  return Temporal.Now.instant()
    .toZonedDateTimeISO("Europe/Dublin")
    .toPlainDate();
}

function parseMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;

  try {
    const firstDate = Temporal.PlainDate.from(`${value}-01`);
    return firstDate.toString().slice(0, 7) === value ? firstDate : null;
  } catch {
    return null;
  }
}

export async function getPublicAvailability(input: {
  readonly serviceId: string;
  readonly durationMinutes: number;
  readonly localDate: string;
}) {
  const mode = getCmsMode();

  if (mode === "disabled") {
    return {
      status: "disabled" as const,
      message: "Online date and time availability is not configured yet.",
      slots: [],
    };
  }

  const repository = getCmsRepository();
  const content = await getPublishedCmsContent();
  const service = content.services.find(
    (item) => item.id === input.serviceId,
  );
  const price = service?.prices.find(
    (item) =>
      item.durationMinutes === input.durationMinutes &&
      item.active,
  );

  if (!service || !price || !/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    return {
      status: mode === "mock" ? "planning" as const : "disabled" as const,
      message: "Choose a published treatment, duration and valid date.",
      slots: [],
    };
  }

  const liveReady = isLivePublicBookingReady(content);

  if (mode === "mongodb" && !liveReady) {
    return {
      status: "disabled" as const,
      message: "Contact the Siriranee team to confirm a date and time.",
      slots: [],
    };
  }

  const [bookings, holds, closures] = await Promise.all([
    repository.listBookingOccupancy(input.localDate, input.localDate),
    repository.listActiveHolds(new Date().toISOString()),
    repository.listClosures(input.localDate, input.localDate),
  ]);
  const slots = getAvailabilitySlots({
    localDate: input.localDate,
    durationMinutes: input.durationMinutes,
    settings: content.bookingSettings,
    weeklyHours: content.site.weeklyHours,
    closures,
    bookings,
    holds,
  }).map((slot) => ({
    slotId: slot.slotId,
    localDate: slot.localDate,
    localTime: slot.localTime,
    localTimeLabel: slot.localTimeLabel,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    timezone: slot.timezone,
  }));

  return {
    status: liveReady ? "live" as const : "planning" as const,
    message: liveReady
      ? "Available appointment times"
      : "Local booking preview only. The spa must still confirm your request.",
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: price.durationMinutes,
      priceCents: price.priceCents,
      currency: "EUR" as const,
    },
    slots,
  };
}

export async function getPublicAvailabilityCalendar(input: {
  readonly serviceId: string;
  readonly durationMinutes: number;
  readonly month: string;
}) {
  const mode = getCmsMode();
  const fallbackMinimumDate = currentDublinDate().toString();

  if (mode === "disabled") {
    return {
      status: "disabled" as const,
      message: "Online availability is not configured yet. Please check again later.",
      month: input.month,
      minimumDate: fallbackMinimumDate,
      maximumDate: fallbackMinimumDate,
      days: [],
    };
  }

  const repository = getCmsRepository();
  const content = await getPublishedCmsContent();
  const service = content.services.find(
    (item) => item.id === input.serviceId,
  );
  const price = service?.prices.find(
    (item) =>
      item.durationMinutes === input.durationMinutes &&
      item.active,
  );
  const firstDate = parseMonth(input.month);
  const now = Temporal.Now.instant();
  const minimumDate = now
    .toZonedDateTimeISO(content.bookingSettings.timezone)
    .toPlainDate();
  const maximumDate = minimumDate.add({
    days: content.bookingSettings.bookingHorizonDays,
  });
  const liveReady = isLivePublicBookingReady(content);
  const status = liveReady ? "live" as const : "planning" as const;

  if (!service || !price || !firstDate) {
    return {
      status,
      message: "Choose a published treatment, duration and valid calendar month.",
      month: input.month,
      minimumDate: minimumDate.toString(),
      maximumDate: maximumDate.toString(),
      days: [],
    };
  }

  if (mode === "mongodb" && !liveReady) {
    return {
      status: "disabled" as const,
      message: "Contact the Siriranee team to choose an available date.",
      month: input.month,
      minimumDate: minimumDate.toString(),
      maximumDate: maximumDate.toString(),
      days: [],
    };
  }

  const lastDate = firstDate.with({ day: firstDate.daysInMonth });
  const [bookings, holds, closures] = await Promise.all([
    repository.listBookingOccupancy(firstDate.toString(), lastDate.toString()),
    repository.listActiveHolds(now.toString()),
    repository.listClosures(firstDate.toString(), lastDate.toString()),
  ]);

  const days = Array.from({ length: firstDate.daysInMonth }, (_, index) => {
    const localDate = firstDate.add({ days: index }).toString();
    const summary = classifyAvailabilityCalendarDay({
      localDate,
      durationMinutes: input.durationMinutes,
      settings: content.bookingSettings,
      weeklyHours: content.site.weeklyHours,
      closures,
      bookings,
      holds,
      now: now.toString(),
      minimumDate: minimumDate.toString(),
      maximumDate: maximumDate.toString(),
    });
    const allDayClosure = closures.find(
      (closure) =>
        closure.active &&
        closure.closedAllDay &&
        closure.localDate === localDate,
    );
    const label =
      summary.state === "available"
        ? `${summary.availableSlotCount} appointment ${summary.availableSlotCount === 1 ? "time" : "times"} available`
        : summary.state === "fully-booked"
          ? "Fully booked"
          : summary.state === "day-off"
            ? allDayClosure?.publicLabel.trim() || "Day off"
            : summary.state === "unavailable"
              ? "No appointment times"
              : "Outside the booking window";

    return {
      localDate,
      state: summary.state,
      label,
      availableSlotCount: summary.availableSlotCount,
    };
  });

  return {
    status,
    message: liveReady
      ? "Live appointment availability in Dublin time."
      : "Booking calendar preview. The Siriranee team must still confirm your appointment.",
    month: input.month,
    minimumDate: minimumDate.toString(),
    maximumDate: maximumDate.toString(),
    days,
  };
}
