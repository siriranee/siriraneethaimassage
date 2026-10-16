import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";

import { classifyAvailabilityCalendarDay } from "@/domain/booking/calendar";
import { getAvailabilitySlots } from "@/domain/booking/availability";
import type { CmsClosure, CmsContentState } from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories/repository";
import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

async function setup() {
  Object.assign(process.env, {
    CMS_MODE: "mock", NODE_ENV: "test", RESEND_API_KEY: "re_test_days_off_only",
    RESEND_FROM_EMAIL: "Test Spa <spa@example.invalid>",
    RESEND_BOOKING_TO_EMAIL: "owner@example.invalid", CMS_PII_ENCRYPTION_KEY: "33".repeat(32),
    NEXT_PUBLIC_SITE_URL: "https://example.invalid",
  });
  for (const key of ["CI", "VERCEL", "NETLIFY"]) delete process.env[key];
  for (const key of ["__siriraneeCmsRepository", "__siriraneeCmsMockState", "__siriraneeCmsMockQueue"]) {
    Reflect.deleteProperty(globalThis, key);
  }
  const { getCmsRepository } = await import("@/server/cms/repositories");
  return prepareBookingSafetyFixture(getCmsRepository());
}

function dayOff(localDate: string, therapistId?: string) {
  return { localDate, therapistId, closedAllDay: true, reason: "Annual leave", publicLabel: "Day off", active: true };
}

function enablePublicBookingMode(repository: CmsRepository) {
  Reflect.set(globalThis, "__siriraneeCmsRepository", new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "mode") return "mongodb";
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }));
  process.env.CMS_MODE = "mongodb";
  process.env.CMS_PUBLIC_BOOKING_READY = "true";
}

async function addSecondTherapist(fixture: Awaited<ReturnType<typeof setup>>) {
  const { createCmsTeamMember } = await import("@/server/cms/content-service");
  return createCmsTeamMember({
    ...fixture.therapist, slug: "second-test-therapist", name: "Demo Second Therapist",
    notificationEmail: "demo.second@example.invalid",
  }, fixture.context);
}

test("weekly days off validate, normalize, preserve on unrelated saves and publish immediately", async () => {
  const fixture = await setup();
  const { updateCmsTeamMember, normaliseCmsContent } = await import("@/server/cms/content-service");
  const { parseTeamUpdate, CmsValidationError } = await import("@/server/cms/content-validation");
  const options = { notificationEmail: "demo@example.invalid", validServiceIds: [fixture.service.id] };
  for (const weeklyDaysOff of [null, "Monday", [0], [8], [1.5], ["1"]]) {
    assert.throws(() => parseTeamUpdate({ ...fixture.therapist, weeklyDaysOff }, fixture.therapist, options), CmsValidationError);
  }
  const updated = await updateCmsTeamMember(fixture.therapist.id, {
    ...fixture.therapist, weeklyDaysOff: [7, 1, 7],
  }, fixture.therapist.version, fixture.context);
  assert.deepEqual(updated.weeklyDaysOff, [1, 7]);
  assert.deepEqual((await fixture.repository.getPublishedContent())?.snapshot.team[0].weeklyDaysOff, [1, 7]);
  const unchanged = parseTeamUpdate({ name: updated.name, fullName: updated.fullName, publicRole: updated.publicRole }, updated, options);
  assert.deepEqual(unchanged.weeklyDaysOff, [1, 7]);
  const content = await fixture.repository.getContent();
  const legacy = normaliseCmsContent({ ...content, team: [{ ...fixture.therapist, weeklyDaysOff: undefined }] });
  assert.deepEqual(legacy.team[0].weeklyDaysOff, []);
  const malformed = normaliseCmsContent({ ...content, team: [{ ...fixture.therapist, weeklyDaysOff: [7, 0, 2, 7, 8, 1.5] }] });
  assert.deepEqual(malformed.team[0].weeklyDaysOff, [2, 7]);
});

