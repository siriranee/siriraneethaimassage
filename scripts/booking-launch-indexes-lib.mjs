export const bookingLaunchIndexes = [
  {
    collection: "cmsBookings",
    key: { assignedStaffId: 1, status: 1, endsAt: 1 },
    options: { name: "cms_bookings_staff_status_end" },
  },
  {
    collection: "cmsBookingNotifications",
    key: { providerMessageId: 1 },
    options: { name: "cms_notifications_provider_message_id" },
  },
  {
    collection: "cmsBookingEmailDeliveryEvents",
    key: { providerMessageId: 1 },
    options: { name: "cms_email_delivery_events_provider_message_id" },
  },
  {
    collection: "cmsBookingEmailDeliveryEvents",
    key: { expiresAtDate: 1 },
    options: { name: "cms_email_delivery_events_expiry_ttl", expireAfterSeconds: 0 },
  },
];

function sameKey(first, second) {
  return JSON.stringify(Object.entries(first ?? {})) === JSON.stringify(Object.entries(second ?? {}));
}

function sameOptions(existing, expected) {
  return Boolean(existing.unique) === Boolean(expected.unique) &&
    existing.expireAfterSeconds === expected.expireAfterSeconds &&
    !existing.sparse && !existing.partialFilterExpression &&
    (!existing.collation || existing.collation.locale === "simple");
}

export async function inspectBookingLaunchIndexes(database) {
  const indexesByCollection = new Map();
  for (const { collection } of bookingLaunchIndexes) {
    if (indexesByCollection.has(collection)) continue;
    const exists = await database.listCollections({ name: collection }, { nameOnly: true }).hasNext();
    indexesByCollection.set(collection, exists ? await database.collection(collection).indexes() : []);
  }
  return bookingLaunchIndexes.map((definition) => {
    const indexes = indexesByCollection.get(definition.collection);
    const named = indexes.find((index) => index.name === definition.options.name);
    const matchingKey = indexes.find((index) => sameKey(index.key, definition.key));
    const existing = named ?? matchingKey;
    const compatible = existing && sameKey(existing.key, definition.key) && sameOptions(existing, definition.options);
    return {
      ...definition,
      action: !existing ? "create" : compatible ? "present" : "conflict",
      ...(existing ? { existingName: existing.name } : {}),
    };
  });
}

export async function applyBookingLaunchIndexes(database, { apply = false } = {}) {
  const before = await inspectBookingLaunchIndexes(database);
  if (!apply) return before;
  if (before.some((index) => index.action === "conflict")) {
    throw new Error("An existing index has incompatible options. No indexes were changed; review the conflict explicitly.");
  }
  for (const index of before) {
    if (index.action === "create") {
      await database.collection(index.collection).createIndex(index.key, index.options);
    }
  }
  const after = await inspectBookingLaunchIndexes(database);
  if (after.some((index) => index.action !== "present")) {
    throw new Error("The requested booking indexes could not all be verified after creation.");
  }
  return after;
}
