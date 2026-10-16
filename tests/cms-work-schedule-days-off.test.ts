import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import type { CmsCalendarBooking, CmsCalendarClosure, CmsCalendarTherapist } from "../src/components/cms/CmsCalendar";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier.endsWith(".module.css")
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/css-module-names-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

const therapists: readonly CmsCalendarTherapist[] = [
  { id: "therapist-a", name: "Therapist A", imageUrl: "", imageAlt: "" },
  { id: "therapist-b", name: "Therapist B", imageUrl: "", imageAlt: "" },
];
const date = "2026-10-16"; // Friday, ISO weekday 5.
const closure: CmsCalendarClosure = {
  id: "time-off", localDate: date, closedAllDay: false,
  startsAtLocal: "12:00", endsAtLocal: "13:00", reason: "Appointment", publicLabel: "",
};
const booking: CmsCalendarBooking = {
  id: "existing-booking", reference: "TEST-EXISTING", assignedStaffId: "therapist-a",
  therapistName: "Therapist A", customerName: "Test Customer", customerPhone: "", customerEmail: "",
  serviceName: "Test Treatment", durationMinutes: 60, priceCents: 6500,
  localDate: date, localTime: "12:00", endsAt: "2026-10-16T12:00:00.000Z", status: "confirmed",
};

async function render(input: {
  closures?: readonly CmsCalendarClosure[];
  therapists?: readonly CmsCalendarTherapist[];
  bookings?: readonly CmsCalendarBooking[];
  date?: string;
  shopOpen?: boolean;
  canManageTeam?: boolean;
} = {}) {
  const { CmsWorkSchedule } = await import("../src/components/cms/CmsWorkSchedule");
  return renderToStaticMarkup(createElement(CmsWorkSchedule, {
    date: input.date ?? date,
    therapists: input.therapists ?? therapists,
    closures: input.closures ?? [],
    bookings: input.bookings ?? [],
    hours: { day: "Friday", open: input.shopOpen ?? true, opens: "10:00", closes: "18:00" },
    canManageTeam: input.canManageTeam,
  }));
}

test("partial therapist blocks render only in the selected therapist's column", async () => {
  const html = await render({ closures: [{ ...closure, therapistId: "therapist-a" }] });
  assert.equal((html.match(/class="closureBlock"/g) ?? []).length, 1);
  assert.match(html, /aria-label="Therapist A: therapist blocked 12:00 to 13:00, Appointment"/);
  assert.doesNotMatch(html, /Therapist B: therapist blocked|class="allDayBlocked"|Shop closed/);
});

