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
