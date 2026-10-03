import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { Temporal } from "@js-temporal/polyfill";

import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";
import type { CmsRepository } from "@/server/cms/repositories/repository";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? {
          shortCircuit: true,
          url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href,
        }
      : nextResolve(specifier, context);
  },
});

async function setup() {
  Object.assign(process.env, {
    CMS_MODE: "mock",
    NODE_ENV: "test",
    RESEND_API_KEY: "re_test_auto_confirm_only",
    RESEND_FROM_EMAIL: "Test Spa <spa@example.invalid>",
    RESEND_BOOKING_TO_EMAIL: "owner@example.invalid",
    CMS_PII_ENCRYPTION_KEY: "33".repeat(32),
    NEXT_PUBLIC_SITE_URL: "https://example.invalid",
  });
  for (const key of ["CI", "VERCEL", "NETLIFY"]) delete process.env[key];
  for (const key of [
    "__siriraneeCmsRepository",
    "__siriraneeCmsMockState",
    "__siriraneeCmsMockQueue",
  ]) Reflect.deleteProperty(globalThis, key);

  const { getCmsRepository } = await import("@/server/cms/repositories");
  return prepareBookingSafetyFixture(getCmsRepository());
}

function enablePublicBookingMode(mockRepository: CmsRepository) {
  const productionModeRepository = new Proxy(mockRepository, {
    get(target, property, receiver) {
      if (property === "mode") return "mongodb";
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as CmsRepository;
  Reflect.set(globalThis, "__siriraneeCmsRepository", productionModeRepository);
  process.env.CMS_MODE = "mongodb";
  process.env.CMS_PUBLIC_BOOKING_READY = "true";
}

test("new CMS bookings confirm immediately and send each customer and therapist email once", async () => {
  const fixture = await setup();
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const {
    customerBookingConfirmationEmailNotificationId,
    dispatchBookingMutationEmails,
    therapistBookingEmailNotificationId,
  } = await import("@/server/cms/notification-service");
  const context = { ...fixture.context, idempotencyKey: "auto-confirm-future-booking-001" };

  // A stale CMS client may still submit the old pending value.
  const booking = await createAdminBooking(fixture.input, context);
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.assignedStaffId, fixture.therapist.id);
  assert.equal((await createAdminBooking(fixture.input, context)).id, booking.id);

  const customerId = customerBookingConfirmationEmailNotificationId(booking.id);
  const therapistId = therapistBookingEmailNotificationId(
    "assigned", booking.id, fixture.therapist.id, booking.version,
  );
  const notifications = await fixture.repository.listNotifications(booking.id);
  assert.equal(notifications.filter((notification) => notification.id === customerId).length, 1);
  assert.equal(notifications.filter((notification) => notification.id === therapistId).length, 1);
  assert.equal(notifications.filter((notification) => notification.channel === "email").length, 2);

  const sends: string[] = [];
  const result = () => ({ status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() });
  const options = {
    confirmation: {
      sender: async () => {
        sends.push("customer");
        return result();
      },
    },
    therapist: {
      sender: async (_booking: unknown, _recipient: unknown, event: string) => {
        sends.push(`therapist:${event}`);
        return result();
      },
    },
  };
  await dispatchBookingMutationEmails(fixture.repository, null, booking, options);
  await dispatchBookingMutationEmails(fixture.repository, null, booking, options);
  assert.deepEqual(sends, ["customer", "therapist:assigned"]);
  assert.equal((await fixture.repository.getNotification(customerId))?.status, "sent");
  assert.equal((await fixture.repository.getNotification(therapistId))?.status, "sent");
});

test("historical CMS bookings are confirmed without customer or therapist email outboxes", async () => {
  const fixture = await setup();
  const { createAdminBooking, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { dispatchBookingMutationEmails } = await import("@/server/cms/notification-service");
  const localDate = Temporal.Now.zonedDateTimeISO("Europe/Dublin")
    .toPlainDate()
    .subtract({ days: 1 })
    .toString();

  const slots = await getAdminAvailability({
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate,
  });
  assert.ok(slots.some((slot) => slot.localTime === "12:00"));

  const booking = await createAdminBooking({
    ...fixture.input,
    localDate,
  }, fixture.context);
  assert.equal(booking.status, "confirmed");
  assert.ok(Date.parse(booking.startsAt) <= Date.parse(booking.createdAt));
  assert.equal(booking.customer.email, fixture.input.email);
  const notifications = await fixture.repository.listNotifications(booking.id);
  assert.ok(notifications.some((notification) => notification.channel === "dashboard"));
  assert.equal(notifications.filter((notification) => notification.channel === "email").length, 0);

  const sends: string[] = [];
  await dispatchBookingMutationEmails(fixture.repository, null, booking, {
    confirmation: { sender: async () => {
      sends.push("customer");
      return { status: "sent", attempted: true, providerMessageId: randomUUID() };
    } },
    therapist: { sender: async () => {
      sends.push("therapist");
      return { status: "sent", attempted: true, providerMessageId: randomUUID() };
    } },
  });
  assert.deepEqual(sends, []);
  assert.equal((await fixture.repository.listNotifications(booking.id)).filter(
    (notification) => notification.channel === "email",
  ).length, 0);

  const withoutEmail = await createAdminBooking({
    ...fixture.input,
    customerName: "Demo Guest Without Historical Email",
    localDate,
    localTime: "13:00",
    email: "",
  }, fixture.context);
  assert.equal(withoutEmail.status, "confirmed");
  assert.equal(withoutEmail.customer.email, "");
  assert.equal((await fixture.repository.listNotifications(withoutEmail.id)).filter(
    (notification) => notification.channel === "email",
  ).length, 0);
});

test("CMS refuses upcoming bookings without a therapist email but permits historical records", async () => {
  const fixture = await setup();
  const { createAdminBooking, getAdminAvailability } = await import("@/server/cms/booking-service");
  const { CmsValidationError } = await import("@/server/cms/content-validation");
  const contact = await fixture.repository.getTherapistContact(fixture.therapist.id);
  assert.ok(contact);
  await fixture.repository.saveTherapistContact({
    ...contact,
    notificationEmail: "",
    version: contact.version + 1,
  }, contact.version);

  await assert.rejects(
    getAdminAvailability({
      serviceId: fixture.service.id,
      therapistId: fixture.therapist.id,
      durationMinutes: 60,
      localDate: fixture.localDate,
    }),
    (error: unknown) => error instanceof CmsValidationError && /therapist's notification email/.test(error.message),
  );
  await assert.rejects(
    createAdminBooking(fixture.input, fixture.context),
    (error: unknown) => error instanceof CmsValidationError && Boolean(error.fields.therapistId),
  );
  assert.deepEqual(await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate }), []);

  const pastDate = Temporal.Now.zonedDateTimeISO("Europe/Dublin")
    .toPlainDate().subtract({ days: 1 }).toString();
  const pastSlots = await getAdminAvailability({
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate: pastDate,
  });
  assert.ok(pastSlots.some((slot) => slot.localTime === fixture.input.localTime));
  const historical = await createAdminBooking({
    ...fixture.input,
    localDate: pastDate,
    email: "",
  }, fixture.context);
  assert.equal(historical.status, "confirmed");
  assert.equal((await fixture.repository.listNotifications(historical.id)).filter(
    (notification) => notification.channel === "email",
  ).length, 0);
});

test("CMS refuses future reschedules and legacy approvals when therapist contact becomes invalid", async () => {
  const fixture = await setup();
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  const { CmsValidationError } = await import("@/server/cms/content-validation");
  let booking = await createAdminBooking(fixture.input, fixture.context);
  const contact = await fixture.repository.getTherapistContact(fixture.therapist.id);
  assert.ok(contact);
  await fixture.repository.saveTherapistContact({
    ...contact,
    notificationEmail: "not-an-email",
    version: contact.version + 1,
  }, contact.version);

  await assert.rejects(
    updateAdminBooking(booking.id, {
      localTime: "14:00",
      changeReason: "customer-request",
    }, booking.version, fixture.context),
    (error: unknown) => error instanceof CmsValidationError && Boolean(error.fields.therapistId),
  );
  assert.deepEqual(await fixture.repository.getBooking(booking.id), booking);

  booking = await fixture.repository.saveBooking({ ...booking, status: "pending" }, booking.version);
  await assert.rejects(
    updateAdminBooking(booking.id, {
      status: "confirmed",
      changeReason: "customer-request",
    }, booking.version, fixture.context),
    (error: unknown) => error instanceof CmsValidationError && Boolean(error.fields.therapistId),
  );
  assert.equal((await fixture.repository.getBooking(booking.id))?.status, "pending");
});

test("a same-day CMS slot that already started is historical", async (t) => {
  const now = Temporal.Now.zonedDateTimeISO("Europe/Dublin");
  if (now.hour < 9) {
    t.skip("No 08:00 same-day slot has started yet in Dublin.");
    return;
  }
  const fixture = await setup();
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const booking = await createAdminBooking({
    ...fixture.input,
    localDate: now.toPlainDate().toString(),
    localTime: "08:00",
  }, fixture.context);
  assert.equal(booking.status, "confirmed");
  assert.ok(Date.parse(booking.startsAt) <= Date.parse(booking.createdAt));
  assert.equal((await fixture.repository.listNotifications(booking.id)).filter(
    (notification) => notification.channel === "email",
  ).length, 0);
});

test("an email-free historical booking cannot be moved into an upcoming appointment", async () => {
  const fixture = await setup();
  const { createAdminBooking, updateAdminBooking } = await import("@/server/cms/booking-service");
  const { CmsValidationError } = await import("@/server/cms/content-validation");
  const pastDate = Temporal.Now.zonedDateTimeISO("Europe/Dublin")
    .toPlainDate()
    .subtract({ days: 1 })
    .toString();
  const booking = await createAdminBooking({
    ...fixture.input,
    localDate: pastDate,
    email: "",
  }, fixture.context);
  await assert.rejects(
    updateAdminBooking(booking.id, {
      localDate: fixture.localDate,
      changeReason: "customer-request",
    }, booking.version, fixture.context),
    (error: unknown) => error instanceof CmsValidationError && /no customer email/i.test(error.message),
  );
  assert.deepEqual(await fixture.repository.getBooking(booking.id), booking);
  assert.equal((await fixture.repository.listNotifications(booking.id)).filter(
    (notification) => notification.channel === "email",
  ).length, 0);
});

test("CMS create route does not report email failure for historical bookings", async () => {
  const route = await readFile(resolve(process.cwd(), "src/app/api/cms/bookings/route.ts"), "utf8");
  assert.match(route, /isHistoricalAdminBooking\(booking\)[\s\S]*?\? \{ therapistEmails: \[\] \}[\s\S]*?: await dispatchBookingMutationEmails/);
});

test("public booking route allows bounded email attempts to finish", async () => {
  const route = await readFile(resolve(process.cwd(), "src/app/api/public/bookings/route.ts"), "utf8");
  assert.match(route, /export const maxDuration = 60;/);
  const planner = await readFile(resolve(process.cwd(), "src/components/booking/BookingPlanner.tsx"), "utf8");
  assert.match(planner, /If the email does not arrive, use Check booking status or contact us/);
});

test("new website bookings confirm and send customer and therapist emails once", async () => {
  const fixture = await setup();
  enablePublicBookingMode(fixture.repository);

  const { createPublicBooking } = await import("@/server/booking/public-booking");
  const {
    customerBookingConfirmationEmailNotificationId,
    therapistBookingEmailNotificationId,
  } = await import("@/server/cms/notification-service");
  const request = {
    customerName: fixture.input.customerName,
    phone: fixture.input.phone,
    email: fixture.input.email,
    notes: "",
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: fixture.input.durationMinutes,
    localDate: fixture.localDate,
    localTime: fixture.input.localTime,
    privacyAccepted: true,
    website: "",
  };
  const sends: string[] = [];
  const sent = () => ({
    status: "sent" as const,
    attempted: true as const,
    providerMessageId: randomUUID(),
  });
  const options = {
    idempotencyKey: "confirmed-website-booking-123456",
    requestId: "confirmed-website-booking-test",
    sendCustomerBookingEmail: async () => {
      sends.push("customer");
      return sent();
    },
    sendTherapistBookingEmail: async (_booking: unknown, _recipient: unknown, event: string) => {
      sends.push(`therapist:${event}`);
      return sent();
    },
  };

  const booking = await createPublicBooking(request, options);
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.source, "website");
  assert.equal(booking.assignedStaffId, fixture.therapist.id);
  assert.deepEqual(sends, ["customer", "therapist:assigned"]);

  const customerId = customerBookingConfirmationEmailNotificationId(booking.id);
  const therapistId = therapistBookingEmailNotificationId(
    "assigned", booking.id, fixture.therapist.id, booking.version,
  );
  const notifications = await fixture.repository.listNotifications(booking.id);
  assert.equal(notifications.filter((item) => item.channel === "email").length, 2);
  assert.equal((await fixture.repository.getNotification(customerId))?.status, "sent");
  assert.equal((await fixture.repository.getNotification(therapistId))?.status, "sent");

  const replay = await createPublicBooking(request, options);
  assert.equal(replay.id, booking.id);
  assert.equal(replay.status, "confirmed");
  assert.deepEqual(sends, ["customer", "therapist:assigned"]);
});