test("new therapist weekly days off are included in the immediate publication", async () => {
  const fixture = await setup();
  const { createCmsTeamMember } = await import("@/server/cms/content-service");
  const created = await createCmsTeamMember({
    ...fixture.therapist, slug: "new-weekly-off", name: "Demo New Therapist", weeklyDaysOff: [2, 4],
    notificationEmail: "demo.new@example.invalid",
  }, fixture.context);
  assert.deepEqual(created.weeklyDaysOff, [2, 4]);
  assert.deepEqual((await fixture.repository.getPublishedContent())?.snapshot.team.find((member) => member.id === created.id)?.weeklyDaysOff, [2, 4]);
});

test("scoped full-day and partial closures leave other therapists and legacy all-shop behavior correct", async () => {
  const fixture = await setup();
  const content = await fixture.repository.getContent();
  const closure: CmsClosure = {
    ...dayOff(fixture.localDate, fixture.therapist.id), therapistId: fixture.therapist.id,
    id: "scoped", startsAtLocal: "", endsAtLocal: "", version: 1, createdAt: "", updatedAt: "", updatedBy: "test",
  };
  const base = {
    localDate: fixture.localDate, durationMinutes: 60, therapistId: fixture.therapist.id,
    settings: content.bookingSettings, weeklyHours: content.site.weeklyHours, closures: [closure], bookings: [],
    minimumDate: fixture.localDate, maximumDate: fixture.localDate,
  };
  assert.equal(getAvailabilitySlots(base).length, 0);
  assert.equal(classifyAvailabilityCalendarDay(base).state, "day-off");
  assert.ok(getAvailabilitySlots({ ...base, therapistId: "other" }).length);
  assert.equal(classifyAvailabilityCalendarDay({ ...base, therapistId: "other" }).state, "available");
  assert.ok(getAvailabilitySlots({ ...base, therapistId: undefined }).length);
  for (const therapistId of [undefined, ""]) {
    assert.equal(getAvailabilitySlots({ ...base, therapistId: "other", closures: [{ ...closure, therapistId }] }).length, 0);
  }
  const partial = [{ ...closure, closedAllDay: false, startsAtLocal: "12:00", endsAtLocal: "13:00" }];
  const affected = getAvailabilitySlots({ ...base, closures: partial });
  assert.ok(affected.some((slot) => slot.localTime === "11:00"));
  assert.ok(!affected.some((slot) => slot.localTime === "11:30" || slot.localTime === "12:00"));
  assert.ok(affected.some((slot) => slot.localTime === "13:00"));
  assert.ok(getAvailabilitySlots({ ...base, closures: partial, therapistId: "other" }).some((slot) => slot.localTime === "12:00"));
  assert.ok(getAvailabilitySlots({ ...base, closures: [{ ...closure, active: false }] }).length);
});

test("weekly days off block CMS and public availability and transactional new bookings", async () => {
  const fixture = await setup();
  const second = await addSecondTherapist(fixture);
  const { updateCmsTeamMember } = await import("@/server/cms/content-service");
  const { createAdminBooking, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { getPublicAvailability, getPublicAvailabilityCalendar } = await import("@/server/booking/public-availability");
  const weekday = Temporal.PlainDate.from(fixture.localDate).dayOfWeek;
  await updateCmsTeamMember(fixture.therapist.id, { ...fixture.therapist, weeklyDaysOff: [weekday] }, 1, fixture.context);
  assert.deepEqual(await getAdminAvailability(fixture.input), []);
  assert.deepEqual((await getPublicAvailability(fixture.input)).slots, []);
  const calendar = await getPublicAvailabilityCalendar({ ...fixture.input, month: fixture.localDate.slice(0, 7) });
  assert.equal(calendar.days.find((day) => day.localDate === fixture.localDate)?.state, "day-off");
  assert.equal(calendar.days.find((day) => day.localDate === fixture.localDate)?.label, "Day off");
  assert.ok((await getPublicAvailability({ ...fixture.input, therapistId: second.id })).slots.length);
  await assert.rejects(createAdminBooking(fixture.input, fixture.context), /blocked or fully booked/);
  enablePublicBookingMode(fixture.repository);
  const { createPublicBooking } = await import("@/server/booking/public-booking");
  await assert.rejects(createPublicBooking({ ...fixture.input, privacyAccepted: true }, {
    idempotencyKey: "weekly-days-off-public-booking", requestId: "days-off-test",
    sendCustomerBookingEmail: async () => { throw new Error("Must never send email"); },
    sendTherapistBookingEmail: async () => { throw new Error("Must never send email"); },
  }), /become unavailable/);
  assert.deepEqual(await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate }), []);
});

