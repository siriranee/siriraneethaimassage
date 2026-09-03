import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("customer booking controls never expose therapist selection", async () => {
  const [planner, bookPage, contactPage] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/app/(site)/contact/page.tsx"),
  ]);
  const customerSource = [planner, bookPage, contactPage].join("\n");

  assert.doesNotMatch(customerSource, /name=["']therapist["']/i);
  assert.doesNotMatch(customerSource, /[?&]therapist=/i);
  assert.doesNotMatch(customerSource, /therapist[ -]preference/i);
});

test("public booking rejects privileged fields and stores no staff assignment", async () => {
  const booking = await source("src/server/booking/public-booking.ts");

  for (const field of [
    "assignedStaffId",
    "therapist",
    "therapistId",
    "staffId",
    "calendarId",
    "price",
    "priceCents",
  ]) {
    assert.match(booking, new RegExp(`"${field}"`));
  }
  assert.match(booking, /assignedStaffId:\s*""/);
  assert.match(booking, /requestFingerprintHash/);
  assert.match(booking, /privacyNoticeVersion:\s*bookingPrivacyNotice\.version/);
});

test("booking management surfaces do not offer staff assignment", async () => {
  const files = await Promise.all([
    source("src/components/cms/AdminBookingForm.tsx"),
    source("src/components/cms/BookingEditorForm.tsx"),
    source("src/app/cms/(protected)/bookings/page.tsx"),
    source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
    source("src/app/cms/(protected)/calendar/page.tsx"),
    source("src/components/cms/CmsCalendar.tsx"),
    source("src/app/cms/(protected)/page.tsx"),
  ]);
  const managementSource = files.join("\n");

  assert.doesNotMatch(managementSource, /assignedStaffId/);
  assert.doesNotMatch(managementSource, /assigned staff/i);
  assert.doesNotMatch(managementSource, /unassigned/i);
});

