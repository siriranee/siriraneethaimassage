// Run against a separate, disposable `CMS_MODE=mock` local development server.
// No dotenv is loaded. The runner refuses remote URLs and non-mock servers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";

const origin = new URL(process.env.DAYS_OFF_TEST_ORIGIN || "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Local loopback server required");
assert.equal(origin.protocol, "http:");
assert.equal(origin.pathname, "/");
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
let cookie = "";
let requestCount = 0;
const passed = [];
const suffix = randomUUID().slice(0, 8);

async function request(path, { method = "GET", body, auth = true, requestOrigin = origin.origin, expected = 200, headers = {} } = {}) {
  requestCount += 1;
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      ...(auth && cookie ? { cookie } : {}),
      ...(method !== "GET" ? { origin: requestOrigin, "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
  if (expected !== 401) assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return { body: result, response };
}

async function check(name, action) {
  await action();
  passed.push(name);
  console.log(`PASS ${name}`);
}

const { body: mode } = await request("/api/cms/auth/me", { auth: false });
assert.equal(mode.mode, "mock", "Refusing to mutate anything outside local mock mode");
const { response: login, body: loginBody } = await request("/api/cms/auth/login", { method: "POST", auth: false, body: { demo: true } });
cookie = login.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
assert.ok(cookie, "Demo login session cookie required");
assert.equal(loginBody.user.role, "administrator");
const { body: verified } = await request("/api/cms/auth/me");
assert.equal(verified.mode, "mock");
assert.equal(verified.user.id, "mock-administrator");

const fixtureArgs = process.argv.slice(2);
assert.ok(fixtureArgs.length === 0 || fixtureArgs.length === 3, "Optional args: serviceId alphaId betaId");
const service = fixtureArgs.length ? { id: fixtureArgs[0] } : (await request("/api/cms/services", {
  method: "POST", expected: 201,
  body: {
    slug: `qa-days-off-${suffix}`, name: "QA Days Off Treatment",
    shortDescription: "Local test treatment for therapist availability checks.",
    longDescription: "A disposable local mock treatment used to verify therapist days off and booking availability without touching live data.",
    imageUrl: "/images/spa/traditional-thai-massage.webp", imageAlt: "Traditional Thai massage test image",
    hero: { imageUrl: "/images/spa/traditional-thai-massage.webp", altText: "Traditional Thai massage test image" },
    galleryImages: [], idealFor: [], highlights: [],
    seoTitle: "QA Days Off Treatment | Local Test",
    seoDescription: "Disposable local test treatment for verifying therapist days off and booking availability.",
    prices: [{ durationMinutes: 60, priceCents: 6500, active: true }],
  },
})).body.service;

async function createTherapist(name) {
  return (await request("/api/cms/team", { method: "POST", expected: 201, body: {
    slug: `qa-${name.toLowerCase()}-${suffix}`, name: `QA ${name}`, fullName: `QA ${name} Local Fixture`,
    publicRole: "Massage therapist", shortBio: "Local mock therapist created only for availability verification.",
    serviceIds: [service.id], weeklyDaysOff: [], publicProfile: true, operationalActive: true,
    notificationEmail: `qa-${name.toLowerCase()}@example.invalid`, contactPhone: "",
  } })).body.member;
}
let alpha = fixtureArgs.length ? (await request(`/api/cms/team/${fixtureArgs[1]}`)).body.member : await createTherapist("Alpha");
const beta = fixtureArgs.length ? (await request(`/api/cms/team/${fixtureArgs[2]}`)).body.member : await createTherapist("Beta");
assert.match(alpha.slug, /^qa-alpha-/);
assert.match(beta.slug, /^qa-beta-/);
assert.deepEqual(alpha.serviceIds, [service.id]);
assert.deepEqual(beta.serviceIds, [service.id]);
const today = Temporal.Now.zonedDateTimeISO("Europe/Dublin").toPlainDate();
const date = (offset) => today.add({ days: offset }).toString();
const testDate = date(5);
const nextDate = date(6);
const bookingDate = date(7);
const weeklyDay = Temporal.PlainDate.from(testDate).dayOfWeek;
console.log(`FIXTURES ${JSON.stringify({ serviceId: service.id, alphaId: alpha.id, betaId: beta.id, browserDates: [date(1), date(2), date(3)], testDates: [testDate, nextDate, bookingDate], durationMinutes: 60 })}`);

function query(therapistId, localDate, calendar = false) {
  return new URLSearchParams({ serviceId: service.id, durationMinutes: "60", therapistId, ...(calendar ? { month: localDate.slice(0, 7) } : { localDate }) });
}
async function slots(therapistId, localDate, admin = false) {
  return (await request(`${admin ? "/api/cms" : "/api/public"}/availability?${query(therapistId, localDate)}`)).body.slots;
}
async function calendarDay(therapistId, localDate) {
  const result = (await request(`/api/public/availability/calendar?${query(therapistId, localDate, true)}`)).body;
  assert.equal(result.status, "planning");
  return result.days.find((day) => day.localDate === localDate);
}
function dayOff(therapistId, localDate, extra = {}) {
  return { therapistId, localDate, closedAllDay: true, startsAtLocal: "", endsAtLocal: "", reason: `Local QA ${suffix}`, publicLabel: "", active: true, repeatWeeklyCount: 1, ...extra };
}
async function addClosure(body, expected = 201) {
  return (await request("/api/cms/closures", { method: "POST", body, expected })).body.closure;
}
async function updateClosure(closure, extra, expected = 200) {
  return (await request(`/api/cms/closures/${closure.id}`, { method: "PATCH", expected, body: { ...closure, expectedVersion: closure.version, ...extra } })).body.closure;
}
async function deleteClosure(closure) {
  const result = (await request(`/api/cms/closures/${closure.id}`, { method: "DELETE", body: { expectedVersion: closure.version } })).body;
  assert.deepEqual(result.deleted, { id: closure.id, localDate: closure.localDate, therapistId: closure.therapistId || "" });
  assert.ok(!(await allClosures()).some((item) => item.id === closure.id));
}
async function updateAlpha(extra, expected = 200) {
  const result = await request(`/api/cms/team/${alpha.id}`, { method: "PATCH", expected, body: { ...alpha, expectedVersion: alpha.version, ...extra } });
  if (expected === 200) alpha = result.body.member;
  return result;
}
async function readAlpha() {
  return (await request(`/api/cms/team/${alpha.id}`)).body.member;
}
function bookingInput(therapistId, localDate, localTime) {
  return { serviceId: service.id, durationMinutes: 60, therapistId, localDate, localTime, customerName: "Demo Local QA Customer", phone: "+35312345678", email: "demo@example.invalid", source: "administrator", status: "confirmed" };
}
async function addBooking(body, expected = 201) {
  const result = (await request("/api/cms/bookings", { method: "POST", body, expected, headers: { "idempotency-key": randomUUID() } })).body;
  if (expected === 201) assert.ok((result.therapistEmails ?? []).every((entry) => entry.reason === "mock-mode"), "Mock must skip provider delivery");
  return result.booking;
}
async function allClosures() {
  return (await request("/api/cms/closures")).body.closures;
}

// A repeated run may resume after an assertion failed. Reopen only runner-created
// blocks for these disposable therapist fixtures; browser-created blocks stay intact.
for (const closure of await allClosures()) {
  if (closure.active && /^Local QA [a-f0-9]{8}$/.test(closure.reason) && [alpha.id, beta.id].includes(closure.therapistId)) await updateClosure(closure, { active: false });
}

await check("authentication and same-origin mutation guards", async () => {
  for (const path of ["/api/cms/team", "/api/cms/closures", "/api/cms/bookings", `/api/cms/availability?${query(alpha.id, testDate)}`]) await request(path, { auth: false, expected: 401 });
  for (const path of ["/api/cms/team", "/api/cms/closures", "/api/cms/bookings"]) await request(path, { method: "POST", body: {}, requestOrigin: "http://untrusted.invalid", expected: 403 });
  await request(`/api/cms/team/${alpha.id}`, { method: "PATCH", body: {}, auth: false, expected: 401 });
  await request("/api/cms/auth/login", { method: "POST", body: { demo: true }, auth: false, requestOrigin: "http://untrusted.invalid", expected: 403 });
});

const baselineAlpha = await slots(alpha.id, testDate);
const baselineBeta = await slots(beta.id, testDate);
assert.ok(baselineAlpha.length && baselineBeta.length);
await check("published therapist fixtures have matching public and admin slots", async () => {
  assert.deepEqual((await slots(alpha.id, testDate, true)).map((slot) => slot.localTime), baselineAlpha.map((slot) => slot.localTime));
  assert.equal((await calendarDay(alpha.id, testDate)).state, "available");
});

await check("temporary therapist day off, scope, stale version, reopening", async () => {
  let closure = await addClosure(dayOff(alpha.id, testDate));
  assert.equal((await slots(alpha.id, testDate)).length, 0);
  assert.equal((await slots(alpha.id, testDate, true)).length, 0);
  assert.deepEqual(await slots(beta.id, testDate), baselineBeta);
  assert.equal((await calendarDay(alpha.id, testDate)).state, "day-off");
  assert.equal((await calendarDay(beta.id, testDate)).state, "available");
  await addBooking(bookingInput(alpha.id, testDate, baselineAlpha[0].localTime), 409);
  const oldClosure = closure;
  closure = await updateClosure(closure, { active: false });
  await updateClosure(oldClosure, { reason: "Stale overwrite must fail" }, 409);
  assert.equal(closure.version, oldClosure.version + 1);
  assert.deepEqual(await slots(alpha.id, testDate), baselineAlpha);
  assert.equal((await calendarDay(alpha.id, testDate)).state, "available");
});

await check("partial block removes only overlapping slots for its therapist", async () => {
  const blockedStart = baselineAlpha[2].localTime;
  const blockedEnd = Temporal.PlainTime.from(blockedStart).add({ hours: 1 }).toString().slice(0, 5);
  const closure = await addClosure(dayOff(alpha.id, testDate, { closedAllDay: false, startsAtLocal: blockedStart, endsAtLocal: blockedEnd }));
  const partial = await slots(alpha.id, testDate);
  assert.ok(partial.length > 0 && partial.length < baselineAlpha.length);
  const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  assert.ok(partial.every((slot) => toMinutes(slot.localTime) + 60 <= toMinutes(blockedStart) || toMinutes(slot.localTime) >= toMinutes(blockedEnd)));
  assert.deepEqual((await slots(alpha.id, testDate, true)).map((slot) => slot.localTime), partial.map((slot) => slot.localTime));
  assert.deepEqual(await slots(beta.id, testDate), baselineBeta);
  await addBooking(bookingInput(alpha.id, testDate, blockedStart), 409);
  await updateClosure(closure, { active: false });
  assert.deepEqual(await slots(alpha.id, testDate), baselineAlpha);
});

await check("weekly days off apply across weeks, preserve scope and can be cleared", async () => {
  const oldAlpha = alpha;
  await updateAlpha({ weeklyDaysOff: [weeklyDay, weeklyDay] });
  assert.deepEqual(alpha.weeklyDaysOff, [weeklyDay]);
  for (const localDate of [testDate, date(12)]) {
    assert.equal((await slots(alpha.id, localDate)).length, 0);
    assert.equal((await slots(alpha.id, localDate, true)).length, 0);
    assert.equal((await calendarDay(alpha.id, localDate)).state, "day-off");
    assert.ok((await slots(beta.id, localDate)).length > 0);
  }
  assert.ok((await slots(alpha.id, nextDate)).length > 0);
  await addBooking(bookingInput(alpha.id, testDate, baselineAlpha[0].localTime), 409);
  await request(`/api/cms/team/${alpha.id}`, { method: "PATCH", expected: 409, body: { ...oldAlpha, expectedVersion: oldAlpha.version, weeklyDaysOff: [] } });
  assert.deepEqual((await readAlpha()).weeklyDaysOff, [weeklyDay]);
  await updateAlpha({ weeklyDaysOff: [] });
  assert.deepEqual(await slots(alpha.id, testDate), baselineAlpha);
});

await check("whole-business day off blocks both therapists and reopens both", async () => {
  const closure = await addClosure(dayOff("", testDate));
  for (const therapistId of [alpha.id, beta.id]) {
    assert.equal((await slots(therapistId, testDate)).length, 0);
    assert.equal((await calendarDay(therapistId, testDate)).state, "day-off");
  }
  await updateClosure(closure, { active: false });
  assert.deepEqual(await slots(alpha.id, testDate), baselineAlpha);
  assert.deepEqual(await slots(beta.id, testDate), baselineBeta);
});

let existingBooking;
await check("existing appointments survive rejected temporary and weekly days off", async () => {
  const available = await slots(alpha.id, bookingDate, true);
  existingBooking = await addBooking(bookingInput(alpha.id, bookingDate, available[0].localTime));
  assert.equal(existingBooking.status, "confirmed");
  const beforeClosures = await allClosures();
  await addClosure(dayOff(alpha.id, bookingDate), 409);
  await addClosure(dayOff("", bookingDate), 409);
  await updateAlpha({ weeklyDaysOff: [Temporal.PlainDate.from(bookingDate).dayOfWeek] }, 409);
  assert.deepEqual(await allClosures(), beforeClosures);
  assert.deepEqual((await readAlpha()).weeklyDaysOff, []);
  const fetched = (await request(`/api/cms/bookings/${existingBooking.id}`)).body.booking;
  assert.equal(fetched.status, "confirmed");
  assert.equal(fetched.localDate, existingBooking.localDate);
  assert.equal(fetched.assignedStaffId, alpha.id);
  assert.equal(fetched.version, existingBooking.version);
  assert.ok((await slots(alpha.id, bookingDate)).some((slot) => slot.localTime === existingBooking.localTime && slot.available === false), "Booked public slot must remain visible as unavailable");
  const otherClosure = await addClosure(dayOff(beta.id, bookingDate));
  await updateClosure(otherClosure, { active: false });
});

await check("repeating days off save atomically and reject a later conflicting week", async () => {
  const before = await allClosures();
  await addClosure(dayOff(alpha.id, date(0), { repeatWeeklyCount: 2 }), 409);
  assert.deepEqual(await allClosures(), before);
  const repeated = await addClosure(dayOff(alpha.id, testDate, { repeatWeeklyCount: 3 }));
  assert.equal(repeated.repeatedCount, 3);
  const added = (await allClosures()).filter((item) => !before.some((prior) => prior.id === item.id));
  assert.deepEqual(added.map((item) => item.localDate).sort(), [date(5), date(12), date(19)]);
  for (const closure of added) {
    assert.equal((await slots(alpha.id, closure.localDate)).length, 0);
    assert.ok((await slots(beta.id, closure.localDate)).length > 0);
    await updateClosure(closure, { active: false });
  }
});

await check("invalid therapist, date, hours, repeat count and weekdays are rejected", async () => {
  const before = await allClosures();
  for (const body of [
    dayOff("missing-therapist", testDate), dayOff(alpha.id, "2026-02-30"),
    dayOff(alpha.id, testDate, { repeatWeeklyCount: 13 }),
    dayOff(alpha.id, testDate, { repeatWeeklyCount: 0 }),
    dayOff(alpha.id, testDate, { closedAllDay: false, startsAtLocal: "14:00", endsAtLocal: "13:00" }),
  ]) await addClosure(body, 422);
  for (const weeklyDaysOff of [[0], [8], [1.5], ["1"], "Monday"]) await updateAlpha({ weeklyDaysOff }, 422);
  assert.deepEqual(await allClosures(), before);
  assert.deepEqual((await readAlpha()).weeklyDaysOff, []);
});

await check("public writes remain fail-closed in mock mode", async () => {
  const before = (await request("/api/cms/bookings")).body.bookings;
  await request("/api/public/bookings", { method: "POST", auth: false, expected: 503, headers: { "idempotency-key": randomUUID() }, body: { ...bookingInput(alpha.id, testDate, baselineAlpha[0].localTime), privacyAccepted: true } });
  assert.deepEqual((await request("/api/cms/bookings")).body.bookings, before);
});

await check("booking reschedule cannot enter a blocked therapist day", async () => {
  const closure = await addClosure(dayOff(alpha.id, nextDate));
  await request(`/api/cms/bookings/${existingBooking.id}`, { method: "PATCH", expected: 409, body: { localDate: nextDate, expectedVersion: existingBooking.version, changeReason: "customer-request" } });
  assert.equal((await request(`/api/cms/bookings/${existingBooking.id}`)).body.booking.localDate, bookingDate);
  await updateClosure(closure, { active: false });
});

await check("delete day off checks authentication, origin and version before reopening availability", async () => {
  const closure = await addClosure(dayOff(alpha.id, testDate));
  const path = `/api/cms/closures/${closure.id}`;
  const body = { expectedVersion: closure.version };
  assert.equal((await slots(alpha.id, testDate)).length, 0);
  await request(path, { method: "DELETE", body, auth: false, expected: 401 });
  await request(path, { method: "DELETE", body, requestOrigin: "http://untrusted.invalid", expected: 403 });
  await request(path, { method: "DELETE", body: { expectedVersion: closure.version + 1 }, expected: 409 });
  await request(path, { method: "DELETE", body: {}, expected: 422 });
  assert.ok((await allClosures()).some((item) => item.id === closure.id));
  assert.equal((await slots(alpha.id, testDate)).length, 0);
  await deleteClosure(closure);
  assert.deepEqual(await slots(alpha.id, testDate), baselineAlpha);
  assert.deepEqual(await slots(beta.id, testDate), baselineBeta);
  assert.equal((await calendarDay(alpha.id, testDate)).state, "available");
  await request(path, { method: "DELETE", body, expected: 400 });
});

await check("deleting one block preserves remaining blocks and weekly days off", async () => {
  const partial = await addClosure(dayOff(alpha.id, testDate, {
    closedAllDay: false, startsAtLocal: baselineAlpha[2].localTime,
    endsAtLocal: Temporal.PlainTime.from(baselineAlpha[2].localTime).add({ hours: 1 }).toString().slice(0, 5),
  }));
  const partialSlots = await slots(alpha.id, testDate);
  assert.ok(partialSlots.length < baselineAlpha.length);
  const full = await addClosure(dayOff(alpha.id, testDate));
  await deleteClosure(full);
  assert.deepEqual(await slots(alpha.id, testDate), partialSlots);
  await deleteClosure(partial);
  assert.deepEqual(await slots(alpha.id, testDate), baselineAlpha);
  await updateAlpha({ weeklyDaysOff: [weeklyDay] });
  const business = await addClosure(dayOff("", testDate));
  assert.equal((await slots(beta.id, testDate)).length, 0);
  await deleteClosure(business);
  assert.equal((await slots(alpha.id, testDate)).length, 0);
  assert.deepEqual((await readAlpha()).weeklyDaysOff, [weeklyDay]);
  assert.deepEqual(await slots(beta.id, testDate), baselineBeta);
  await updateAlpha({ weeklyDaysOff: [] });
});

await check("deleting an inactive day off preserves the existing appointment", async () => {
  const closure = await addClosure(dayOff(alpha.id, bookingDate, { active: false }));
  const before = (await request(`/api/cms/bookings/${existingBooking.id}`)).body.booking;
  await deleteClosure(closure);
  assert.deepEqual((await request(`/api/cms/bookings/${existingBooking.id}`)).body.booking, before);
  assert.ok((await slots(alpha.id, bookingDate)).some((slot) => slot.localTime === before.localTime && slot.available === false));
});

// Keep the two therapists and treatment available for a follow-up browser pass.
// Remove only this runner's disposable appointment, then verify clean availability.
await request(`/api/cms/bookings/${existingBooking.id}`, { method: "DELETE", body: { expectedVersion: existingBooking.version } });
assert.deepEqual((await readAlpha()).weeklyDaysOff, []);
assert.ok(!(await allClosures()).some((closure) => closure.active && closure.reason === `Local QA ${suffix}`));
console.log(`RESULT ${JSON.stringify({ passed: passed.length, requests: requestCount, fixtureMode: "local mock only", providerWrites: 0, fixturesRetainedForBrowser: true })}`);
