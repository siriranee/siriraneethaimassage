import { Temporal } from "@js-temporal/polyfill";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import type { CmsServiceRecord } from "@/domain/cms/types";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: pathToFileURL(
          `${process.cwd()}/node_modules/next/dist/compiled/server-only/empty.js`,
        ).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const bookingCount = 10;
const apply = process.argv.includes("--apply");
const batchDate = Temporal.Now.zonedDateTimeISO("Europe/Dublin")
  .toPlainDate()
  .toString()
  .replaceAll("-", "");
const batchPrefix = `Demo CMS Seed ${batchDate}`;

function activeOption(service: CmsServiceRecord) {
  return [...service.prices]
    .filter((price) => price.active)
    .sort((first, second) => first.durationMinutes - second.durationMinutes)[0];
}

async function main() {
  const [{ createAdminBooking, getAdminAvailability }, { getCmsRepository }] =
    await Promise.all([
      import("@/server/cms/booking-service"),
      import("@/server/cms/repositories"),
    ]);
  const repository = getCmsRepository();
  if (repository.mode !== "mongodb") {
    throw new Error("Test bookings can be seeded only into the configured MongoDB CMS.");
  }

  const users = await repository.listUsers();
  const actor =
    users.find((user) => user.username === "admin" && user.active) ??
    users.find((user) => user.role === "administrator" && user.active);
  if (!actor) throw new Error("An active CMS administrator is required.");

  const content = await repository.getContent();
  const services = content.services.filter((service) => activeOption(service));
  if (!services.length) {
    throw new Error("At least one published service with an active price is required.");
  }

  const existing = await repository.listBookings({ search: batchPrefix });
  const existingNames = new Set(existing.map((booking) => booking.customer.name));
  const missing = Array.from({ length: bookingCount }, (_, index) => index + 1).filter(
    (number) => !existingNames.has(`${batchPrefix} ${String(number).padStart(2, "0")}`),
  );

  if (!apply) {
    console.log(
      `Dry run: ${missing.length} of ${bookingCount} test bookings would be created for batch ${batchPrefix}.`,
    );
    process.exit(0);
  }

  const today = Temporal.Now.zonedDateTimeISO("Europe/Dublin").toPlainDate();
  const horizon = Math.max(1, Math.min(content.bookingSettings.bookingHorizonDays, 365));
  const created: Array<{ reference: string; localDate: string; localTime: string }> = [];
  let dateOffset = 1;

  for (const number of missing) {
    let saved = false;

    while (!saved && dateOffset <= horizon) {
      const localDate = today.add({ days: dateOffset }).toString();
      dateOffset += 1;
      const service = services[(number - 1) % services.length];
      const price = activeOption(service)!;
      const slots = await getAdminAvailability({
        serviceId: service.id,
        durationMinutes: price.durationMinutes,
        localDate,
      });
      const slot = slots[0];
      if (!slot) continue;

      const booking = await createAdminBooking(
      {
        customerName: `${batchPrefix} ${String(number).padStart(2, "0")}`,
        phone: `000000${String(number).padStart(4, "0")}`,
        email: `demo.booking.${batchDate}.${number}@example.invalid`,
        customerNotes: "Fictional test booking. Do not contact.",
        serviceId: service.id,
        durationMinutes: price.durationMinutes,
        localDate,
        localTime: slot.localTime,
        status: "confirmed",
        source: "administrator",
        internalNotes: `Test fixture from batch ${batchPrefix}. Safe to delete.`,
      },
      {
        actor,
        requestId: `test-booking-seed:${batchDate}:${number}`,
      },
    );

      created.push({
        reference: booking.reference,
        localDate: booking.localDate,
        localTime: booking.localTime,
      });
      saved = true;
    }

    if (!saved) {
      throw new Error(`No available slot was found for test booking ${number}.`);
    }
  }

  const verified = await repository.listBookings({ search: batchPrefix });
  if (verified.length !== bookingCount) {
    throw new Error(
      `Expected ${bookingCount} test bookings in batch ${batchPrefix}, found ${verified.length}.`,
    );
  }

  console.log(`Created ${created.length} test booking(s); verified ${verified.length} in ${batchPrefix}.`);
  for (const booking of created) {
    console.log(`${booking.reference} | ${booking.localDate} ${booking.localTime}`);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Test booking seed failed.");
  process.exit(1);
});