test("CMS booking views use cards with accessible icon-only status actions", async () => {
  const [bookingsPage, bookingDetailPage, dashboardPage, calendarPage, calendar, quickActions, viewStyles] =
    await Promise.all([
      source("src/app/cms/(protected)/bookings/page.tsx"),
      source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
      source("src/app/cms/(protected)/page.tsx"),
      source("src/app/cms/(protected)/calendar/page.tsx"),
      source("src/components/cms/CmsCalendar.tsx"),
      source("src/components/cms/CmsBookingQuickActions.tsx"),
      source("src/components/cms/CmsViews.module.css"),
    ]);

  assert.doesNotMatch(bookingsPage, /<table|desktopTable|mobileRecords/);
  assert.match(bookingsPage, /className=\{styles\.bookingGrid\}/);
  assert.doesNotMatch(dashboardPage, /<table|desktopTable|mobileRecords/);
  assert.match(dashboardPage, /className=\{styles\.bookingGrid\}/);
  assert.match(dashboardPage, /<CmsBookingQuickActions/);
  assert.match(bookingsPage, /<CmsBookingQuickActions/);
  assert.match(bookingDetailPage, /<dt>Status<\/dt>[\s\S]*?<CmsBookingStatus[\s\S]*?<CmsBookingQuickActions/);
  assert.match(bookingDetailPage, /className=\{styles\.bookingDetailStatus\}/);
  assert.match(bookingsPage, /booking\.customer\.phone/);
  assert.match(bookingsPage, /booking\.customer\.notes \|\| "No notes provided"/);
  assert.match(bookingsPage, /canCmsRole\(user\.role, "bookings:write"\)/);
  assert.match(viewStyles, /\.bookingGrid[\s\S]*grid-template-columns:\s*repeat\(3/);
  assert.match(viewStyles, /\.details \.bookingDetailStatus[\s\S]*display:\s*flex/);

  assert.match(calendarPage, /canManageBookings=\{canManageBookings\}/);
  assert.match(calendar, /className=\{styles\.agendaBookingCard\}/);
  assert.match(calendar, /<CmsBookingQuickActions/);
  assert.match(calendar, /booking\.customerPhone/);
  assert.match(calendar, /booking\.customerNotes \|\| "No notes provided"/);
  assert.match(quickActions, /aria-label=\{`Confirm booking \$\{booking\.reference\}`\}/);
  assert.match(quickActions, /aria-label=\{`Cancel booking \$\{booking\.reference\}`\}/);
  assert.match(quickActions, /<Check aria-hidden="true"/);
  assert.match(quickActions, /<X aria-hidden="true"/);
  assert.match(quickActions, /window\.confirm/);
  assert.match(quickActions, /method: "PATCH"/);
  assert.match(quickActions, /changeReason: "other-operational"/);
});

test("booking filters fold safely and administrators can permanently delete a booking", async () => {
  const [bookingsPage, detailPage, deleteButton, route, service, repository, viewStyles] =
    await Promise.all([
      source("src/app/cms/(protected)/bookings/page.tsx"),
      source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
      source("src/components/cms/CmsDeleteBookingButton.tsx"),
      source("src/app/api/cms/bookings/[bookingId]/route.ts"),
      source("src/server/cms/booking-service.ts"),
      source("src/server/cms/repositories/repository.ts"),
      source("src/components/cms/CmsViews.module.css"),
    ]);

  assert.match(bookingsPage, /<details className=\{styles\.searchDisclosure\}/);
  assert.match(bookingsPage, /open=\{hasActiveFilters \|\| undefined\}/);
  assert.match(viewStyles, /\.searchForm[\s\S]*?width:\s*100%/);
  assert.match(viewStyles, /\.searchForm input,[\s\S]*?width:\s*100%/);
  assert.match(viewStyles, /\.searchForm input,[\s\S]*?min-width:\s*0/);
  assert.match(viewStyles, /\.searchForm input,[\s\S]*?box-sizing:\s*border-box/);
  assert.match(viewStyles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);

  assert.match(detailPage, /canCmsRole\(user\.role, "bookings:delete"\)/);
  assert.match(detailPage, /<CmsDeleteBookingButton/);
  assert.match(deleteButton, /window\.confirm/);
  assert.match(deleteButton, /method:\s*"DELETE"/);
  assert.match(deleteButton, /expectedVersion:\s*version/);
  assert.match(route, /requireCmsApiUser\("bookings:delete"\)/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(service, /export async function deleteAdminBooking/);
  assert.match(service, /action:\s*"booking\.deleted"/);
  assert.match(repository, /deleteBooking\(id: string, expectedVersion: number\)/);
});

test("public team profiles remain informational and have no assignment control", async () => {
  const teamPage = await source("src/app/(site)/therapists/page.tsx");

  assert.match(teamPage, /getPublicTeam/);
  assert.doesNotMatch(teamPage, /assignedStaffId|operationalActive/);
  assert.doesNotMatch(teamPage, /name=["']therapist["']|therapist[ -]preference/i);
});

test("booking settings use the API response contract and gate public enablement", async () => {
  const [form, validation, readiness] = await Promise.all([
    source("src/components/cms/BookingSettingsForm.tsx"),
    source("src/server/cms/content-validation.ts"),
    source("src/server/booking/readiness.ts"),
  ]);

  assert.match(form, /bookingSettings\?: CmsBookingSettings/);
  assert.doesNotMatch(form, /settings\?: CmsBookingSettings/);
  assert.match(form, /disabled=\{!canEnablePublicBooking\}/);
  assert.match(form, /holdMinutes:\s*settings\.holdMinutes/);
  assert.match(form, /cancellationCutoffMinutes:\s*settings\.cancellationCutoffMinutes/);
  assert.doesNotMatch(form, /name="holdMinutes"/);
  assert.doesNotMatch(form, /name="cancellationCutoffMinutes"/);
  assert.match(validation, /publicBookingEnabled[\s\S]*?!rulesConfirmed \|\| !openingHoursConfirmed/);
  assert.match(readiness, /getCmsMode\(\) === "mongodb"/);
  assert.match(readiness, /content\.site\.openingHoursConfirmed/);
  assert.match(readiness, /content\.bookingSettings\.rulesConfirmed/);
  assert.match(readiness, /content\.bookingSettings\.publicBookingEnabled/);
  assert.match(readiness, /CMS_PUBLIC_BOOKING_READY/);
  assert.match(readiness, /hasCmsPiiEncryptionKey\(\)/);
  assert.match(readiness, /getResendBookingEmailReadiness\(\)\.ready/);
  assert.doesNotMatch(
    readiness,
    /CMS_(?:PRIVACY_NOTICE_APPROVED|BOOKING_NOTIFICATION_READY|MONITORING_READY|RECOVERY_DRILL_VERIFIED)/,
  );
});

test("booking mutations reject assignment fields and unsafe initial statuses", async () => {
  const service = await source("src/server/cms/booking-service.ts");

  assert.match(service, /status !== "pending" && status !== "confirmed"/);
  assert.match(service, /canTransitionBookingStatus\(current\.status, status\)/);
  for (const field of ["assignedStaffId", "staffId", "therapist", "therapistId"]) {
    assert.match(service, new RegExp(`"${field}"`));
  }
  assert.match(service, /parseBookingInput[\s\S]*?assertNoStaffAssignment\(source\)/);
  assert.match(service, /assignedStaffId:\s*""/);
  assert.doesNotMatch(service, /assignedStaffId:\s*input\./);
});

test("contact handoff resolves service and price from the published snapshot", async () => {
  const resolver = await source("src/server/booking/contact-preference.ts");

  assert.match(resolver, /getPublishedCmsContent/);
  assert.match(resolver, /candidate\.slug === input\.serviceSlug/);
  assert.doesNotMatch(resolver, /candidate\.status/);
  assert.match(resolver, /candidate\.active/);
});

test("booking page uses the custom month calendar and visual time choices", async () => {
  const [planner, calendar, calendarStyles, calendarLegend] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/components/booking/BookingCalendar.tsx"),
    source("src/components/booking/BookingCalendar.module.css"),
    source("src/components/booking/CalendarLegend.tsx"),
  ]);

  assert.doesNotMatch(planner, /type=["']date["']/i);
  assert.match(planner, /<BookingCalendar/);
  assert.match(planner, /name="preferredTime"/);
  assert.match(calendar, /\/api\/public\/availability\/calendar/);
  assert.match(calendar, /<CalendarLegend \/>/);
  assert.match(calendarLegend, /aria-label="Calendar legend"/);
  assert.match(calendarLegend, /Fully booked/);
  assert.match(calendarLegend, /Day off/);
  assert.match(calendar, /aria-current=\{today \? "date"/);
  assert.match(calendar, /today \? styles\.dayToday/);
  assert.match(calendarStyles, /\.dayToday\.dayAvailable:not\(\.daySelected\)/);
  assert.match(calendarStyles, /\.dayToday\.dayOff:not\(\.daySelected\)/);
  assert.match(calendarStyles, /var\(--color-success-surface\)/);
  assert.match(calendarStyles, /grid-template-columns:\s*repeat\(7/);
  assert.match(
    calendarStyles,
    /\.calendarHeader\s*\{[\s\S]*?display:\s*grid;[\s\S]*?justify-items:\s*center/,
  );
  assert.equal((calendarStyles.match(/\.calendarHeader\s*\{/g) ?? []).length, 1);
  assert.match(calendarStyles, /@media \(max-width: 390px\)/);
  assert.match(calendarStyles, /@media \(forced-colors: active\)/);
});

test("CMS calendar mirrors the month picker with operational booking data", async () => {
  const [page, calendar, calendarStyles, closuresPage, newBookingPage, calendarLegend] =
    await Promise.all([
      source("src/app/cms/(protected)/calendar/page.tsx"),
      source("src/components/cms/CmsCalendar.tsx"),
      source("src/components/cms/CmsCalendar.module.css"),
      source("src/app/cms/(protected)/calendar/closures/page.tsx"),
      source("src/app/cms/(protected)/bookings/new/page.tsx"),
      source("src/components/booking/CalendarLegend.tsx"),
    ]);

  assert.match(page, /requireCmsPageUser\("calendar:view"\)/);
  assert.match(
    page,
    /listCmsBookings\(\{\s*from:\s*range\.from,\s*to:\s*range\.to\s*\}\)/,
  );
  assert.match(page, /listCmsClosures\(range\.from, range\.to\)/);
  assert.match(page, /booking\.status !== "cancelled"/);
  assert.match(page, /booking\.status !== "no-show"/);
  assert.doesNotMatch(page, /isPendingCapacityExpired\(booking\)/);
  assert.match(page, /closedWeekdays=\{content\.site\.weeklyHours\.map/);
  assert.match(page, /<CmsCalendar/);
  assert.match(page, /key=\{`\$\{month\}:\$\{selectedDate\}`\}/);
  assert.doesNotMatch(page, /Calendar view|value="week"/);

  assert.match(calendar, /<CalendarLegend>/);
  assert.match(
    calendar,
    /className=\{styles\.operationalKey\}>[\s\S]*?<CalendarLegend>[\s\S]*?Appointments[\s\S]*?Pending[\s\S]*?Partial closure[\s\S]*?<\/CalendarLegend>/,
  );
  assert.doesNotMatch(calendar, /<strong>CMS indicators<\/strong>/);
  assert.doesNotMatch(calendar, /aria-label="CMS calendar indicators"/);
  assert.match(calendar, /BookingCalendar\.module\.css/);
  assert.match(calendarLegend, /aria-label="Calendar legend"/);
  assert.match(calendarLegend, /Available/);
  assert.match(calendarLegend, /Selected/);
  assert.match(calendarLegend, /Fully booked/);
  assert.match(calendarLegend, /Day off/);
  assert.match(calendar, /aria-live="polite"/);
  assert.match(calendar, /aria-current=\{isToday \? "date"/);
  assert.match(calendar, /isToday \? calendarStyles\.dayToday/);
  assert.match(calendar, /aria-pressed=\{selected\}/);
  assert.match(calendar, /window\.history\.replaceState/);
  assert.match(calendar, /onClick=\{\(\) => selectDate\(today\)\}/);
  assert.match(calendar, /Block this day/);
  assert.match(calendar, /Appointments/);
  assert.match(calendar, /Pending/);
  assert.match(calendar, /Partial closure/);
  assert.match(calendar, /isRegularDayOff/);
  assert.match(calendar, /Closed in the weekly business hours\./);
  assert.match(
    calendarStyles,
    /\.agendaBookingMain\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.equal(
    (calendarStyles.match(/\.agendaBookingMain\s*\{/g) ?? []).length,
    1,
  );
  assert.match(calendar, /\/cms\/bookings\/new\?date=\$\{selectedDate\}/);
  assert.match(calendar, /\/cms\/calendar\/closures\/\$\{closure\.id\}\/edit/);
  assert.doesNotMatch(calendarStyles, /\.legend(?:\s|\{)/);
  assert.match(calendarStyles, /@media \(max-width: 390px\)/);
  assert.match(calendarStyles, /@media \(forced-colors: active\)/);
  assert.match(closuresPage, /normalizeCalendarDate/);
  assert.match(closuresPage, /href=\{calendarHref\}/);
  assert.match(
    closuresPage,
    /defaultDate=\{requestedDate \?\? tomorrowInDublin\(\)\}/,
  );
  assert.match(newBookingPage, /normalizeCalendarDate/);
  assert.match(
    newBookingPage,
    /defaultDate=\{requestedDate \?\? nextDublinDate\(\)\}/,
  );
});

test("booking page uses static copy and keeps customer instructions concise", async () => {
  const [planner, bookPage, pageCopy, calendar, plannerStyles] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/content/page-copy.ts"),
    source("src/components/booking/BookingCalendar.tsx"),
    source("src/components/booking/BookingPlanner.module.css"),
  ]);
  const bookingCopy = `${bookPage}\n${planner}`;

  assert.match(bookPage, /getPageCopy\("book"\)/);
  assert.match(bookPage, /\.\.\.pageHeroImages\.book/);
  assert.match(pageCopy, /book:\s*\{/);
  assert.doesNotMatch(bookPage, /getPublicPageCopy|getPublishedCmsContent/);
  assert.match(bookPage, /title=\{pageCopy\.title\}/);
  assert.match(bookPage, /description=\{pageCopy\.description\}/);
  assert.match(planner, />Choose your appointment</);
  assert.match(planner, />Treatment</);
  assert.match(planner, />Duration</);
  assert.match(planner, />Date &amp; time</);
  assert.match(planner, />Available times · Dublin time</);
  assert.doesNotMatch(planner, /<small>Dublin time<\/small>/);
  assert.doesNotMatch(planner, /styles\.journey/);
  assert.doesNotMatch(planner, /stepNumber/);
  assert.doesNotMatch(planner, /noticeIcon/);
  assert.doesNotMatch(calendar, /dayStatus|shortStateLabel|todayDot/);
  assert.match(
    plannerStyles,
    /\.fieldset legend\s*\{[\s\S]*?float:\s*left/,
  );
  assert.match(
    plannerStyles,
    /\.plannerGrid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.equal((plannerStyles.match(/\.plannerGrid\s*\{/g) ?? []).length, 1);
  assert.match(
    plannerStyles,
    /\.appointmentPicker\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.equal(
    (plannerStyles.match(/\.appointmentPicker\s*\{/g) ?? []).length,
    1,
  );
  assert.match(
    plannerStyles,
    /@media \(min-width: 641px\)\s*\{[\s\S]*?\.primaryAction\s*\{[\s\S]*?max-width:\s*32rem/,
  );

  for (const retiredCopy of [
    "Your visit, your pace",
    "Review your preferences",
    "Choose the massage that best suits your visit.",
    "Prices update with the treatment length.",
    "Fully booked and blocked times are removed automatically.",
  ]) {
    assert.ok(!bookingCopy.includes(retiredCopy), `Retired copy remains: ${retiredCopy}`);
  }
});

test("month availability uses one bounded repository read per operational source", async () => {
  const [availability, route] = await Promise.all([
    source("src/server/booking/public-availability.ts"),
    source("src/app/api/public/availability/calendar/route.ts"),
  ]);

  assert.match(
    availability,
    /listBookingOccupancy\(firstDate\.toString\(\), lastDate\.toString\(\)\)/,
  );
  assert.match(
    availability,
    /listClosures\(firstDate\.toString\(\), lastDate\.toString\(\)\)/,
  );
  assert.match(availability, /listActiveHolds\(now\.toString\(\)\)/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
});