test("weekly day changes preserve future confirmed and pending appointments and allow removing a day off", async () => {
  for (const status of ["confirmed", "pending"] as const) {
    const fixture = await setup();
    const { createAdminBooking } = await import("@/server/cms/booking-service");
    const { updateCmsTeamMember } = await import("@/server/cms/content-service");
    const booking = await createAdminBooking(fixture.input, fixture.context);
    await fixture.repository.saveBooking({ ...booking, status }, booking.version);
    const weekday = Temporal.PlainDate.from(fixture.localDate).dayOfWeek;
    await assert.rejects(updateCmsTeamMember(fixture.therapist.id, {
      ...fixture.therapist, weeklyDaysOff: [weekday],
    }, 1, fixture.context), (error: unknown) => error instanceof Error && error.message.includes(booking.reference) && error.message.includes(fixture.localDate));
    assert.equal((await fixture.repository.getBooking(booking.id))?.status, status);
    assert.equal((await fixture.repository.getContent()).team[0].version, 1);
    const otherWeekday = weekday === 7 ? 1 : weekday + 1;
    const updated = await updateCmsTeamMember(fixture.therapist.id, {
      ...fixture.therapist, weeklyDaysOff: [otherWeekday],
    }, 1, fixture.context);
    const cleared = await updateCmsTeamMember(updated.id, { ...updated, weeklyDaysOff: [] }, updated.version, fixture.context);
    assert.deepEqual(cleared.weeklyDaysOff, []);
  }
});

test("scoped closures reject only affected active bookings and retain scope when deactivated", async () => {
  const fixture = await setup();
  const second = await addSecondTherapist(fixture);
  const { createAdminBooking, createCmsClosure, updateCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { getPublicAvailabilityCalendar } = await import("@/server/booking/public-availability");
  const booking = await createAdminBooking(fixture.input, fixture.context);
  const closure = await createCmsClosure(dayOff(fixture.localDate, second.id), fixture.context);
  assert.equal(closure.therapistId, second.id);
  assert.deepEqual(await getAdminAvailability({ ...fixture.input, therapistId: second.id }), []);
  const calendar = await getPublicAvailabilityCalendar({ ...fixture.input, month: fixture.localDate.slice(0, 7) });
  assert.equal(calendar.days.find((day) => day.localDate === fixture.localDate)?.state, "available");
  await assert.rejects(createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context), /active booking/);
  await assert.rejects(createCmsClosure(dayOff(fixture.localDate), fixture.context), /active booking/);
  await assert.rejects(updateCmsClosure(closure.id, { ...closure, therapistId: fixture.therapist.id }, closure.version, fixture.context), /active booking/);
  assert.equal((await fixture.repository.getBooking(booking.id))?.status, "confirmed");
  const { therapistId: omitted, ...withoutScope } = closure;
  assert.equal(omitted, second.id);
  const inactive = await updateCmsClosure(closure.id, { ...withoutScope, active: false }, closure.version, fixture.context);
  assert.equal(inactive.therapistId, second.id);
  assert.ok((await getAdminAvailability({ ...fixture.input, therapistId: second.id })).length);
});

test("temporary blocks include treatment buffers and validate real dates and therapist IDs", async () => {
  const fixture = await setup();
  const { createAdminBooking, createCmsClosure } = await import("@/server/cms/booking-service");
  const content = await fixture.repository.getContent();
  await fixture.repository.saveContent({ ...content, revision: content.revision + 1, bookingSettings: { ...content.bookingSettings, bufferAfterMinutes: 15 } }, content.revision);
  await createAdminBooking(fixture.input, fixture.context);
  await assert.rejects(createCmsClosure({ ...dayOff(fixture.localDate, fixture.therapist.id), closedAllDay: false, startsAtLocal: "13:00", endsAtLocal: "13:15" }, fixture.context), /active booking/);
  await assert.rejects(createCmsClosure(dayOff("2026-02-30", fixture.therapist.id), fixture.context), /valid closure date/);
  await assert.rejects(createCmsClosure(dayOff(fixture.localDate, "not-a-therapist"), fixture.context), /existing therapist/);
  assert.deepEqual(await fixture.repository.listClosures(), []);
});