test("legacy and explicitly whole-shop partial blocks remain visible in every column", async () => {
  for (const therapistId of [undefined, ""]) {
    const html = await render({ closures: [{ ...closure, therapistId }] });
    assert.equal((html.match(/class="closureBlock"/g) ?? []).length, 2);
    assert.match(html, /aria-label="Therapist A: shop blocked/);
    assert.match(html, /aria-label="Therapist B: shop blocked/);
  }
});

test("a therapist day off stripes only their column and provides an edit/reopen action", async () => {
  const html = await render({ closures: [{ ...closure, therapistId: "therapist-a", closedAllDay: true }], bookings: [booking] });
  assert.equal((html.match(/class="allDayBlocked"/g) ?? []).length, 1);
  assert.match(html, /aria-label="Therapist A: day off, Appointment\. Edit or reopen this day\."/);
  assert.match(html, /href="\/cms\/calendar\/closures\/time-off\/edit\?date=2026-10-16"/);
  assert.match(html, /href="\/cms\/bookings\/existing-booking"/);
  assert.doesNotMatch(html, /Therapist B: day off|Shop closed/);
});

test("weekly days off use ISO weekdays and preserve appointments", async () => {
  const team = [{ ...therapists[0], weeklyDaysOff: [5, 7] }, therapists[1]];
  for (const selectedDate of [date, "2026-10-18"]) {
    const html = await render({ date: selectedDate, therapists: team, bookings: [booking], canManageTeam: true });
    assert.equal((html.match(/class="allDayBlocked"/g) ?? []).length, 1);
    assert.match(html, /href="\/cms\/team\/therapist-a\/edit#weekly-days-off"/);
    assert.match(html, /aria-label="Therapist A: weekly day off\. Edit weekly days off\."/);
    assert.match(html, /href="\/cms\/bookings\/existing-booking"/);
    assert.doesNotMatch(html, /Therapist B: weekly day off|Shop closed/);
  }
  const workingDay = await render({ date: "2026-10-17", therapists: team });
  assert.doesNotMatch(workingDay, /class="allDayBlocked"|Weekly day off/);
});

test("staff can see weekly days off without an unavailable team-edit action", async () => {
  const html = await render({ therapists: [{ ...therapists[0], weeklyDaysOff: [5] }, therapists[1]] });
  assert.match(html, /aria-label="Therapist A: weekly day off"/);
  assert.doesNotMatch(html, /href="\/cms\/team\//);
});

test("whole-shop days off still stripe every column and retain the reopening action", async () => {
  const html = await render({ closures: [{ ...closure, closedAllDay: true }], bookings: [booking] });
  assert.equal((html.match(/class="allDayBlocked"/g) ?? []).length, 2);
  assert.match(html, /Shop closed — Appointment/);
  assert.match(html, /Edit \/ reopen shop/);
  assert.match(html, /href="\/cms\/bookings\/existing-booking"/);
  const weeklyShopClosure = await render({ shopOpen: false });
  assert.equal((weeklyShopClosure.match(/class="allDayBlocked"/g) ?? []).length, 2);
});

test("a filtered-out therapist's day off never marks visible columns closed", async () => {
  const html = await render({ therapists: [therapists[1]], closures: [{ ...closure, therapistId: "therapist-a", closedAllDay: true }] });
  assert.doesNotMatch(html, /class="allDayBlocked"|Edit \/ reopen|Shop closed/);
});

async function renderCalendar(input: {
  selectedTherapistId?: string;
  closures?: readonly CmsCalendarClosure[];
  therapists?: readonly CmsCalendarTherapist[];
  canManageTeam?: boolean;
  canManageCalendar?: boolean;
  selectedDate?: string;
  initialDate?: string;
} = {}) {
  const { CmsCalendar } = await import("../src/components/cms/CmsCalendar");
  const params = new URLSearchParams({ month: "2026-10", date: input.selectedDate ?? date });
  if (input.selectedTherapistId) params.set("therapistId", input.selectedTherapistId);
  return renderToStaticMarkup(createElement(SearchParamsContext.Provider, { value: params },
    createElement(CmsCalendar, {
      month: "2026-10", today: date, initialSelectedDate: input.initialDate ?? date,
      bookings: [], emailAttention: [], closures: input.closures ?? [],
      therapists: input.therapists ?? therapists.map((therapist) => ({ ...therapist, canBlock: true })),
      canManageBookings: true, canManageCalendar: input.canManageCalendar ?? true,
      canManageTeam: input.canManageTeam ?? true, closedWeekdays: Array(7).fill(false),
      weeklyHours: (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const).map((day) => ({
        day, open: true, opens: "10:00", closes: "18:00",
      })),
    })));
}

test("month view distinguishes individual days off from a whole-business closure", async () => {
  const scoped = { ...closure, closedAllDay: true, therapistId: "therapist-a" };
  const all = await renderCalendar({ closures: [scoped] });
  assert.match(all, /aria-label="Friday 16 October 2026 — no appointments, 1 therapist off, selected"/);
  const selected = await renderCalendar({ selectedTherapistId: "therapist-a", closures: [scoped] });
  assert.match(selected, /aria-label="Friday 16 October 2026 — no appointments, Day off, selected"/);
  const other = await renderCalendar({ selectedTherapistId: "therapist-b", closures: [scoped] });
  assert.match(other, /aria-label="Friday 16 October 2026 — no appointments, selected"/);
  assert.doesNotMatch(other, /Days off and blocked time for this date/);
});

test("calendar weekly and temporary days off count each therapist only once", async () => {
  const html = await renderCalendar({
    therapists: [{ ...therapists[0], weeklyDaysOff: [5], canBlock: true }, { ...therapists[1], canBlock: true }],
    closures: [{ ...closure, closedAllDay: true, therapistId: "therapist-a" }],
  });
  assert.match(html, /aria-label="Friday 16 October 2026 — no appointments, 1 therapist off, selected"/);
  assert.doesNotMatch(html, /2 therapists off/);
});

test("calendar uses the URL selection after server refresh and scopes time-off actions", async () => {
  const html = await renderCalendar({ selectedDate: "2026-10-17", initialDate: date, selectedTherapistId: "therapist-b" });
  assert.match(html, /Time off for Therapist B/);
  assert.match(html, /Saturday 17 October 2026/);
  assert.match(html, /href="\/cms\/team\/therapist-b\/edit#weekly-days-off"/);
  assert.match(html, /aria-label="Saturday 17 October 2026 — no appointments, selected"/);
});

test("unassigned, missing and former therapist selections cannot create scoped blocks", async () => {
  for (const selectedTherapistId of ["unassigned", "missing", "therapist-a"]) {
    const html = await renderCalendar({ selectedTherapistId, therapists });
    assert.doesNotMatch(html, /class="timeOffActions"|>Block time<|>Day off<\/button>/);
  }
  const readOnly = await renderCalendar({ canManageCalendar: false });
  assert.doesNotMatch(readOnly, /class="timeOffActions"/);
});

test("staff can set temporary time off without being sent to weekly editor", async () => {
  const html = await renderCalendar({ selectedTherapistId: "therapist-a", canManageTeam: false });
  assert.match(html, /Time off for Therapist A/);
  assert.match(html, />Block time<\/button>/);
  assert.doesNotMatch(html, /href="\/cms\/team\//);
});
