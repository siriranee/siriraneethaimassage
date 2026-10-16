export function filterCmsCalendarBookings<
  T extends { readonly assignedStaffId: string },
>(bookings: readonly T[], therapistId: string): readonly T[] {
  if (!therapistId) return bookings;

  return bookings.filter((booking) =>
    therapistId === "unassigned"
      ? !booking.assignedStaffId.trim()
      : booking.assignedStaffId === therapistId,
  );
}

export function cmsCalendarHref(
  month: string,
  date?: string,
  therapistId?: string,
): string {
  const params = new URLSearchParams({ month });
  if (date) params.set("date", date);
  if (therapistId) params.set("therapistId", therapistId);
  return `/cms/calendar?${params.toString()}`;
}

/** All view retains individual blocks without treating them as shop closures. */
export function filterCmsCalendarClosures<T extends { readonly therapistId?: string }>(
  closures: readonly T[],
  therapistId: string,
): readonly T[] {
  return therapistId
    ? closures.filter((closure) => !closure.therapistId || closure.therapistId === therapistId)
    : closures;
}

export function isTherapistWeeklyDayOff(localDate: string, weeklyDaysOff: readonly number[] = []) {
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  return weeklyDaysOff.includes(weekday === 0 ? 7 : weekday);
}
