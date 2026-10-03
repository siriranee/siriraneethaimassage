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
  const options = content.services.flatMap((service) => {
    const price = activeOption(service);
    const therapists = content.team.filter(
      (member) =>
        member.operationalActive &&
        !member.archived &&
        member.serviceIds.includes(service.id),
    );
    return price && therapists.length ? [{ service, price, therapists }] : [];
  });
  if (!options.length) {
    throw new Error("An active treatment with a qualified, active therapist is required.");
  }

  const existing = await repository.listBookings({ search: batchPrefix });
  const existingNames = new Set(existing.map((booking) => booking.customer.name));
  const missing = Array.from({ length: bookingCount }, (_, index) => index + 1).filter(
    (number) => !existingNames.has(`${batchPrefix} ${String(number).padStart(2, "0")}`),
  );

  if (!apply) {
    console.log(
      `Dry run: ${missing.length} of ${bookingCount} historical, confirmed test bookings would be created for batch ${batchPrefix}. Past appointments do not queue customer or therapist emails.`,
    );
    process.exit(0);
  }

  const today = Temporal.Now.zonedDateTimeISO("Europe/Dublin").toPlainDate();
  const historyDays = 180;
  const created: Array<{ reference: string; localDate: string; localTime: string }> = [];
  let dateOffset = 1;

  for (const number of missing) {
    let saved = false;

    while (!saved && dateOffset <= historyDays) {
      // Historical CMS bookings are confirmed without creating email jobs.
      const localDate = today.subtract({ days: dateOffset }).toString();
      dateOffset += 1;
      const { service, price, therapists } = options[(number - 1) % options.length];
      const therapist = therapists[(number - 1) % therapists.length];
      const slots = await getAdminAvailability({
        serviceId: service.id,
        durationMinutes: price.durationMinutes,
        localDate,
        therapistId: therapist.id,
      });
      const slot = slots[0];
      if (!slot) continue;

      const booking = await createAdminBooking(
        {
          customerName: `${batchPrefix} ${String(number).padStart(2, "0")}`,
          phone: `000000${String(number).padStart(4, "0")}`,
          email: "",
          customerNotes: "Fictional historical test booking. Do not contact.",
          serviceId: service.id,
          therapistId: therapist.id,
          durationMinutes: price.durationMinutes,
          localDate,
          localTime: slot.localTime,
          status: "confirmed",
          source: "administrator",
          internalNotes: `Historical test fixture from batch ${batchPrefix}. Safe to delete.`,
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
      throw new Error(`No historical available slot was found for test booking ${number}.`);
    }
  }

  const verified = await repository.listBookings({ search: batchPrefix });
  if (verified.length !== bookingCount) {
    throw new Error(
      `Expected ${bookingCount} test bookings in batch ${batchPrefix}, found ${verified.length}.`,
    );
  }

  console.log(`Created ${created.length} historical confirmed test booking(s) without email jobs; verified ${verified.length} in ${batchPrefix}.`);
  for (const booking of created) {
    console.log(`${booking.reference} | ${booking.localDate} ${booking.localTime}`);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Test booking seed failed.");
  process.exit(1);
});
