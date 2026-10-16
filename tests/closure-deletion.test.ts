import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import type { ClientSession } from "mongodb";

import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = specifier === "server-only"
      ? "server-only-stub.mjs"
      : specifier === "@/server/cms/auth/session"
        ? "closure-deletion-session-stub.mjs"
        : null;
    return stub
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/${stub}`).href }
      : nextResolve(specifier, context);
  },
});

async function setup() {
  Object.assign(process.env, {
    CMS_MODE: "mock", NODE_ENV: "test", CMS_ORIGIN: "https://example.invalid",
    NEXT_PUBLIC_SITE_URL: "https://example.invalid",
  });
  for (const key of ["CI", "VERCEL", "NETLIFY"]) delete process.env[key];
  for (const key of ["__siriraneeCmsRepository", "__siriraneeCmsMockState", "__siriraneeCmsMockQueue"]) {
    Reflect.deleteProperty(globalThis, key);
  }
  const { getCmsRepository } = await import("@/server/cms/repositories");
  const fixture = await prepareBookingSafetyFixture(getCmsRepository());
  Reflect.set(globalThis, "__closureDeletionUser", fixture.actor);
  return fixture;
}

function dayOff(localDate: string, therapistId = "") {
  return { localDate, therapistId, closedAllDay: true, reason: "Day off", active: true };
}

test("deleting one day off restores availability and preserves appointments, weekly rules and other repeat dates", async () => {
  const fixture = await setup();
  const { createAdminBooking, createCmsClosure, deleteCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { getPublicAvailability } = await import("@/server/booking/public-availability");
  const nextDate = Temporal.PlainDate.from(fixture.localDate).add({ days: 1 }).toString();
  const booking = await createAdminBooking({ ...fixture.input, localDate: nextDate }, fixture.context);
  const closure = await createCmsClosure({ ...dayOff(fixture.localDate, fixture.therapist.id), repeatWeeklyCount: 2 }, fixture.context);
  const contentBefore = await fixture.repository.getContent();
  const publicationBefore = await fixture.repository.getPublishedContent();
  const notificationsBefore = await fixture.repository.listNotifications();
  const otherClosures = (await fixture.repository.listClosures()).filter((item) => item.id !== closure.id);
  assert.deepEqual(await getAdminAvailability(fixture.input), []);
  assert.deepEqual((await getPublicAvailability(fixture.input)).slots, []);

  assert.deepEqual(await deleteCmsClosure(closure.id, closure.version, { ...fixture.context, requestId: "delete-one-test" }), {
    id: closure.id, localDate: fixture.localDate, therapistId: fixture.therapist.id,
  });

  assert.ok((await getAdminAvailability(fixture.input)).length);
  assert.ok((await getPublicAvailability(fixture.input)).slots.length);
  assert.deepEqual(await fixture.repository.listClosures(), otherClosures);
  assert.deepEqual(await fixture.repository.getBooking(booking.id), booking);
  assert.deepEqual(await fixture.repository.getContent(), contentBefore);
  assert.deepEqual(await fixture.repository.getPublishedContent(), publicationBefore);
  assert.deepEqual(await fixture.repository.listNotifications(), notificationsBefore);
  const audit = await fixture.repository.listAuditForEntity("closure", closure.id);
  const deleted = audit.find((event) => event.action === "calendar.closure-deleted");
  assert.equal(deleted?.actorId, fixture.actor.id);
  assert.equal(deleted?.requestId, "delete-one-test");
  assert.match(deleted?.summary ?? "", new RegExp(fixture.localDate));
});

test("deleting a temporary day off does not override a weekly day off", async () => {
  const fixture = await setup();
  const { updateCmsTeamMember } = await import("@/server/cms/content-service");
  const { createCmsClosure, deleteCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { getPublicAvailability } = await import("@/server/booking/public-availability");
  const weekday = Temporal.PlainDate.from(fixture.localDate).dayOfWeek;
  await updateCmsTeamMember(fixture.therapist.id, { ...fixture.therapist, weeklyDaysOff: [weekday] }, fixture.therapist.version, fixture.context);
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  await deleteCmsClosure(closure.id, closure.version, fixture.context);
  assert.deepEqual((await fixture.repository.getContent()).team[0].weeklyDaysOff, [weekday]);
  assert.deepEqual(await getAdminAvailability(fixture.input), []);
  assert.deepEqual((await getPublicAvailability(fixture.input)).slots, []);
});

test("all-business partial blocks and inactive legacy closures can be deleted individually", async () => {
  const { createCmsClosure, deleteCmsClosure, getAdminAvailability } = await import("@/server/cms/booking-service");
  for (const active of [true, false]) {
    const fixture = await setup();
    const closure = await createCmsClosure({
      ...dayOff(fixture.localDate), active, closedAllDay: false,
      startsAtLocal: "12:00", endsAtLocal: "13:00",
    }, fixture.context);
    assert.equal((await getAdminAvailability(fixture.input)).some((slot) => slot.localTime === "12:00"), !active);
    assert.equal((await deleteCmsClosure(closure.id, closure.version, fixture.context)).therapistId, "");
    assert.ok((await getAdminAvailability(fixture.input)).some((slot) => slot.localTime === "12:00"));
    assert.deepEqual(await fixture.repository.listClosures(), []);
  }
});

test("invalid versions, stale versions and missing closures leave stored records and audit unchanged", async () => {
  const fixture = await setup();
  const { createCmsClosure, deleteCmsClosure } = await import("@/server/cms/booking-service");
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  const before = await fixture.repository.listClosures();
  const auditBefore = await fixture.repository.listAudit();
  for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(deleteCmsClosure(closure.id, version, fixture.context), /version is invalid/);
  }
  await assert.rejects(deleteCmsClosure(closure.id, 2, fixture.context), /changed by another request/);
  await assert.rejects(deleteCmsClosure("missing-closure", 1, fixture.context), /Closure not found/);
  assert.deepEqual(await fixture.repository.listClosures(), before);
  assert.deepEqual(await fixture.repository.listAudit(), auditBefore);
  assert.equal(await fixture.repository.deleteClosure("missing-closure", 1), false);
  await assert.rejects(fixture.repository.deleteClosure(closure.id, 2), /changed by another request/);
  assert.deepEqual(await fixture.repository.listClosures(), before);
});

test("deletion locks therapist before date and rolls back when its audit cannot be written", async () => {
  const fixture = await setup();
  const { createCmsClosure, deleteCmsClosure } = await import("@/server/cms/booking-service");
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  const before = await fixture.repository.listClosures();
  const auditBefore = await fixture.repository.listAudit();
  const calls: string[] = [];
  const original = fixture.repository.transaction.bind(fixture.repository);
  fixture.repository.transaction = (callback) => original((transaction) => callback(new Proxy(transaction, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "appendAudit") return async () => { throw new Error("Audit unavailable"); };
      if (property === "lockTherapist" || property === "lockBookingDate" || property === "deleteClosure") {
        return async (...args: unknown[]) => {
          calls.push(`${String(property)}:${String(args[0])}`);
          return value.apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  })));
  await assert.rejects(deleteCmsClosure(closure.id, closure.version, fixture.context), /Audit unavailable/);
  assert.deepEqual(calls, [
    `lockTherapist:${fixture.therapist.id}`, `lockBookingDate:${fixture.localDate}`, `deleteClosure:${closure.id}`,
  ]);
  assert.deepEqual(await fixture.repository.listClosures(), before);
  assert.deepEqual(await fixture.repository.listAudit(), auditBefore);
});

test("simultaneous updates and deletion reject stale requests without recreating the deleted closure", async () => {
  const fixture = await setup();
  const { createCmsClosure, deleteCmsClosure, updateCmsClosure } = await import("@/server/cms/booking-service");
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  const results = await Promise.allSettled([
    deleteCmsClosure(closure.id, closure.version, fixture.context),
    updateCmsClosure(closure.id, { ...closure, reason: "Updated day off" }, closure.version, fixture.context),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.deepEqual(await fixture.repository.listClosures(), []);
  assert.equal((await fixture.repository.listAuditForEntity("closure", closure.id)).filter((event) => event.action === "calendar.closure-deleted").length, 1);
});

test("Mongo deletion uses one versioned closure delete in the current session and detects stale or missing records", async () => {
  const { MongoCmsRepository } = await import("@/server/cms/repositories/mongo-repository");
  const session = { id: "isolated-session" } as unknown as ClientSession;
  for (const scenario of ["deleted", "stale", "missing"] as const) {
    const calls: unknown[][] = [];
    const repository = new MongoCmsRepository(session);
    Reflect.set(repository, "db", async () => ({
      collection(name: string) {
        assert.equal(name, "cmsClosures");
        return {
          async deleteOne(filter: unknown, options: unknown) {
            calls.push(["deleteOne", filter, options]);
            return { deletedCount: scenario === "deleted" ? 1 : 0 };
          },
          async findOne(filter: unknown, options: unknown) {
            calls.push(["findOne", filter, options]);
            return scenario === "stale" ? { _id: "closure-one" } : null;
          },
        };
      },
    }));
    if (scenario === "stale") {
      await assert.rejects(repository.deleteClosure("closure-one", 4), /changed by another request/);
    } else {
      assert.equal(await repository.deleteClosure("closure-one", 4), scenario === "deleted");
    }
    assert.deepEqual(calls[0], ["deleteOne", { _id: "closure-one", version: 4 }, { session }]);
    assert.equal(calls.length, scenario === "deleted" ? 1 : 2);
    if (scenario !== "deleted") {
      assert.deepEqual(calls[1], ["findOne", { _id: "closure-one" }, { session, projection: { _id: 1 } }]);
    }
  }
});

function deleteRequest(closureId: string, body: string, origin = "https://example.invalid") {
  return new Request(`https://example.invalid/api/cms/closures/${closureId}`, {
    method: "DELETE", headers: { origin, "content-type": "application/json", "x-request-id": "delete-route-test" }, body,
  });
}