test("public booking and availability fail closed when the only therapist has no private email", async () => {
  const fixture = await setup();
  const contact = await fixture.repository.getTherapistContact(fixture.therapist.id);
  assert.ok(contact);
  await fixture.repository.saveTherapistContact({
    ...contact,
    notificationEmail: "",
    version: contact.version + 1,
  }, contact.version);
  enablePublicBookingMode(fixture.repository);

  const { isLivePublicBookingReady } = await import("@/server/booking/readiness");
  const { getPublicAvailability, getPublicAvailabilityCalendar } = await import("@/server/booking/public-availability");
  const { createPublicBooking } = await import("@/server/booking/public-booking");
  const publication = await fixture.repository.getPublishedContent();
  assert.ok(publication);
  assert.equal(await isLivePublicBookingReady(publication.snapshot, fixture.repository), false);

  const availability = await getPublicAvailability({
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate: fixture.localDate,
  });
  assert.equal(availability.status, "disabled");
  assert.deepEqual(availability.slots, []);
  const calendar = await getPublicAvailabilityCalendar({
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    month: fixture.localDate.slice(0, 7),
  });
  assert.equal(calendar.status, "disabled");
  assert.deepEqual(calendar.days, []);

  await assert.rejects(
    createPublicBooking({
      customerName: fixture.input.customerName,
      phone: fixture.input.phone,
      email: fixture.input.email,
      serviceId: fixture.service.id,
      therapistId: fixture.therapist.id,
      durationMinutes: 60,
      localDate: fixture.localDate,
      localTime: fixture.input.localTime,
      privacyAccepted: true,
    }, {
      idempotencyKey: "missing-therapist-contact-123456",
      requestId: "missing-therapist-contact-test",
    }),
    /Public booking is disabled\./,
  );
  assert.deepEqual(await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate }), []);
});

