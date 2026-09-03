import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { Temporal } from "@js-temporal/polyfill";

import type { CmsServiceRecord } from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories/repository";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: pathToFileURL(
          `${process.cwd()}/tests/support/server-only-stub.mjs`,
        ).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

type MockCmsGlobals = typeof globalThis & {
  __siriraneeCmsRepository?: unknown;
  __siriraneeCmsMockState?: unknown;
  __siriraneeCmsMockQueue?: Promise<void>;
};

function resetIsolatedMockCms() {
  process.env.CMS_MODE = "mock";
  Reflect.set(process.env, "NODE_ENV", "test");
  delete process.env.CI;
  delete process.env.VERCEL;
  delete process.env.NETLIFY;

  const cmsGlobal = globalThis as MockCmsGlobals;
  delete cmsGlobal.__siriraneeCmsRepository;
  delete cmsGlobal.__siriraneeCmsMockState;
  delete cmsGlobal.__siriraneeCmsMockQueue;
}

function serviceInput(index: number, overrides: Record<string, unknown> = {}) {
  const name = `Launch test treatment ${index}`;

  return {
    slug: `launch-test-treatment-${index}`,
    name,
    shortDescription:
      "A fictional treatment used only by the isolated launch verification.",
    longDescription:
      "This fictional treatment exercises validation, persistence and immediate publication without writing to MongoDB or uploading to Cloudinary.",
    imageUrl: "/images/spa/traditional-thai-massage.webp",
    imageAlt: `${name} demonstration treatment room`,
    hero: {
      imageUrl: "/images/spa/traditional-thai-massage.webp",
      altText: `${name} demonstration treatment room prepared for a guest`,
    },
    galleryImages: [],
    prices: [
      {
        durationMinutes: 60,
        priceCents: 6_000 + index * 500,
        active: true,
      },
    ],
    idealFor: ["Fictional launch workflow verification"],
    highlights: ["One-hour demonstration appointment"],
    priceNote: "Test fixture only.",
    seoTitle: `${name} | Siriranee test`,
    seoDescription:
      "A fictional Siriranee treatment used to verify the complete service publishing workflow before launch.",
    ...overrides,
  };
}