test("pending requests are protected from temporary days off while cancelled appointments do not block them", async () => {
  const fixture = await setup();
  const { createAdminBooking, createCmsClosure } = await import("@/server/cms/booking-service");
  const booking = await createAdminBooking(fixture.input, fixture.context);
  await fixture.repository.saveBooking({ ...booking, status: "pending" }, booking.version);
  await assert.rejects(createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context), /active booking/);
  assert.equal((await fixture.repository.getBooking(booking.id))?.status, "pending");
  await fixture.repository.saveBooking({ ...booking, status: "cancelled" }, booking.version);
  assert.equal((await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context)).active, true);
});

test("new weekly days off allow historical and terminal appointments to remain intact", async () => {
  const fixture = await setup();
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const { updateCmsTeamMember } = await import("@/server/cms/content-service");
  const booking = await createAdminBooking(fixture.input, fixture.context);
  await fixture.repository.saveBooking({ ...booking, status: "cancelled" }, booking.version);
  const pastDate = Temporal.PlainDate.from(fixture.localDate).subtract({ days: 7 }).toString();
  const historical = await createAdminBooking({ ...fixture.input, localDate: pastDate }, fixture.context);
  const updated = await updateCmsTeamMember(fixture.therapist.id, {
    ...fixture.therapist, weeklyDaysOff: [Temporal.PlainDate.from(fixture.localDate).dayOfWeek],
  }, 1, fixture.context);
  assert.equal(updated.weeklyDaysOff?.length, 1);
  assert.deepEqual(await fixture.repository.getBooking(historical.id), historical);
  assert.equal((await fixture.repository.getBooking(booking.id))?.status, "cancelled");
});

test("concurrent booking and weekly day-off requests never save conflicting appointments", async () => {
  for (const first of ["booking", "day-off"] as const) {
    const fixture = await setup();
    const { createAdminBooking } = await import("@/server/cms/booking-service");
    const { updateCmsTeamMember } = await import("@/server/cms/content-service");
    const saveBooking = () => createAdminBooking(fixture.input, fixture.context);
    const saveDayOff = () => updateCmsTeamMember(fixture.therapist.id, {
      ...fixture.therapist, weeklyDaysOff: [Temporal.PlainDate.from(fixture.localDate).dayOfWeek],
    }, 1, fixture.context);
    const results = await Promise.allSettled(first === "booking" ? [saveBooking(), saveDayOff()] : [saveDayOff(), saveBooking()]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const savedBookings = await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate });
    const savedDaysOff = (await fixture.repository.getContent()).team[0].weeklyDaysOff ?? [];
    assert.equal(Boolean(savedBookings.length && savedDaysOff.length), false);
  }
});

test("repeated therapist closures are atomic when a later week conflicts", async () => {
  const fixture = await setup();
  const { createAdminBooking, createCmsClosure } = await import("@/server/cms/booking-service");
  const secondWeek = Temporal.PlainDate.from(fixture.localDate).add({ days: 7 }).toString();
  await createAdminBooking({ ...fixture.input, localDate: secondWeek }, fixture.context);
  await assert.rejects(createCmsClosure({ ...dayOff(fixture.localDate, fixture.therapist.id), repeatWeeklyCount: 3 }, fixture.context), /active booking/);
  assert.deepEqual(await fixture.repository.listClosures(), []);
});