test("a bookable therapist without email cannot be selected even when another is ready", async () => {
  const fixture = await setup();
  const content = await fixture.repository.getContent();
  const unnotifiableTherapist = {
    ...fixture.therapist,
    id: "safety-test-unnotifiable-therapist",
    slug: "safety-test-unnotifiable-therapist",
    name: "Unnotifiable Therapist",
  };
  const updated = {
    ...content,
    revision: content.revision + 1,
    team: [...content.team, unnotifiableTherapist],
  };
  await fixture.repository.saveContent(updated, content.revision);
  await fixture.repository.savePublication({
    id: "safety-test-contact-publication",
    revision: updated.revision,
    publishedAt: new Date().toISOString(),
    publishedBy: fixture.actor.id,
    snapshot: updated,
  });
  enablePublicBookingMode(fixture.repository);

  const { isLivePublicBookingReady } = await import("@/server/booking/readiness");
  const { getPublicAvailability } = await import("@/server/booking/public-availability");
  const { createPublicBooking } = await import("@/server/booking/public-booking");
  assert.equal(await isLivePublicBookingReady(updated, fixture.repository), true);
  assert.equal(await isLivePublicBookingReady(updated, fixture.repository, unnotifiableTherapist.id), false);
  const availability = await getPublicAvailability({
    serviceId: fixture.service.id,
    therapistId: unnotifiableTherapist.id,
    durationMinutes: 60,
    localDate: fixture.localDate,
  });
  assert.equal(availability.status, "disabled");
  assert.deepEqual(availability.slots, []);
  await assert.rejects(
    createPublicBooking({
      customerName: fixture.input.customerName,
      phone: fixture.input.phone,
      email: fixture.input.email,
      serviceId: fixture.service.id,
      therapistId: unnotifiableTherapist.id,
      durationMinutes: 60,
      localDate: fixture.localDate,
      localTime: fixture.input.localTime,
      privacyAccepted: true,
    }, {
      idempotencyKey: "unnotifiable-selected-therapist-123456",
      requestId: "unnotifiable-selected-therapist-test",
    }),
    /Public booking is disabled\./,
  );
  assert.deepEqual(await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate }), []);
});

