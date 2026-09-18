import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function assertEmailDispatchFollowsSave(route: string, saveFunction: string) {
  const savePosition = route.indexOf(`await ${saveFunction}(`);
  const dispatchPosition = route.indexOf("await dispatchBookingMutationEmails(");
  assert.ok(savePosition >= 0, `Missing awaited ${saveFunction} call`);
  assert.ok(dispatchPosition > savePosition, "Email dispatch must follow the awaited booking save");
  assert.match(route.slice(dispatchPosition), /\.\.\.emails/);
}

test("customer booking requires an eligible therapist and supports profile deep links", async () => {
  const [planner, calendar, bookPage, publicConfig] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/components/booking/BookingCalendar.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/server/booking/public-config.ts"),
  ]);

  assert.match(planner, /name="therapistId"/);
  assert.match(planner, /required/);
  assert.match(planner, /eligibleTherapists/);
  assert.match(planner, /therapist\.serviceIds\.includes\(selectedService\.id\)/);
  assert.match(planner, /therapistId:\s*selectedTherapist\.id/);
  assert.match(planner, /requestedTherapistBySlug\.serviceIds\.includes\(service\.id\)/);
  assert.match(planner, /Choose a therapist before selecting a day and time\./);
  assert.match(calendar, /Choose a therapist to see available days\./);
  assert.match(calendar, /!hasRequiredSelection/);
  assert.match(bookPage, /readonly therapist\?: string \| string\[\]/);
  assert.match(bookPage, /initialTherapistSlug/);
  assert.match(bookPage, /therapists=\{plannerData\.therapists\}/);
  assert.match(publicConfig, /member\.publicProfile/);
  assert.match(publicConfig, /member\.operationalActive/);
  assert.match(publicConfig, /!member\.archived/);
  assert.doesNotMatch(publicConfig, /notificationEmail/);
});

