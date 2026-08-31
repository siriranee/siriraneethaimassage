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

  assert.match(bookPage, /title="Book your massage"/);
  assert.match(bookPage, /description="Choose a treatment, date and time\."/);
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
