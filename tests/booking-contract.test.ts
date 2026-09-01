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
    source("src/app/cms/(protected)/page.tsx"),
  ]);
  const managementSource = files.join("\n");

  assert.doesNotMatch(managementSource, /assignedStaffId/);
  assert.doesNotMatch(managementSource, /assigned staff/i);
  assert.doesNotMatch(managementSource, /unassigned/i);
});

test("team profiles remain informational and have no assignment control", async () => {
  const [editor, listing] = await Promise.all([
    source("src/components/cms/TeamEditorForm.tsx"),
    source("src/app/cms/(protected)/team/page.tsx"),
  ]);

  assert.doesNotMatch(editor, /name="operationalActive"/);
  assert.doesNotMatch(listing, /member\.operationalActive/);
  assert.match(editor, /operationalActive:\s*member\.operationalActive/);
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
  for (const gate of [
    "CMS_PUBLIC_BOOKING_READY",
    "CMS_PRIVACY_NOTICE_APPROVED",
    "CMS_BOOKING_NOTIFICATION_READY",
    "CMS_MONITORING_READY",
    "CMS_RECOVERY_DRILL_VERIFIED",
  ]) {
    assert.match(readiness, new RegExp(gate));
  }
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
  assert.match(resolver, /candidate\.status === "published"/);
  assert.match(resolver, /candidate\.active/);
});

test("booking page uses the custom month calendar and visual time choices", async () => {
  const [planner, calendar, calendarStyles] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/components/booking/BookingCalendar.tsx"),
    source("src/components/booking/BookingCalendar.module.css"),
  ]);

  assert.doesNotMatch(planner, /type=["']date["']/i);
  assert.match(planner, /<BookingCalendar/);
  assert.match(planner, /name="preferredTime"/);
  assert.match(calendar, /\/api\/public\/availability\/calendar/);
  assert.match(calendar, /aria-label="Calendar legend"/);
  assert.match(calendar, /Fully booked/);
  assert.match(calendar, /Day off/);
  assert.match(calendar, /aria-current=\{today \? "date"/);
  assert.match(calendarStyles, /grid-template-columns:\s*repeat\(7/);
  assert.match(
    calendarStyles,
    /\.calendarHeader\s*\{[\s\S]*?display:\s*grid;[\s\S]*?justify-items:\s*center/,
  );
  assert.equal((calendarStyles.match(/\.calendarHeader\s*\{/g) ?? []).length, 1);
  assert.match(calendarStyles, /@media \(max-width: 390px\)/);
  assert.match(calendarStyles, /@media \(forced-colors: active\)/);
});

test("booking page keeps customer instructions concise", async () => {
  const [planner, bookPage, calendar, plannerStyles] = await Promise.all([
    source("src/components/booking/BookingPlanner.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/components/booking/BookingCalendar.tsx"),
    source("src/components/booking/BookingPlanner.module.css"),
  ]);
  const bookingCopy = `${bookPage}\n${planner}`;

  assert.match(bookPage, /getPublicPageCopy\("book"\)/);
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
