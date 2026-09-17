import { Temporal } from "@js-temporal/polyfill";

import type { CmsBooking, CmsTherapistRemovedAppointment } from "@/domain/cms/types";

export function captureTherapistRemovedAppointment(
  booking: CmsBooking,
): CmsTherapistRemovedAppointment {
  return {
    assignedStaffId: booking.assignedStaffId,
    serviceName: booking.serviceName,
    durationMinutes: booking.durationMinutes,
    localDate: booking.localDate,
    localTime: booking.localTime,
    timezone: booking.timezone,
  };
}

/** Reject missing legacy snapshots rather than guessing from the latest slot. */
export function readTherapistRemovedAppointment(
  value: unknown,
  targetTeamMemberId: string,
): CmsTherapistRemovedAppointment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.assignedStaffId !== targetTeamMemberId || !targetTeamMemberId ||
    typeof input.serviceName !== "string" || !input.serviceName.trim() ||
    !Number.isSafeInteger(input.durationMinutes) || Number(input.durationMinutes) < 1 ||
    Number(input.durationMinutes) > 1_440 ||
    typeof input.localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.localDate) ||
    typeof input.localTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.localTime) ||
    input.timezone !== "Europe/Dublin") return null;
  try {
    Temporal.PlainDate.from(input.localDate);
  } catch {
    return null;
  }
  return {
    assignedStaffId: targetTeamMemberId,
    serviceName: input.serviceName,
    durationMinutes: Number(input.durationMinutes),
    localDate: input.localDate,
    localTime: input.localTime,
    timezone: input.timezone,
  };
}

/** Use the removed slot for the message, retaining live state for safety checks. */
export function withTherapistRemovedAppointment(
  booking: CmsBooking,
  appointment: CmsTherapistRemovedAppointment,
): CmsBooking {
  return {
    ...booking,
    serviceName: appointment.serviceName,
    durationMinutes: appointment.durationMinutes,
    localDate: appointment.localDate,
    localTime: appointment.localTime,
    timezone: appointment.timezone,
  };
}
