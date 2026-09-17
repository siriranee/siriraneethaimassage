import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import { Temporal } from "@js-temporal/polyfill";

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

const apply = process.argv.includes("--apply");
const therapistSlugs = ["siriranee", "mon-ubon"] as const;

async function main() {
  const [
    {
      createAdminBooking,
      deleteAdminBooking,
      getAdminAvailability,
      updateAdminBooking,
    },
    { getCmsContent, updateCmsTeamMember },
    { getCmsRepository, CmsConflictError },
  ] = await Promise.all([
    import("@/server/cms/booking-service"),
    import("@/server/cms/content-service"),
    import("@/server/cms/repositories"),
  ]);
  const repository = getCmsRepository();
  if (repository.mode !== "mongodb") {
    throw new Error("The live therapist workflow test requires MongoDB CMS mode.");
  }

  const users = await repository.listUsers();
  const actor =
    users.find((user) => user.username === "admin" && user.active) ??
    users.find((user) => user.role === "administrator" && user.active);
  if (!actor) throw new Error("An active CMS administrator is required.");

  const content = await getCmsContent();
  const therapists = therapistSlugs.map((slug) =>
    content.team.find(
      (member) =>
        member.slug === slug &&
        member.publicProfile &&
        member.operationalActive &&
        !member.archived,
    ),
  );
  assert.ok(therapists.every(Boolean), "Both active public therapists are required.");
  const service = content.services.find(
    (candidate) =>
      candidate.prices.some((price) => price.active) &&
      therapists.every((therapist) => therapist!.serviceIds.includes(candidate.id)),
  );
  const price = service?.prices.find((candidate) => candidate.active);
  assert.ok(service && price, "A shared active treatment and duration are required.");

  if (!apply) {
    console.log("Dry run: both therapist profiles and a shared treatment are ready for workflow testing.");
    process.exit(0);
  }

  for (const therapist of therapists) {
    let currentBookingId = "";
    let currentVersion = 0;
    try {
      const today = Temporal.Now.zonedDateTimeISO("Europe/Dublin").toPlainDate();
      let selectedDate = "";
      let selectedTimes: readonly string[] = [];
      for (
        let offset = 1;
        offset <= Math.min(content.bookingSettings.bookingHorizonDays, 365);
        offset += 1
      ) {
        const localDate = today.add({ days: offset }).toString();
        const slots = await getAdminAvailability({
          serviceId: service.id,
          durationMinutes: price.durationMinutes,
          localDate,
          therapistId: therapist!.id,
        });
        if (slots.length >= 2) {
          selectedDate = localDate;
          selectedTimes = slots.slice(0, 2).map((slot) => slot.localTime);
          break;
        }
      }
      assert.ok(selectedDate && selectedTimes.length === 2, "Two test slots are required.");

      const created = await createAdminBooking(
        {
          customerName: "Therapist CMS workflow test",
          phone: "0000000000",
          email: "",
          customerNotes: "Automated CMS workflow fixture. Do not contact.",
          serviceId: service.id,
          therapistId: therapist!.id,
          durationMinutes: price.durationMinutes,
          localDate: selectedDate,
          localTime: selectedTimes[0],
          status: "pending",
          source: "administrator",
          internalNotes: "Temporary therapist workflow test; delete after verification.",
        },
        {
          actor,
          requestId: `therapist-workflow:create:${therapist!.slug}`,
          idempotencyKey: `therapist-workflow-${therapist!.slug}-${Date.now()}`,
        },
      );
      currentBookingId = created.id;
      currentVersion = created.version;
      assert.equal(created.assignedStaffId, therapist!.id);

      const confirmed = await updateAdminBooking(
        created.id,
        {
          status: "confirmed",
          internalNotes: created.internalNotes,
          changeReason: "other-operational",
        },
        created.version,
        { actor, requestId: `therapist-workflow:confirm:${therapist!.slug}` },
      );
      currentVersion = confirmed.version;

      await assert.rejects(
        () =>
          updateCmsTeamMember(
            therapist!.id,
            {
              name: therapist!.name,
              fullName: therapist!.fullName,
              publicRole: therapist!.publicRole,
              operationalActive: false,
            },
            therapist!.version,
            { actor, requestId: `therapist-workflow:lifecycle:${therapist!.slug}` },
          ),
        CmsConflictError,
      );

      const rescheduled = await updateAdminBooking(
        confirmed.id,
        {
          localDate: selectedDate,
          localTime: selectedTimes[1],
          status: "confirmed",
          internalNotes: confirmed.internalNotes,
          changeReason: "scheduling-correction",
        },
        confirmed.version,
        { actor, requestId: `therapist-workflow:reschedule:${therapist!.slug}` },
      );
      currentVersion = rescheduled.version;

      const cancelled = await updateAdminBooking(
        rescheduled.id,
        {
          status: "cancelled",
          internalNotes: rescheduled.internalNotes,
          changeReason: "other-operational",
        },
        rescheduled.version,
        { actor, requestId: `therapist-workflow:cancel:${therapist!.slug}` },
      );
      currentVersion = cancelled.version;

      const therapistNotifications = (
        await repository.listNotifications(cancelled.id, 50)
      ).filter((notification) => notification.audience === "therapist");
      assert.deepEqual(
        new Set(therapistNotifications.map((notification) => notification.kind)),
        new Set([
          "booking-assigned",
          "booking-rescheduled",
          "booking-cancelled",
        ]),
      );
      assert.ok(
        therapistNotifications.every(
          (notification) =>
            notification.status === "queued" &&
            notification.targetTeamMemberId === therapist!.id,
        ),
      );

      await deleteAdminBooking(cancelled.id, cancelled.version, {
        actor,
        requestId: `therapist-workflow:cleanup:${therapist!.slug}`,
      });
      currentBookingId = "";
      assert.equal(await repository.getBooking(cancelled.id), null);
      assert.equal((await repository.listNotifications(cancelled.id, 50)).length, 0);
      console.log(`Verified create, assign, confirm, guard, reschedule, cancel and cleanup for ${therapist!.name}.`);
    } finally {
      if (currentBookingId) {
        const current = await repository.getBooking(currentBookingId);
        if (current) {
          await deleteAdminBooking(current.id, current.version || currentVersion, {
            actor,
            requestId: `therapist-workflow:emergency-cleanup:${therapist!.slug}`,
          });
        }
      }
    }
  }

  console.log("Therapist CMS workflow passed with no live email delivery attempts.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Therapist workflow test failed.");
  process.exit(1);
});