test("isolated launch verification covers services, ten bookings and administrator lifecycle", async () => {
  resetIsolatedMockCms();

  const [
    { hashCmsSessionToken },
    { loginCmsMockDemo, loginCmsUser },
    { createPublicBooking },
    { createAdminBooking, updateAdminBooking },
    { createCmsService, updateCmsService },
    { CmsValidationError },
    { CmsConflictError, getCmsRepository },
    {
      createManagedCmsUser,
      resetManagedCmsUserPassword,
      revokeManagedCmsUserSessions,
      updateManagedCmsUser,
    },
  ] = await Promise.all([
    import("@/server/cms/auth/session"),
    import("@/server/cms/auth/login-service"),
    import("@/server/booking/public-booking"),
    import("@/server/cms/booking-service"),
    import("@/server/cms/content-service"),
    import("@/server/cms/content-validation"),
    import("@/server/cms/repositories"),
    import("@/server/cms/user-service"),
  ]);

  const repository = getCmsRepository();
  assert.equal(repository.mode, "mock");
  const actor = await repository.findUserById("mock-administrator");
  assert.ok(actor);
  const context = { actor, requestId: "isolated-launch-verification" };

  const services: CmsServiceRecord[] = [];
  for (let index = 1; index <= 3; index += 1) {
    services.push(await createCmsService(serviceInput(index), context));
  }

  const updatedService = await updateCmsService(
    services[0].id,
    serviceInput(1, {
      name: "Launch test treatment one updated",
      prices: [{ durationMinutes: 60, priceCents: 7_250, active: true }],
    }),
    services[0].version,
    context,
  );
  assert.equal(updatedService.version, 2);
  assert.equal(updatedService.prices[0]?.priceCents, 7_250);

  const revisionBeforeRejectedService = (await repository.getContent()).revision;
  await assert.rejects(
    () =>
      createCmsService(
        serviceInput(4, { slug: services[1].slug }),
        context,
      ),
    CmsValidationError,
  );
  const contentAfterRejectedService = await repository.getContent();
  assert.equal(contentAfterRejectedService.revision, revisionBeforeRejectedService);
  assert.equal(contentAfterRejectedService.services.length, 3);

  const publicationAfterServices = await repository.getPublishedContent();
  assert.ok(publicationAfterServices);
  assert.equal(publicationAfterServices.snapshot.services.length, 3);
  assert.equal(
    publicationAfterServices.snapshot.services.find(
      (service) => service.id === updatedService.id,
    )?.version,
    2,
  );

  await repository.transaction(async (transaction) => {
    const current = await transaction.getContent();
    const prepared = {
      ...current,
      revision: current.revision + 1,
      site: {
        ...current.site,
        openingHoursConfirmed: true,
        weeklyHours: current.site.weeklyHours.map((hours) => ({
          ...hours,
          open: true,
          opens: "08:00",
          closes: "20:00",
        })),
      },
      bookingSettings: {
        ...current.bookingSettings,
        publicBookingEnabled: true,
        rulesConfirmed: true,
        minimumNoticeMinutes: 0,
        bookingHorizonDays: 365,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    };
    await transaction.saveContent(prepared, current.revision);
    await transaction.savePublication({
      id: "isolated-launch-publication",
      revision: prepared.revision,
      publishedAt: prepared.updatedAt,
      publishedBy: actor.id,
      snapshot: prepared,
    });
  });

  const localDate = Temporal.Now.zonedDateTimeISO("Europe/Dublin")
    .toPlainDate()
    .add({ days: 14 })
    .toString();
  const times = Array.from(
    { length: 10 },
    (_, index) => `${String(8 + index).padStart(2, "0")}:00`,
  );

  const bookings = [];
  for (const [index, localTime] of times.entries()) {
    const service = services[index % services.length];
    bookings.push(
      await createAdminBooking(
        {
          customerName: `Demo Launch Guest ${index + 1}`,
          phone: `+353 85 000 ${String(index).padStart(4, "0")}`,
          email: `demo.launch.${index + 1}@example.invalid`,
          customerNotes: "Fictional customer created by isolated launch tests.",
          serviceId: service.id,
          durationMinutes: 60,
          localDate,
          localTime,
          status: "confirmed",
          source: "administrator",
          internalNotes: "Ephemeral launch fixture; never persist to live providers.",
        },
        context,
      ),
    );
  }

  assert.equal(bookings.length, 10);
  assert.equal(new Set(bookings.map((booking) => booking.id)).size, 10);
  assert.equal(new Set(bookings.map((booking) => booking.reference)).size, 10);
  assert.ok(bookings.every((booking) => booking.demo));
  assert.ok(bookings.every((booking) => booking.assignedStaffId === ""));
  assert.deepEqual(
    (await repository.listBookings({ from: localDate, to: localDate })).map(
      (booking) => booking.localTime,
    ),
    times,
  );
  assert.equal(
    (await repository.listBookingOccupancy(localDate, localDate)).length,
    10,
  );
  assert.equal((await repository.listNotifications(undefined, 100)).length, 30);

  const completedBooking = await updateAdminBooking(
    bookings[0].id,
    {
      status: "completed",
      internalNotes: "Completed during the isolated launch workflow.",
      changeReason: "other-operational",
    },
    bookings[0].version,
    context,
  );
  assert.equal(completedBooking.status, "completed");
  assert.equal(completedBooking.version, 2);
  assert.equal(
    (await repository.listNotifications(completedBooking.id, 20)).filter(
      (notification) => notification.kind === "booking-completed",
    ).length,
    3,
  );

  const demoLogin = await loginCmsMockDemo("isolated-demo-login");
  const demoToken = "token" in demoLogin ? demoLogin.token : undefined;
  if (typeof demoToken !== "string") assert.fail("Demo login did not return a token.");
  assert.ok(
    await repository.findSessionByTokenHash(
      hashCmsSessionToken(demoToken),
    ),
  );

  const initialPassword = "LaunchStaff123";
  const replacementPassword = "LaunchStaff456";
  const createdUser = await createManagedCmsUser(
    {
      username: "launchstaff",
      displayName: "Launch Test Staff",
      role: "staff",
      newPassword: initialPassword,
      confirmPassword: initialPassword,
      currentPassword: "",
    },
    { actor, requestId: "isolated-user-create" },
  );
  assert.equal(createdUser.user.role, "staff");
  assert.equal("passwordHash" in createdUser.user, false);

  const firstStaffLogin = await loginCmsUser({
    username: "launchstaff",
    password: initialPassword,
    address: "192.0.2.41",
    requestId: "isolated-user-login-1",
  });
  const firstStaffToken =
    "token" in firstStaffLogin ? firstStaffLogin.token : undefined;
  if (typeof firstStaffToken !== "string") {
    assert.fail("The created staff account could not sign in.");
  }
  const firstStaffTokenHash = hashCmsSessionToken(firstStaffToken);
  assert.ok(await repository.findSessionByTokenHash(firstStaffTokenHash));

  const promotedUser = await updateManagedCmsUser(
    createdUser.user.id,
    {
      expectedVersion: createdUser.user.version,
      displayName: "Launch Test Administrator",
      role: "administrator",
      active: true,
      currentPassword: "",
    },
    { actor, requestId: "isolated-user-promote" },
  );
  assert.equal(promotedUser.sessionsRevoked, true);
  assert.equal(await repository.findSessionByTokenHash(firstStaffTokenHash), null);

  const resetUser = await resetManagedCmsUserPassword(
    createdUser.user.id,
    {
      expectedVersion: promotedUser.user.version,
      newPassword: replacementPassword,
      confirmPassword: replacementPassword,
      currentPassword: "",
    },
    { actor, requestId: "isolated-user-password-reset" },
  );
  assert.equal(resetUser.sessionsRevoked, true);

  const rejectedOldPassword = await loginCmsUser({
    username: "launchstaff",
    password: initialPassword,
    address: "192.0.2.42",
    requestId: "isolated-user-old-password",
  });
  assert.equal(
    "code" in rejectedOldPassword ? rejectedOldPassword.code : "unexpected",
    "invalid_credentials",
  );

  const replacementLogin = await loginCmsUser({
    username: "launchstaff",
    password: replacementPassword,
    address: "192.0.2.43",
    requestId: "isolated-user-login-2",
  });
  const replacementToken =
    "token" in replacementLogin ? replacementLogin.token : undefined;
  if (typeof replacementToken !== "string") {
    assert.fail("The reset account password could not sign in.");
  }
  const replacementTokenHash = hashCmsSessionToken(replacementToken);
  assert.ok(await repository.findSessionByTokenHash(replacementTokenHash));

  const revokedUser = await revokeManagedCmsUserSessions(
    createdUser.user.id,
    {
      expectedVersion: resetUser.user.version,
      confirmRevoke: true,
      currentPassword: "",
    },
    { actor, requestId: "isolated-user-session-revoke" },
  );
  assert.equal(revokedUser.sessionsRevoked, true);
  assert.equal(await repository.findSessionByTokenHash(replacementTokenHash), null);

  const productionModeRepository = new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "mode") return "mongodb";
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as CmsRepository;
  (globalThis as MockCmsGlobals).__siriraneeCmsRepository =
    productionModeRepository;
  process.env.CMS_MODE = "mongodb";
  process.env.CMS_PUBLIC_BOOKING_READY = "true";
  process.env.CMS_PII_ENCRYPTION_KEY = "00".repeat(32);
  process.env.RESEND_API_KEY = "re_launch_workflow_test_123456";
  process.env.RESEND_FROM_EMAIL = "Siriranee Bookings <bookings@siriranee.example>";
  process.env.RESEND_BOOKING_TO_EMAIL = "owner@siriranee.example";

  const publicDate = Temporal.PlainDate.from(localDate).add({ days: 1 }).toString();
  const publicRequest = {
    customerName: "Demo Public Guest",
    phone: "+353 85 111 2222",
    email: "demo.public@example.invalid",
    notes: "Fictional public booking used only in isolated launch verification.",
    serviceId: services[1].id,
    durationMinutes: 60,
    localDate: publicDate,
    localTime: "08:00",
    privacyAccepted: true,
    website: "",
  };
  const ownerEmailAttempts: string[] = [];
  const sendOwnerBookingEmail = async (booking: { readonly id: string }) => {
    ownerEmailAttempts.push(booking.id);
    return {
      status: "sent" as const,
      attempted: true as const,
      providerMessageId: "isolated-resend-email-id",
    };
  };
  const publicBooking = await createPublicBooking(publicRequest, {
    idempotencyKey: "isolated-public-booking-request-0001",
    requestId: "isolated-public-booking",
    sendOwnerBookingEmail,
  });
  assert.equal(publicBooking.source, "website");
  assert.equal(publicBooking.status, "pending");
  assert.equal(publicBooking.demo, false);
  assert.ok(publicBooking.privacyAcceptedAt);
  assert.ok(publicBooking.capacityExpiresAt > publicBooking.createdAt);

  const idempotentRetry = await createPublicBooking(publicRequest, {
    idempotencyKey: "isolated-public-booking-request-0001",
    requestId: "isolated-public-booking-retry",
    sendOwnerBookingEmail,
  });
  assert.equal(idempotentRetry.id, publicBooking.id);
  assert.equal(
    (await repository.listBookings({ from: publicDate, to: publicDate })).length,
    1,
  );
  assert.deepEqual(ownerEmailAttempts, [publicBooking.id]);

  await assert.rejects(
    () =>
      createPublicBooking(
        { ...publicRequest, notes: "A conflicting payload." },
        {
          idempotencyKey: "isolated-public-booking-request-0001",
          requestId: "isolated-public-booking-conflict",
          sendOwnerBookingEmail,
        },
      ),
    CmsConflictError,
  );
  await assert.rejects(
    () =>
      createPublicBooking(publicRequest, {
        idempotencyKey: "isolated-public-booking-request-0002",
        requestId: "isolated-public-booking-capacity-conflict",
        sendOwnerBookingEmail,
      }),
    CmsConflictError,
  );
  assert.deepEqual(ownerEmailAttempts, [publicBooking.id]);

  const failedEmailDate = Temporal.PlainDate.from(publicDate)
    .add({ days: 1 })
    .toString();
  let failedEmailAttempts = 0;
  const bookingWithFailedEmail = await createPublicBooking(
    {
      ...publicRequest,
      customerName: "Demo Public Guest Without Email",
      email: "",
      localDate: failedEmailDate,
    },
    {
      idempotencyKey: "isolated-public-booking-request-0003",
      requestId: "isolated-public-booking-email-failure",
      sendOwnerBookingEmail: async () => {
        failedEmailAttempts += 1;
        throw new Error("Simulated provider outage");
      },
    },
  );
  assert.equal(bookingWithFailedEmail.status, "pending");
  assert.equal(failedEmailAttempts, 1);
  assert.equal(
    (await repository.listBookings({
      from: failedEmailDate,
      to: failedEmailDate,
    })).length,
    1,
  );
  assert.ok(
    (await repository.listNotifications(bookingWithFailedEmail.id, 20)).some(
      (notification) =>
        notification.audience === "owner" &&
        notification.channel === "email" &&
        notification.status === "indeterminate" &&
        notification.lastError === "resend-unexpected-error" &&
        notification.attemptCount === 1,
    ),
  );

  const publicNotifications = await repository.listNotifications(
    publicBooking.id,
    20,
  );
  assert.equal(publicNotifications.length, 2);
  assert.ok(
    publicNotifications.some(
      (notification) =>
        notification.channel === "dashboard" &&
        notification.status === "preview",
    ),
  );
  assert.ok(
    publicNotifications.some(
      (notification) =>
        notification.audience === "owner" &&
        notification.channel === "email" &&
        notification.status === "sent" &&
        notification.providerMessageId === "isolated-resend-email-id" &&
        notification.attemptCount === 1,
    ),
  );

  const audits = await repository.listAudit(100);
  assert.equal(
    audits.filter((event) => event.action === "booking.created").length,
    10,
  );
  for (const action of [
    "service.created",
    "service.updated",
    "booking.updated",
    "booking.requested",
    "user.created",
    "user.access-updated",
    "user.password-reset",
    "user.sessions-revoked",
  ]) {
    assert.ok(audits.some((event) => event.action === action), action);
  }
});
