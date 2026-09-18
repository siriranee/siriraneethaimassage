import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { CmsBooking, CmsTeamRecord } from "@/domain/cms/types";
import { bookingEmailNeedsAttention } from "@/domain/cms/notification-presentation";
import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? {
          shortCircuit: true,
          url: pathToFileURL(
            `${process.cwd()}/tests/support/server-only-stub.mjs`,
          ).href,
        }
      : nextResolve(specifier, context);
  },
});

const business = {
  name: "Siriranee Thai Massage",
  address: "Harbour Road, Howth, Dublin",
};

async function setup() {
  process.env.CMS_MODE = "mock";
  process.env.CMS_PII_ENCRYPTION_KEY = Buffer.alloc(32, 29).toString("base64url");
  Reflect.set(process.env, "NODE_ENV", "test");
  delete process.env.CI;
  delete process.env.VERCEL;
  delete process.env.NETLIFY;
  for (const key of [
    "__siriraneeCmsRepository",
    "__siriraneeCmsMockState",
    "__siriraneeCmsMockQueue",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }

  const { getCmsRepository } = await import("@/server/cms/repositories");
  const fixture = await prepareBookingSafetyFixture(getCmsRepository());
  const content = await fixture.repository.getContent();
  const secondTherapist: CmsTeamRecord = {
    ...fixture.therapist,
    id: "safety-test-therapist-two",
    slug: "safety-test-therapist-two",
    name: "Demo Second Therapist",
    fullName: "Demo Second Therapist",
  };
  await fixture.repository.saveContent(
    {
      ...content,
      revision: content.revision + 1,
      team: [...content.team, secondTherapist],
    },
    content.revision,
  );
  await fixture.repository.saveTherapistContact({
    id: secondTherapist.id,
    notificationEmail: "demo.second.therapist@example.invalid",
    contactPhone: "",
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: fixture.actor.id,
  });
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const created = await createAdminBooking(fixture.input, fixture.context);
  const booking = await fixture.repository.saveBooking(
    { ...created, source: "website" },
    created.version,
  );
  return { ...fixture, booking, secondTherapist };
}

function changedBooking(
  current: CmsBooking,
  overrides: Partial<CmsBooking> = {},
): CmsBooking {
  return {
    ...current,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("pending request plans distinguish updates, reassignment and withdrawal", async () => {
  const { getTherapistBookingEmailPlans } = await import(
    "@/server/cms/notification-service"
  );
  const fixture = await setup();
  const current = fixture.booking;
  const updated = changedBooking(current, {
    localTime: "13:00",
    startsAt: new Date(Date.parse(current.startsAt) + 60 * 60 * 1_000).toISOString(),
    endsAt: new Date(Date.parse(current.endsAt) + 60 * 60 * 1_000).toISOString(),
  });
  assert.deepEqual(
    getTherapistBookingEmailPlans(current, updated).map((plan) => plan.event),
    ["request-updated"],
  );
  assert.match(
    getTherapistBookingEmailPlans(current, updated)[0]?.notificationId ?? "",
    /^therapist-booking-request-updated:/,
  );

  const reassigned = changedBooking(current, {
    assignedStaffId: fixture.secondTherapist.id,
    assignedStaffName: fixture.secondTherapist.name,
  });
  assert.deepEqual(
    getTherapistBookingEmailPlans(current, reassigned).map((plan) => [
      plan.event,
      plan.targetTeamMemberId,
    ]),
    [
      ["request-withdrawn", fixture.therapist.id],
      ["requested", fixture.secondTherapist.id],
    ],
  );

  const cancelled = changedBooking(current, { status: "cancelled" });
  assert.deepEqual(
    getTherapistBookingEmailPlans(current, cancelled).map((plan) => plan.event),
    ["request-withdrawn"],
  );
  assert.deepEqual(
    getTherapistBookingEmailPlans(current, changedBooking(current, {
      internalNotes: "Notes do not change the therapist request.",
    })),
    [],
  );
});

test("pending therapist templates are explicit and include customer details", async () => {
  const { renderTherapistBookingEmail } = await import(
    "@/server/booking/booking-email"
  );
  const booking = {
    reference: "SRN-20260919-PEND01",
    assignedStaffId: "therapist-1",
    serviceName: "Hot Oil Massage",
    durationMinutes: 60,
    localDate: "2026-09-19",
    localTime: "13:00",
    timezone: "Europe/Dublin" as const,
    status: "pending" as const,
    customer: {
      name: "Poomtawee Example",
      phone: "+353 89 000 0000",
      email: "poomtawee@outlook.com",
      notes: "Please use the side entrance.",
    },
  };
  const updated = renderTherapistBookingEmail(booking, {
    event: "request-updated",
    therapistName: "Mon",
    businessName: business.name,
    confirmationUrl: "https://siriranee.com/book/confirm?token=signed-capability",
  });
  const withdrawn = renderTherapistBookingEmail(booking, {
    event: "request-withdrawn",
    therapistName: "Mon",
    businessName: business.name,
    confirmationUrl: "https://siriranee.com/book/confirm?token=must-not-appear",
  });

  assert.match(
    updated.subject,
    /^อัปเดตคำขอที่รอการยืนยัน \/ PENDING request updated/,
  );
  assert.ok(
    updated.html.indexOf('<td lang="th" style="padding:30px') <
      updated.html.indexOf('<td lang="en-IE" style="padding:30px'),
  );
  assert.ok(
    updated.text.indexOf("สถานะตารางงาน") <
      updated.text.indexOf("Schedule status"),
  );
  assert.match(updated.text, /รอการยืนยันและยังไม่ใช่นัดหมายที่ยืนยันแล้ว/);
  assert.match(updated.text, /still pending and is not a confirmed appointment/i);
  assert.match(updated.html, /ตรวจสอบและยืนยันการจอง/);
  assert.match(updated.html, /Review and confirm booking/);
  assert.match(updated.text, /ไม่ต้องเข้าสู่ระบบ/);
  assert.match(updated.text, /no login required/i);
  assert.match(updated.text, /signed-capability/);
  assert.match(
    withdrawn.subject,
    /^ถอนคำขอที่รอการยืนยัน \/ Pending request withdrawn/,
  );
  assert.match(withdrawn.text, /รายการนี้ยังไม่เคยได้รับการยืนยัน/);
  assert.match(withdrawn.text, /not a confirmed appointment/i);
  assert.match(withdrawn.text, /Do not treat this request as an active appointment/i);
  assert.doesNotMatch(`${withdrawn.html}${withdrawn.text}`, /must-not-appear/);
  const rendered = `${updated.html}${updated.text}${withdrawn.html}${withdrawn.text}`;
  for (const expected of [
    "ข้อมูลลูกค้า",
    "Customer details",
    "Poomtawee Example",
    "+353 89 000 0000",
    "poomtawee@outlook.com",
    "Please use the side entrance.",
    "หมายเหตุการจอง",
    "Booking notes",
  ]) {
    assert.match(
      rendered,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("pending reassignment delivers an immutable withdrawal and a new pending request", async () => {
  const {
    attemptTherapistBookingEmail,
    canRetryBookingEmailNotification,
    getTherapistBookingEmailPlans,
    recordTherapistBookingEmailPlans,
  } = await import("@/server/cms/notification-service");
  const fixture = await setup();
  const current = fixture.booking;
  const next = changedBooking(current, {
    assignedStaffId: fixture.secondTherapist.id,
    assignedStaffName: fixture.secondTherapist.name,
    localTime: "13:00",
    startsAt: new Date(Date.parse(current.startsAt) + 60 * 60 * 1_000).toISOString(),
    endsAt: new Date(Date.parse(current.endsAt) + 60 * 60 * 1_000).toISOString(),
  });
  await fixture.repository.saveBooking(next, current.version);
  const plans = getTherapistBookingEmailPlans(current, next);
  const notifications = await recordTherapistBookingEmailPlans(
    fixture.repository,
    current,
    next,
  );
  assert.equal(notifications.length, 2);
  assert.deepEqual(
    notifications.map((notification) => notification.kind),
    ["booking-request-withdrawn", "booking-requested"],
  );
  const withdrawalNotification = notifications[0];
  assert.ok(withdrawalNotification?.therapistRemovedAppointment);
  assert.equal(
    withdrawalNotification?.therapistRemovedAppointment?.localTime,
    current.localTime,
  );
  assert.equal(
    withdrawalNotification && canRetryBookingEmailNotification(withdrawalNotification),
    true,
  );

  const delivered: Array<{
    event: string;
    therapistId: string;
    localTime: string;
    status: string;
  }> = [];
  for (const plan of plans) {
    const outcome = await attemptTherapistBookingEmail(
      fixture.repository,
      next,
      plan,
      {
        business,
        fingerprinter: () => `pending-plan-${plan.notificationId}`,
        sender: async (deliveryBooking, recipient, event) => {
          delivered.push({
            event,
            therapistId: recipient.id,
            localTime: deliveryBooking.localTime,
            status: deliveryBooking.status,
          });
          return {
            status: "sent",
            attempted: true,
            providerMessageId: `message-${event}`,
          };
        },
      },
    );
    assert.equal(outcome.status, "sent");
  }
  assert.deepEqual(delivered, [
    {
      event: "request-withdrawn",
      therapistId: fixture.therapist.id,
      localTime: current.localTime,
      status: "pending",
    },
    {
      event: "requested",
      therapistId: fixture.secondTherapist.id,
      localTime: next.localTime,
      status: "pending",
    },
  ]);
});

test("newer pending events supersede old retries and attention follows the active therapist", async () => {
  const {
    attemptTherapistBookingEmail,
    getTherapistBookingEmailPlans,
    recordTherapistBookingEmailPlans,
  } = await import("@/server/cms/notification-service");
  const fixture = await setup();
  const firstUpdate = changedBooking(fixture.booking, {
    localTime: "13:00",
    startsAt: new Date(Date.parse(fixture.booking.startsAt) + 60 * 60 * 1_000).toISOString(),
    endsAt: new Date(Date.parse(fixture.booking.endsAt) + 60 * 60 * 1_000).toISOString(),
  });
  await fixture.repository.saveBooking(firstUpdate, fixture.booking.version);
  const firstPlan = getTherapistBookingEmailPlans(fixture.booking, firstUpdate)[0]!;
  const [firstNotification] = await recordTherapistBookingEmailPlans(
    fixture.repository,
    fixture.booking,
    firstUpdate,
  );

  const secondUpdate = changedBooking(firstUpdate, {
    localTime: "14:00",
    startsAt: new Date(Date.parse(firstUpdate.startsAt) + 60 * 60 * 1_000).toISOString(),
    endsAt: new Date(Date.parse(firstUpdate.endsAt) + 60 * 60 * 1_000).toISOString(),
  });
  await fixture.repository.saveBooking(secondUpdate, firstUpdate.version);
  await recordTherapistBookingEmailPlans(
    fixture.repository,
    firstUpdate,
    secondUpdate,
  );

  let sends = 0;
  const outcome = await attemptTherapistBookingEmail(
    fixture.repository,
    secondUpdate,
    firstPlan,
    {
      business,
      fingerprinter: () => "superseded-pending-request",
      sender: async () => {
        sends += 1;
        return {
          status: "sent",
          attempted: true,
          providerMessageId: "must-not-send",
        };
      },
    },
  );
  assert.equal(outcome.status, "failed");
  assert.equal(sends, 0);
  assert.equal(
    (await fixture.repository.getNotification(firstPlan.notificationId))?.lastError,
    "booking-event-superseded",
  );

  const failedUpdate = {
    ...firstNotification!,
    status: "failed" as const,
    lastError: "resend-provider-unavailable",
  };
  assert.equal(
    bookingEmailNeedsAttention(failedUpdate, {
      status: "pending",
      demo: false,
      assignedStaffId: fixture.therapist.id,
    }),
    true,
  );
  assert.equal(
    bookingEmailNeedsAttention(failedUpdate, {
      status: "pending",
      demo: false,
      assignedStaffId: fixture.secondTherapist.id,
    }),
    false,
  );
  assert.equal(
    bookingEmailNeedsAttention(failedUpdate, {
      status: "confirmed",
      demo: false,
      assignedStaffId: fixture.therapist.id,
    }),
    false,
  );
});