test("an unreadable private therapist contact disables public booking without breaking site rendering", async () => {
  const fixture = await setup();
  enablePublicBookingMode(fixture.repository);
  const unavailableContacts = new Proxy(fixture.repository, {
    get(target, property, receiver) {
      if (property === "mode") return "mongodb";
      if (property === "getTherapistContact") {
        return async () => { throw new Error("Private contact storage is unavailable."); };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as CmsRepository;
  Reflect.set(globalThis, "__siriraneeCmsRepository", unavailableContacts);

  const { getPublicSiteData } = await import("@/server/cms/public-adapter");
  const { getPublicAvailability } = await import("@/server/booking/public-availability");
  const site = await getPublicSiteData();
  assert.equal(site.booking.live, false);
  const availability = await getPublicAvailability({
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate: fixture.localDate,
  });
  assert.equal(availability.status, "disabled");
  assert.deepEqual(availability.slots, []);
});

test("a failed customer email does not undo a confirmed website booking or suppress the therapist email", async () => {
  const fixture = await setup();
  enablePublicBookingMode(fixture.repository);
  const { createPublicBooking } = await import("@/server/booking/public-booking");
  const {
    customerBookingConfirmationEmailNotificationId,
    therapistBookingEmailNotificationId,
  } = await import("@/server/cms/notification-service");
  const customerEmail = async () => ({
    status: "failed" as const,
    attempted: false as const,
    errorCode: "resend-configuration-missing",
  });
  let therapistSends = 0;
  const booking = await createPublicBooking({
    customerName: fixture.input.customerName,
    phone: fixture.input.phone,
    email: fixture.input.email,
    notes: "",
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: fixture.input.durationMinutes,
    localDate: fixture.localDate,
    localTime: fixture.input.localTime,
    privacyAccepted: true,
    website: "",
  }, {
    idempotencyKey: "confirmed-with-failed-email-123456",
    requestId: "confirmed-with-failed-email-test",
    sendCustomerBookingEmail: customerEmail,
    sendTherapistBookingEmail: async () => {
      therapistSends += 1;
      return { status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() };
    },
  });

  assert.equal(booking.status, "confirmed");
  assert.equal((await fixture.repository.getBooking(booking.id))?.status, "confirmed");
  assert.equal(therapistSends, 1);
  assert.equal((await fixture.repository.getNotification(
    customerBookingConfirmationEmailNotificationId(booking.id),
  ))?.status, "failed");
  assert.equal((await fixture.repository.getNotification(
    therapistBookingEmailNotificationId("assigned", booking.id, fixture.therapist.id, booking.version),
  ))?.status, "sent");
});

test("an idempotent replay keeps a pre-deployment pending request and its original privacy notice", async () => {
  const fixture = await setup();
  const mockRepository = fixture.repository;
  enablePublicBookingMode(mockRepository);

  const { createPublicBooking } = await import("@/server/booking/public-booking");
  const idempotencyKey = "legacy-privacy-replay-key-123456";
  const request = {
    customerName: fixture.input.customerName,
    phone: fixture.input.phone,
    email: fixture.input.email,
    notes: "",
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate: fixture.localDate,
    localTime: fixture.input.localTime,
    privacyAccepted: true,
    website: "",
  };
  let customerSends = 0;
  let ownerSends = 0;
  const senderOptions = {
    idempotencyKey,
    requestId: "legacy-notice-replay",
    sendCustomerBookingEmail: async () => {
      customerSends += 1;
      return { status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() };
    },
    sendOwnerBookingEmail: async () => {
      ownerSends += 1;
      return { status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() };
    },
    sendTherapistBookingEmail: async () =>
      ({ status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() }),
  };
  const created = await createPublicBooking(request, senderOptions);
  assert.equal(created.status, "confirmed");
  assert.equal(customerSends, 1);

  const priorNoticeVersion = "2026-09-18-2";
  const requestFingerprintHash = createHash("sha256").update(JSON.stringify({
    customerName: request.customerName,
    phone: request.phone,
    email: request.email,
    notes: request.notes,
    serviceId: request.serviceId,
    therapistId: request.therapistId,
    durationMinutes: request.durationMinutes,
    localDate: request.localDate,
    localTime: request.localTime,
    privacyNoticeVersion: priorNoticeVersion,
  })).digest("base64url");
  await mockRepository.saveBooking({
    ...created,
    status: "pending",
    privacyNoticeVersion: priorNoticeVersion,
    requestFingerprintHash,
  }, created.version);

  const replay = await createPublicBooking(request, senderOptions);
  assert.equal(replay.id, created.id);
  assert.equal(replay.status, "pending");
  assert.equal(replay.privacyNoticeVersion, priorNoticeVersion);
  assert.equal((await mockRepository.listBookings({ from: fixture.localDate, to: fixture.localDate })).length, 1);
  assert.equal(customerSends, 1);
  assert.equal(ownerSends, 1);
});

test("an old pending booking without email replays exactly but cannot create a new email-free booking", async () => {
  const fixture = await setup();
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const { CmsValidationError } = await import("@/server/cms/content-validation");
  const { recordTherapistBookingEmailPlans } = await import("@/server/cms/notification-service");
  const template = await createAdminBooking(fixture.input, fixture.context);
  assert.equal(await fixture.repository.deleteBooking(template.id, template.version), true);

  const idempotencyKey = "legacy-no-email-replay-123456";
  const priorNoticeVersion = "2026-09-18-2";
  const request = {
    customerName: fixture.input.customerName,
    phone: fixture.input.phone,
    email: "",
    notes: "",
    serviceId: fixture.service.id,
    therapistId: fixture.therapist.id,
    durationMinutes: 60,
    localDate: fixture.localDate,
    localTime: fixture.input.localTime,
    privacyAccepted: true,
    website: "",
  };
  const requestFingerprintHash = createHash("sha256").update(JSON.stringify({
    customerName: request.customerName,
    phone: request.phone,
    email: request.email,
    notes: request.notes,
    serviceId: request.serviceId,
    therapistId: request.therapistId,
    durationMinutes: request.durationMinutes,
    localDate: request.localDate,
    localTime: request.localTime,
    privacyNoticeVersion: priorNoticeVersion,
  })).digest("base64url");
  const legacyBooking = await fixture.repository.saveBooking({
    ...template,
    customer: { ...template.customer, email: "" },
    status: "pending",
    source: "website",
    privacyAcceptedAt: template.createdAt,
    privacyNoticeVersion: priorNoticeVersion,
    idempotencyKeyHash: createHash("sha256").update(idempotencyKey).digest("base64url"),
    requestFingerprintHash,
    demo: false,
    updatedBy: "public-booking",
  });
  await recordTherapistBookingEmailPlans(fixture.repository, null, legacyBooking);
  assert.equal((await fixture.repository.listNotifications(legacyBooking.id)).filter(
    (notification) => notification.audience === "customer" && notification.channel === "email",
  ).length, 0);

  enablePublicBookingMode(fixture.repository);
  const { createPublicBooking } = await import("@/server/booking/public-booking");
  let customerSends = 0;
  let ownerSends = 0;
  let therapistSends = 0;
  const senders = {
    idempotencyKey,
    requestId: "legacy-email-free-replay",
    sendCustomerBookingEmail: async () => {
      customerSends += 1;
      return { status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() };
    },
    sendOwnerBookingEmail: async () => {
      ownerSends += 1;
      return { status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() };
    },
    sendTherapistBookingEmail: async () => {
      therapistSends += 1;
      return { status: "sent" as const, attempted: true as const, providerMessageId: randomUUID() };
    },
  };
  const replay = await createPublicBooking(request, senders);
  assert.equal(replay.id, legacyBooking.id);
  assert.equal(replay.status, "pending");
  await createPublicBooking(request, senders);
  assert.equal(ownerSends, 1);
  assert.equal(therapistSends, 1);
  assert.equal(customerSends, 0);
  assert.equal((await fixture.repository.listBookings({ from: fixture.localDate, to: fixture.localDate })).length, 1);
  assert.equal((await fixture.repository.listNotifications(legacyBooking.id)).filter(
    (notification) => notification.audience === "customer" && notification.channel === "email",
  ).length, 0);

  await assert.rejects(
    createPublicBooking(request, { ...senders, idempotencyKey: "brand-new-email-free-booking-123456" }),
    CmsValidationError,
  );
});