test("DELETE route rejects cross-origin and unauthenticated requests before changing a closure", async () => {
  const fixture = await setup();
  const { createCmsClosure } = await import("@/server/cms/booking-service");
  const { DELETE } = await import("@/app/api/cms/closures/[closureId]/route");
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  const context = { params: Promise.resolve({ closureId: closure.id }) };
  assert.equal((await DELETE(deleteRequest(closure.id, '{"expectedVersion":1}', "https://other.invalid"), context))?.status, 403);
  Reflect.set(globalThis, "__closureDeletionUser", null);
  assert.equal((await DELETE(deleteRequest(closure.id, '{"expectedVersion":1}'), context))?.status, 401);
  assert.equal((await fixture.repository.listClosures()).length, 1);
  assert.equal((await fixture.repository.listAuditForEntity("closure", closure.id)).length, 1);
});

test("DELETE route validates JSON and versions, then permits calendar staff and returns no-store success", async () => {
  const fixture = await setup();
  const { createCmsClosure } = await import("@/server/cms/booking-service");
  const { DELETE } = await import("@/app/api/cms/closures/[closureId]/route");
  const closure = await createCmsClosure(dayOff(fixture.localDate, fixture.therapist.id), fixture.context);
  const context = { params: Promise.resolve({ closureId: closure.id }) };
  for (const [body, status] of [["{", 400], ["[]", 422], ["{}", 422], ['{"expectedVersion":0}', 422], ['{"expectedVersion":2}', 409]] as const) {
    const response = await DELETE(deleteRequest(closure.id, body), context);
    assert.equal(response?.status, status);
    assert.equal((await fixture.repository.listClosures()).length, 1);
  }
  Reflect.set(globalThis, "__closureDeletionUser", { ...fixture.actor, role: "staff" });
  const response = await DELETE(deleteRequest(closure.id, '{"expectedVersion":1}'), context);
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response?.json(), { deleted: { id: closure.id, localDate: fixture.localDate, therapistId: fixture.therapist.id } });
  assert.deepEqual(await fixture.repository.listClosures(), []);
  assert.equal((await DELETE(deleteRequest(closure.id, '{"expectedVersion":1}'), context))?.status, 400);
});