test("rescheduling and confirming legacy requests recheck therapist weekly and temporary days off", async () => {
  for (const kind of ["weekly", "temporary"] as const) {
    const fixture = await setup();
    const { createAdminBooking, updateAdminBooking, createCmsClosure } = await import("@/server/cms/booking-service");
    const { updateCmsTeamMember } = await import("@/server/cms/content-service");
    const booking = await createAdminBooking(fixture.input, fixture.context);
    const nextDate = Temporal.PlainDate.from(fixture.localDate).add({ days: 1 }).toString();
    if (kind === "weekly") {
      await updateCmsTeamMember(fixture.therapist.id, { ...fixture.therapist, weeklyDaysOff: [Temporal.PlainDate.from(nextDate).dayOfWeek] }, 1, fixture.context);
    } else {
      await createCmsClosure(dayOff(nextDate, fixture.therapist.id), fixture.context);
    }
    await assert.rejects(updateAdminBooking(booking.id, { localDate: nextDate, changeReason: "customer-request" }, booking.version, fixture.context), /blocked or fully booked/);
    assert.deepEqual(await fixture.repository.getBooking(booking.id), booking);
    // Simulate a pre-existing imported request on a blocked date: approval must still recheck.
    await fixture.repository.saveBooking({ ...booking, localDate: nextDate, status: "pending" }, booking.version);
    await assert.rejects(updateAdminBooking(booking.id, { status: "confirmed", changeReason: "customer-request" }, booking.version, fixture.context), /blocked or fully booked/);
    assert.equal((await fixture.repository.getBooking(booking.id))?.status, "pending");
  }
});

test("temporary scoped closures also reject direct public booking submissions", async () => {
  const fixture = await setup();
  const { createCmsClosure } = await import("@/server/cms/booking-service");
  await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  enablePublicBookingMode(fixture.repository);
  const { createPublicBooking } = await import("@/server/booking/public-booking");
  await assert.rejects(createPublicBooking({ ...fixture.input, privacyAccepted: true }, {
    idempotencyKey: "temporary-days-off-public-booking", requestId: "days-off-test",
    sendCustomerBookingEmail: async () => { throw new Error("Must never send email"); },
    sendTherapistBookingEmail: async () => { throw new Error("Must never send email"); },
  }), /become unavailable/);
});

test("therapist closure mutation takes therapist locks before any date locks", async () => {
  const fixture = await setup();
  const { createCmsClosure, updateCmsClosure } = await import("@/server/cms/booking-service");
  const calls: string[] = [];
  const original = fixture.repository.transaction.bind(fixture.repository);
  fixture.repository.transaction = (callback) => original((transaction) => callback(new Proxy(transaction, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "lockTherapist" || property === "lockBookingDate") {
        return async (id: string) => { calls.push(`${String(property)}:${id}`); return value.call(target, id); };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  })));
  const closure = await createCmsClosure({ ...dayOff(fixture.localDate, fixture.therapist.id), repeatWeeklyCount: 2 }, fixture.context);
  assert.equal(calls[0], `lockTherapist:${fixture.therapist.id}`);
  assert.equal(calls.filter((call) => call.startsWith("lockBookingDate:")).length, 2);
  calls.length = 0;
  await updateCmsClosure(closure.id, { ...closure, active: false }, closure.version, fixture.context);
  assert.deepEqual(calls, [`lockTherapist:${fixture.therapist.id}`, `lockBookingDate:${fixture.localDate}`]);
});

test("legacy content without weekly days off retains available appointment times", async () => {
  const fixture = await setup();
  const { normaliseCmsContent } = await import("@/server/cms/content-service");
  const legacy = await fixture.repository.getContent() as CmsContentState;
  const content = normaliseCmsContent(legacy);
  assert.ok(getAvailabilitySlots({
    localDate: fixture.localDate, durationMinutes: 60, therapistId: fixture.therapist.id,
    therapistWeeklyDaysOff: content.team[0].weeklyDaysOff, settings: content.bookingSettings,
    weeklyHours: content.site.weeklyHours, closures: [], bookings: [],
  }).length);
});