test("public booking accepts only a validated public therapist assignment", async () => {
  const booking = await source("src/server/booking/public-booking.ts");

  for (const field of [
    "assignedStaffId",
    "therapist",
    "staffId",
    "calendarId",
    "price",
    "priceCents",
  ]) {
    assert.match(booking, new RegExp(`"${field}"`));
  }
  assert.match(booking, /text\(source\.therapistId, "therapistId"/);
  assert.match(booking, /member\.id === therapistId/);
  assert.match(booking, /member\.publicProfile/);
  assert.match(booking, /member\.operationalActive/);
  assert.match(booking, /!member\.archived/);
  assert.match(booking, /member\.serviceIds\.includes\(service\.id\)/);
  assert.match(booking, /assignedStaffId:\s*therapist\.id/);
  assert.match(booking, /assignedStaffName:\s*therapist\.name/);
  assert.match(booking, /therapistId:\s*therapist\.id/);
  assert.match(booking, /requestFingerprintHash/);
  assert.match(booking, /privacyNoticeVersion:\s*bookingPrivacyNotice\.version/);
});

test("booking management surfaces support therapist assignment and visibility", async () => {
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

  assert.match(managementSource, /name="therapistId"/);
  assert.match(managementSource, /assignedStaffId/);
  assert.match(managementSource, /assignedStaffName/);
  assert.match(managementSource, /Massage therapist/);
  assert.match(managementSource, /Unassigned/);
});

test("CMS booking views use cards with accessible icon-only status actions", async () => {
  const [bookingsPage, bookingList, bookingDetailPage, dashboardPage, calendarPage, calendar, quickActions, viewStyles] =
    await Promise.all([
      source("src/app/cms/(protected)/bookings/page.tsx"),
      source("src/components/cms/CmsBookingCardList.tsx"),
      source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
      source("src/app/cms/(protected)/page.tsx"),
      source("src/app/cms/(protected)/calendar/page.tsx"),
      source("src/components/cms/CmsCalendar.tsx"),
      source("src/components/cms/CmsBookingQuickActions.tsx"),
      source("src/components/cms/CmsViews.module.css"),
    ]);

  assert.doesNotMatch(bookingsPage, /<table|desktopTable|mobileRecords/);
  assert.match(bookingsPage, /order:\s*"startsAt-desc"/);
  assert.match(bookingsPage, /<CmsBookingCardList key=\{bookingListKey\}>/);
  assert.match(bookingList, /const BOOKING_BATCH_SIZE = 10/);
  assert.match(bookingList, /cards\.slice\(0, shownCount\)/);
  assert.match(bookingList, /current \+ BOOKING_BATCH_SIZE/);
  assert.match(bookingList, /remainingCount > 0/);
  assert.match(bookingList, /aria-controls="cms-booking-grid"/);
  assert.match(bookingList, /className=\{styles\.bookingGrid\}/);
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
  assert.match(quickActions, /Confirm booking \$\{booking\.reference\} and email customer/);
  assert.match(quickActions, /No customer email is recorded/);
  assert.match(quickActions, /Cancel booking \$\{booking\.reference\} and email customer/);
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

test("public booking therapist data excludes private contact details", async () => {
  const [adapter, publicTypes] = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/domain/public-site.ts"),
  ]);

  const publicTeamMapper = adapter.slice(
    adapter.indexOf("export const getPublicTeam"),
    adapter.indexOf("export const getPublicPromotions"),
  );
  assert.match(publicTeamMapper, /member\.publicProfile && !member\.archived/);
  assert.doesNotMatch(publicTeamMapper, /notificationEmail/);
  assert.doesNotMatch(publicTypes, /notificationEmail/);
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
  assert.doesNotMatch(form, /holdMinutes/);
  assert.doesNotMatch(validation, /integer\(source\.holdMinutes/);
  assert.match(validation, /delete currentWithoutLegacyHold\.holdMinutes/);
  assert.match(form, /cancellationCutoffMinutes:\s*settings\.cancellationCutoffMinutes/);
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

test("booking mutations validate therapist assignment and unsafe initial statuses", async () => {
  const service = await source("src/server/cms/booking-service.ts");

  assert.match(service, /status !== "pending" && status !== "confirmed"/);
  assert.match(service, /canTransitionBookingStatus\(current\.status, status\)/);
  for (const field of ["assignedStaffId", "staffId", "therapist"]) {
    assert.match(service, new RegExp(`"${field}"`));
  }
  assert.match(service, /parseBookingInput[\s\S]*?assertNoStaffAssignment\(source\)/);
  assert.match(service, /therapistId:\s*optionalText\(source\.therapistId/);
  assert.match(service, /member\.id === input\.therapistId/);
  assert.match(service, /member\.operationalActive/);
  assert.match(service, /member\.serviceIds\.includes\(input\.serviceId\)/);
  assert.match(service, /assignedStaffId:\s*therapist\?\.id \?\? ""/);
  assert.match(service, /status === "confirmed" && !therapist/);
  assert.match(service, /assignmentChanged/);
  assert.match(service, /confirmingExistingRequest/);
  assert.match(service, /ignoreBookingOccupancy:\s*confirmingExistingRequest/);
});

test("therapist lifecycle checks use a bounded-data future assignment query", async () => {
  const [contentService, repository, mongoRepository] = await Promise.all([
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/repositories/repository.ts"),
    source("src/server/cms/repositories/mongo-repository.ts"),
  ]);

  assert.match(repository, /listFutureActiveTherapistBookings/);
  assert.match(contentService, /transaction\.listFutureActiveTherapistBookings/);
  assert.doesNotMatch(
    contentService,
    /listBookings\(\{ therapistId: memberId \}\)/,
  );

  const futureQuery = mongoRepository.slice(
    mongoRepository.indexOf("async listFutureActiveTherapistBookings"),
    mongoRepository.indexOf("async getBooking", mongoRepository.indexOf("async listFutureActiveTherapistBookings")),
  );
  assert.match(futureQuery, /assignedStaffId: therapistId/);
  assert.match(futureQuery, /endsAt: \{ \$gt: afterIso \}/);
  assert.match(futureQuery, /status: "confirmed"/);
  assert.match(futureQuery, /status: "pending"/);
  assert.match(futureQuery, /projection: \{ _id: 0, reference: 1, serviceId: 1 \}/);
  assert.doesNotMatch(futureQuery, /decodeBooking|customerEncrypted|\.limit\(/);
});

test("customer confirmation email is dispatched after commit with safe CMS feedback and retry controls", async () => {
  const [
    bookingService,
    bookingDetailPage,
    updateRoute,
    createRoute,
    retryRoute,
    notifications,
    quickActions,
    editor,
    adminForm,
    retryButton,
    feedback,
  ] = await Promise.all([
    source("src/server/cms/booking-service.ts"),
    source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
    source("src/app/api/cms/bookings/[bookingId]/route.ts"),
    source("src/app/api/cms/bookings/route.ts"),
    source(
      "src/app/api/cms/bookings/[bookingId]/confirmation-email/route.ts",
    ),
    source("src/server/cms/notification-service.ts"),
    source("src/components/cms/CmsBookingQuickActions.tsx"),
    source("src/components/cms/BookingEditorForm.tsx"),
    source("src/components/cms/AdminBookingForm.tsx"),
    source("src/components/cms/CmsRetryConfirmationEmail.tsx"),
    source("src/domain/booking/confirmation-email.ts"),
  ]);

  assert.match(
    bookingService,
    /await transaction\.saveBooking\(updated, current\.version\);[\s\S]*?recordBookingNotificationPlan\(transaction, updated, notificationKind\)/,
  );
  assert.doesNotMatch(
    bookingService,
    /attemptCustomerBookingConfirmationEmail/,
  );
  assertEmailDispatchFollowsSave(updateRoute, "updateAdminBooking");
  assertEmailDispatchFollowsSave(createRoute, "createAdminBooking");
  assert.match(
    notifications.slice(notifications.indexOf("export async function dispatchBookingMutationEmails")),
    /confirmationEmail[\s\S]*await attemptCustomerBookingConfirmationEmail\(repository, booking/,
  );
  assert.match(adminForm, /"Idempotency-Key": idempotencyKeyRef\.current/);
  assert.match(createRoute, /request\.headers\.get\("idempotency-key"\)/);
  assert.match(
    bookingService,
    /findBookingByIdempotencyHash\([\s\S]*?requestFingerprintHash/,
  );
  assert.match(
    notifications,
    /customerBookingConfirmationEmailNotificationId\(booking\.id\)/,
  );
  assert.match(notifications, /\(repository\.mode === "mock" \|\| booking\.demo\) && !options\.sender/);

  assert.match(retryRoute, /isSameOriginMutation\(request\)/);
  assert.match(retryRoute, /requireCmsApiUser\("bookings:write"\)/);
  assert.match(retryRoute, /getNotification\(/);
  assert.match(retryRoute, /No confirmation email is available to retry/);
  assert.match(retryRoute, /Only a confirmed booking can receive a confirmation email/);
  assert.match(retryButton, /check the Resend dashboard first/i);
  assert.match(retryButton, /response was interrupted\. Check Resend/i);
  assert.match(retryButton, /router\.refresh\(\)/);
  assert.match(retryButton, /method: "POST"/);
  assert.match(quickActions, /customerBookingConfirmationEmailFeedback/);
  assert.match(editor, /customerBookingConfirmationEmailFeedback/);
  assert.match(feedback, /Confirmation email accepted by Resend/);
  assert.match(feedback, /No customer email address was provided/);
  assert.match(feedback, /Email delivery is uncertain/);
  assert.match(feedback, /confirmation email has not been sent yet/i);
  assert.match(quickActions, /and email the customer now/);
  assert.match(editor, /Confirming or cancelling a booking emails the customer/);
  assert.match(adminForm, /Create & confirm booking/);
  assert.match(adminForm, /Creating as Confirmed immediately sends a confirmation email/);
  assert.match(quickActions, /Demo mode will not contact Resend/);
  assert.match(editor, /Demo mode does not contact Resend/);
  assert.match(adminForm, /Creating a confirmed demo booking does not contact Resend/);
  assert.match(
    bookingDetailPage,
    /key=\{`quick-actions:\$\{booking\.id\}:\$\{booking\.version\}`\}/,
  );
  assert.match(
    bookingDetailPage,
    /key=\{`editor:\$\{booking\.id\}:\$\{booking\.version\}`\}/,
  );
});

test("customer cancellation email is dispatched after commit with distinct retry controls", async () => {
  const [
    bookingService,
    bookingDetailPage,
    updateRoute,
    retryRoute,
    notifications,
    quickActions,
    editor,
    retryButton,
    feedback,
  ] = await Promise.all([
    source("src/server/cms/booking-service.ts"),
    source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
    source("src/app/api/cms/bookings/[bookingId]/route.ts"),
    source(
      "src/app/api/cms/bookings/[bookingId]/cancellation-email/route.ts",
    ),
    source("src/server/cms/notification-service.ts"),
    source("src/components/cms/CmsBookingQuickActions.tsx"),
    source("src/components/cms/BookingEditorForm.tsx"),
    source("src/components/cms/CmsRetryConfirmationEmail.tsx"),
    source("src/domain/booking/confirmation-email.ts"),
  ]);

  assert.doesNotMatch(
    bookingService,
    /attemptCustomerBookingCancellationEmail/,
  );
  assertEmailDispatchFollowsSave(updateRoute, "updateAdminBooking");
  assert.match(
    notifications.slice(notifications.indexOf("export async function dispatchBookingMutationEmails")),
    /cancellationEmail[\s\S]*await attemptCustomerBookingCancellationEmail\(repository, booking/,
  );
  assert.match(
    notifications,
    /customerBookingCancellationEmailNotificationId\(booking\.id\)/,
  );
  assert.match(
    notifications,
    /kind === "booking-confirmed" \|\| kind === "booking-cancelled"/,
  );
  assert.match(
    notifications,
    /latest\.status !== "cancelled".*booking-not-cancelled/,
  );

  assert.match(retryRoute, /isSameOriginMutation\(request\)/);
  assert.match(retryRoute, /requireCmsApiUser\("bookings:write"\)/);
  assert.match(retryRoute, /No cancellation email is available to retry/);
  assert.match(
    retryRoute,
    /Only a cancelled booking can receive a cancellation email/,
  );
  assert.match(retryButton, /`\/api\/cms\/bookings\/\$\{bookingId\}\/\$\{kind\}-email`/);
  assert.match(retryButton, /Retry \$\{kind\} email/);
  assert.match(quickActions, /and email the customer now/);
  assert.match(quickActions, /no cancellation email will be sent/i);
  assert.match(editor, /Confirming or cancelling a booking emails the customer/);
  assert.match(feedback, /Cancellation email accepted by Resend/);
  assert.match(feedback, /cancellation email has not been sent yet/i);
  assert.match(bookingDetailPage, /Customer cancellation email/);
  assert.match(
    bookingDetailPage,
    /canRetryBookingEmailNotification\(notification\)/,
  );
  assert.match(bookingDetailPage, /notificationId=\{notification\.id\}/);
});

test("contact handoff resolves service and price from the published snapshot", async () => {
  const resolver = await source("src/server/booking/contact-preference.ts");

  assert.match(resolver, /getPublishedCmsContent/);
  assert.match(resolver, /candidate\.slug === input\.serviceSlug/);
  assert.doesNotMatch(resolver, /candidate\.status/);
  assert.match(resolver, /candidate\.active/);
});

test("booking page uses the custom month calendar and visual time choices", async () => {
  const [planner, plannerStyles, publicAvailability, calendar, calendarStyles, calendarLegend] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/components/booking/BookingPlanner.module.css"),
    source("src/server/booking/public-availability.ts"),
    source("src/components/booking/BookingCalendar.tsx"),
    source("src/components/booking/BookingCalendar.module.css"),
    source("src/components/booking/CalendarLegend.tsx"),
  ]);

  assert.doesNotMatch(planner, /type=["']date["']/i);
  assert.match(planner, /<BookingCalendar/);
  assert.match(planner, /name="preferredTime"/);
  assert.match(planner, /setUnavailableSelectedTime/);
  assert.match(planner, /No longer available/);
  assert.match(planner, /slot\.available \? "available"/);
  assert.match(planner, /unavailableLabel: slot\.available \? "" : "Unavailable"/);
  assert.match(planner, /displayedTimeSlots\.length/);
  assert.match(plannerStyles, /\.timeOptionGhost/);
  assert.match(plannerStyles, /cursor:\s*not-allowed/);
  assert.match(publicAvailability, /const availableSlotIds = new Set/);
  assert.match(publicAvailability, /bookings:\s*\[\]/);
  assert.match(
    publicAvailability,
    /available:\s*availableSlotIds\.has\(slot\.slotId\)/,
  );
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
  assert.match(planner, /Available times for \{selectedTherapist\?\.name/);
  assert.match(planner, /· Dublin time/);
  assert.match(planner, /window\.setInterval\(refreshAvailability, 30_000\)/);
  assert.match(planner, /window\.addEventListener\("focus", refreshAvailability\)/);
  assert.match(planner, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
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
    /listConfirmedBookingOccupancy\([\s\S]*?firstDate\.toString\(\),[\s\S]*?lastDate\.toString\(\)/,
  );
  assert.match(
    availability,
    /listClosures\(firstDate\.toString\(\), lastDate\.toString\(\)\)/,
  );
  assert.doesNotMatch(availability, /listActiveHolds|cmsBookingHolds/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
});
