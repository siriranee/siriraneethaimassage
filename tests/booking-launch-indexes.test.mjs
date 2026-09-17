import assert from "node:assert/strict";
import test from "node:test";

import { applyBookingLaunchIndexes, bookingLaunchIndexes, inspectBookingLaunchIndexes } from "../scripts/booking-launch-indexes-lib.mjs";

function fakeDatabase(initial = {}) {
  const stored = new Map(Object.entries(structuredClone(initial)));
  const writes = [];
  return {
    writes,
    listCollections: ({ name }) => ({ hasNext: async () => stored.has(name) }),
    collection: (name) => ({
      indexes: async () => stored.get(name) ?? [],
      createIndex: async (key, options) => {
        writes.push({ collection: name, key, options });
        stored.set(name, [...(stored.get(name) ?? []), { key, ...options }]);
        return options.name;
      },
    }),
  };
}

test("launch index dry run is read-only and plans only the four approved indexes", async () => {
  const database = fakeDatabase();
  const plan = await applyBookingLaunchIndexes(database);
  assert.equal(plan.length, 4);
  assert.ok(plan.every((entry) => entry.action === "create"));
  assert.deepEqual(database.writes, []);
  assert.ok(bookingLaunchIndexes.every((entry) => entry.options.unique !== true));
  assert.equal(plan.find((entry) => entry.options.name === "cms_email_delivery_events_expiry_ttl").options.expireAfterSeconds, 0);
  assert.ok(!plan.some((entry) => /recovery/.test(entry.options.name)));
});

test("apply creates missing indexes and verifies them; a repeated apply writes nothing", async () => {
  const database = fakeDatabase();
  const plan = await applyBookingLaunchIndexes(database, { apply: true });
  assert.equal(database.writes.length, 4);
  assert.ok(plan.every((entry) => entry.action === "present"));
  await applyBookingLaunchIndexes(database, { apply: true });
  assert.equal(database.writes.length, 4);
});

test("equivalent existing index names are reused without replacement", async () => {
  const database = fakeDatabase({ cmsBookings: [{ key: { assignedStaffId: 1, status: 1, endsAt: 1 }, name: "legacy_equivalent" }] });
  const plan = await applyBookingLaunchIndexes(database, { apply: true });
  assert.equal(plan[0].action, "present");
  assert.equal(plan[0].existingName, "legacy_equivalent");
  assert.equal(database.writes.length, 3);
});

test("conflicting existing definitions prevent all writes", async (t) => {
  for (const existing of [
    { key: { providerMessageId: 1 }, unique: true },
    { key: { providerMessageId: 1 }, sparse: true },
    { key: { providerMessageId: 1 }, partialFilterExpression: { providerMessageId: { $type: "string" } } },
    { key: { providerMessageId: -1 } },
  ]) {
    await t.test(JSON.stringify(existing), async () => {
      const database = fakeDatabase({ cmsBookingNotifications: [{ name: "cms_notifications_provider_message_id", ...existing }] });
      assert.equal((await inspectBookingLaunchIndexes(database))[1].action, "conflict");
      await assert.rejects(applyBookingLaunchIndexes(database, { apply: true }), /No indexes were changed/);
      assert.deepEqual(database.writes, []);
    });
  }
});

test("an incompatible existing delivery-event TTL is reported instead of modified", async () => {
  const database = fakeDatabase({ cmsBookingEmailDeliveryEvents: [{ name: "cms_email_delivery_events_expiry_ttl", key: { expiresAtDate: 1 }, expireAfterSeconds: 30 }] });
  assert.equal((await inspectBookingLaunchIndexes(database))[3].action, "conflict");
  await assert.rejects(applyBookingLaunchIndexes(database, { apply: true }));
  assert.deepEqual(database.writes, []);
});