test("partial blocks reject ambiguous or nonexistent Dublin times before they can hide an entire day", async () => {
  for (const localDate of ["2026-10-25", "2027-03-28"]) {
    const fixture = await setup();
    const { createCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
    const before = await getAdminAvailability({ ...fixture.input, localDate });
    assert.ok(before.length);
    await assert.rejects(createCmsClosure({
      ...dayOff(localDate, fixture.therapist.id),
      closedAllDay: false,
      startsAtLocal: "01:30",
      endsAtLocal: "02:30",
    }, fixture.context), (error: unknown) => error instanceof Error && error.name === "CmsValidationError");
    assert.deepEqual(await fixture.repository.listClosures(), []);
    assert.deepEqual(await getAdminAvailability({ ...fixture.input, localDate }), before);
  }
});

test("repeated partial blocks validate every date and leave no partial series at clock changes", async () => {
  for (const localDate of ["2026-10-18", "2027-03-21"]) {
    const fixture = await setup();
    const { createCmsClosure } = await import("@/server/cms/booking-service");
    const invalidDate = Temporal.PlainDate.from(localDate).add({ days: 7 }).toString();
    await assert.rejects(createCmsClosure({
      ...dayOff(localDate, fixture.therapist.id), closedAllDay: false,
      startsAtLocal: "01:30", endsAtLocal: "02:30", repeatWeeklyCount: 3,
    }, fixture.context), (error: unknown) => error instanceof Error &&
      error.name === "CmsValidationError" && error.message.includes(invalidDate));
    assert.deepEqual(await fixture.repository.listClosures(), []);
    const valid = await createCmsClosure({
      ...dayOff(localDate, fixture.therapist.id), closedAllDay: false,
      startsAtLocal: "12:00", endsAtLocal: "13:00", repeatWeeklyCount: 3,
    }, fixture.context);
    assert.equal(valid.repeatedCount, 3);
  }
});

test("clock-change edits reject invalid active times but allow reopening legacy invalid blocks", async () => {
  const fixture = await setup();
  const { createCmsClosure, updateCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
  const localDate = "2026-10-25";
  const closure = await createCmsClosure({
    ...dayOff(localDate, fixture.therapist.id), closedAllDay: false,
    startsAtLocal: "12:00", endsAtLocal: "13:00",
  }, fixture.context);
  await assert.rejects(updateCmsClosure(closure.id, {
    ...closure, startsAtLocal: "01:30", endsAtLocal: "02:30",
  }, closure.version, fixture.context), (error: unknown) => error instanceof Error && error.name === "CmsValidationError");
  assert.equal((await fixture.repository.listClosures())[0].startsAtLocal, "12:00");
  await fixture.repository.saveClosure({ ...closure, startsAtLocal: "01:30", endsAtLocal: "02:30" }, closure.version);
  const reopened = await updateCmsClosure(closure.id, {
    ...closure, startsAtLocal: "01:30", endsAtLocal: "02:30", active: false,
  }, closure.version, fixture.context);
  assert.equal(reopened.active, false);
  assert.ok((await getAdminAvailability({ ...fixture.input, localDate })).length);
  await assert.rejects(updateCmsClosure(reopened.id, { ...reopened, active: true }, reopened.version, fixture.context),
    (error: unknown) => error instanceof Error && error.name === "CmsValidationError");
});

test("full-day closures repeat across month, year and Dublin clock changes using local calendar dates", async () => {
  for (const localDate of ["2026-12-27", "2026-10-18", "2027-03-21"]) {
    const fixture = await setup();
    const { createCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
    const result = await createCmsClosure({ ...dayOff(localDate, fixture.therapist.id), repeatWeeklyCount: 3 }, fixture.context);
    assert.equal(result.repeatedCount, 3);
    const expectedDates = [0, 7, 14].map((days) => Temporal.PlainDate.from(localDate).add({ days }).toString());
    assert.deepEqual((await fixture.repository.listClosures()).map((closure) => closure.localDate), expectedDates);
    for (const date of expectedDates) {
      assert.deepEqual(await getAdminAvailability({ ...fixture.input, localDate: date }), []);
    }
    const followingDay = Temporal.PlainDate.from(localDate).add({ days: 1 }).toString();
    assert.ok((await getAdminAvailability({ ...fixture.input, localDate: followingDay })).length);
  }
});

test("clearing one overlapping closure leaves other full-day, partial and weekly blocks enforced", async () => {
  const fixture = await setup();
  const { createCmsClosure, updateCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { updateCmsTeamMember } = await import("@/server/cms/content-service");
  const globalClosure = await createCmsClosure(dayOff(fixture.localDate), fixture.context);
  const scopedClosure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  const partialClosure = await createCmsClosure({
    ...dayOff(fixture.localDate, fixture.therapist.id), closedAllDay: false,
    startsAtLocal: "12:00", endsAtLocal: "13:00",
  }, fixture.context);
  await updateCmsClosure(scopedClosure.id, { ...scopedClosure, active: false }, scopedClosure.version, fixture.context);
  assert.deepEqual(await getAdminAvailability(fixture.input), []);
  await updateCmsClosure(globalClosure.id, { ...globalClosure, active: false }, globalClosure.version, fixture.context);
  const withPartial = await getAdminAvailability(fixture.input);
  assert.ok(withPartial.length);
  assert.ok(!withPartial.some((slot) => slot.localTime === "12:00"));
  const member = await updateCmsTeamMember(fixture.therapist.id, {
    ...fixture.therapist, weeklyDaysOff: [Temporal.PlainDate.from(fixture.localDate).dayOfWeek],
  }, fixture.therapist.version, fixture.context);
  await updateCmsClosure(partialClosure.id, { ...partialClosure, active: false }, partialClosure.version, fixture.context);
  assert.deepEqual(await getAdminAvailability(fixture.input), []);
  await updateCmsTeamMember(member.id, { ...member, weeklyDaysOff: [] }, member.version, fixture.context);
  assert.ok((await getAdminAvailability(fixture.input)).some((slot) => slot.localTime === "12:00"));
});

test("moving, broadening and stale editing of a closure cannot invalidate another therapist's booking", async () => {
  const fixture = await setup();
  const second = await addSecondTherapist(fixture);
  const { createAdminBooking, createCmsClosure, updateCmsClosure } = await import("@/server/cms/booking-service");
  const booking = await createAdminBooking({ ...fixture.input, therapistId: second.id }, fixture.context);
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  await assert.rejects(updateCmsClosure(closure.id, { ...closure, therapistId: "" }, closure.version, fixture.context), /active booking/);
  await assert.rejects(updateCmsClosure(closure.id, { ...closure, therapistId: second.id }, closure.version, fixture.context), /active booking/);
  assert.deepEqual(await fixture.repository.getBooking(booking.id), booking);
  const reopened = await updateCmsClosure(closure.id, { ...closure, active: false }, closure.version, fixture.context);
  await assert.rejects(updateCmsClosure(closure.id, { ...closure, active: true }, closure.version, fixture.context), /changed/);
  assert.equal((await fixture.repository.listClosures())[0].version, reopened.version);
  assert.equal((await fixture.repository.listClosures())[0].active, false);
});

test("every weekly day can be disabled and re-enabled without affecting another therapist", async () => {
  const fixture = await setup();
  const second = await addSecondTherapist(fixture);
  const { updateCmsTeamMember } = await import("@/server/cms/content-service");
  const { getAdminAvailability } = await import("@/server/cms/booking-service");
  const { getPublicAvailability } = await import("@/server/booking/public-availability");
  const member = await updateCmsTeamMember(fixture.therapist.id, {
    ...fixture.therapist, weeklyDaysOff: [1, 2, 3, 4, 5, 6, 7],
  }, fixture.therapist.version, fixture.context);
  for (let offset = 0; offset < 7; offset++) {
    const localDate = Temporal.PlainDate.from(fixture.localDate).add({ days: offset }).toString();
    assert.deepEqual(await getAdminAvailability({ ...fixture.input, localDate }), []);
    assert.deepEqual((await getPublicAvailability({ ...fixture.input, localDate })).slots, []);
    assert.ok((await getPublicAvailability({ ...fixture.input, localDate, therapistId: second.id })).slots.length);
  }
  await updateCmsTeamMember(member.id, { ...member, weeklyDaysOff: [] }, member.version, fixture.context);
  assert.ok((await getPublicAvailability(fixture.input)).slots.length);
});

test("concurrent temporary day off and booking saves cannot commit a conflict in the mock repository", async () => {
  for (const first of ["booking", "day-off"] as const) {
    const fixture = await setup();
    const { createAdminBooking, createCmsClosure } = await import("@/server/cms/booking-service");
    const saveBooking = () => createAdminBooking(fixture.input, fixture.context);
    const saveDayOff = () => createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
    const results = await Promise.allSettled(first === "booking"
      ? [saveBooking(), saveDayOff()]
      : [saveDayOff(), saveBooking()]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const closures = await fixture.repository.listClosures();
    const bookings = await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate });
    assert.equal(closures.length + bookings.length, 1);
  }
});
