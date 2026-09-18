import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { CreateEmailOptions, CreateEmailResponse } from "resend";

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

const testSecret = "booking-confirmation-test-secret";
const encryptionKey = Buffer.alloc(32, 17).toString("base64url");

function tokenBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-token-123",
    serviceId: "service-1",
    serviceSlug: "test-treatment",
    serviceName: "Test treatment",
    durationMinutes: 60,
    priceCents: 6_500,
    currency: "EUR" as const,
    startsAt: "2026-09-19T12:00:00.000Z",
    endsAt: "2026-09-19T13:00:00.000Z",
    localDate: "2026-09-19",
    localTime: "13:00",
    timezone: "Europe/Dublin" as const,
    assignedStaffId: "therapist-1",
    assignedStaffName: "Test Therapist",
    createdAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

async function setup() {
  process.env.CMS_MODE = "mock";
  process.env.CMS_PII_ENCRYPTION_KEY = encryptionKey;
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
  const { createAdminBooking } = await import("@/server/cms/booking-service");
  const created = await createAdminBooking(fixture.input, fixture.context);
  const booking = await fixture.repository.saveBooking(
    { ...created, source: "website" },
    created.version,
  );
  return { ...fixture, booking };
}

test("confirmation tokens are deterministic, domain-signed and contain no PII", async () => {
  const {
    createBookingConfirmationToken,
    createBookingConfirmationUrl,
    verifyBookingConfirmationToken,
  } = await import("@/server/booking/booking-confirmation-token");
  const booking = tokenBooking({
    version: 4,
    status: "pending",
    internalNotes: "Private operational note",
    customer: {
      name: "Private customer",
      email: "private@example.com",
      phone: "+3530000000",
    },
  });
  const first = createBookingConfirmationToken(booking, { secret: testSecret });
  const second = createBookingConfirmationToken(booking, { secret: testSecret });

  assert.equal(first, second);
  assert.ok(first.length <= 512);
  assert.doesNotMatch(first, /Private|private@example|3530000000/);
  const verification = verifyBookingConfirmationToken(first, {
    secret: testSecret,
    now: new Date("2026-09-18T11:00:00.000Z"),
  });
  assert.equal(verification.ok, true);
  if (!verification.ok) assert.fail("Expected a valid token.");
  assert.equal(verification.claims.bookingId, booking.id);
  assert.equal(verification.claims.confirmationRole, "owner");
  assert.equal(
    verification.claims.expiresAt,
    Date.parse(booking.startsAt) / 1_000,
  );
  assert.match(verification.claims.appointmentRevision, /^[A-Za-z0-9_-]{43}$/);
  assert.match(
    createBookingConfirmationUrl("https://siriranee.com/path", booking, {
      secret: testSecret,
    }) ?? "",
    /^https:\/\/siriranee\.com\/book\/confirm\?token=/,
  );
  assert.equal(
    createBookingConfirmationUrl("javascript:alert(1)", booking, {
      secret: testSecret,
    }),
    undefined,
  );
});

test("confirmation token verification rejects tampering, expiry and oversized input", async () => {
  const {
    createBookingConfirmationToken,
    verifyBookingConfirmationToken,
  } = await import("@/server/booking/booking-confirmation-token");
  const booking = tokenBooking({
    id: "booking-token-456",
    startsAt: "2026-09-25T12:00:00.000Z",
    endsAt: "2026-09-25T13:00:00.000Z",
    localDate: "2026-09-25",
  });
  const token = createBookingConfirmationToken(booking, { secret: testSecret });
  const last = token.at(-1) === "A" ? "B" : "A";
  const tampered = `${token.slice(0, -1)}${last}`;

  assert.deepEqual(
    verifyBookingConfirmationToken(tampered, {
      secret: testSecret,
      now: new Date("2026-09-18T11:00:00.000Z"),
    }),
    { ok: false, reason: "invalid" },
  );
  assert.deepEqual(
    verifyBookingConfirmationToken(token, {
      secret: testSecret,
      now: new Date("2026-09-20T10:00:00.000Z"),
    }),
    { ok: false, reason: "expired" },
  );
  assert.deepEqual(
    verifyBookingConfirmationToken("x".repeat(513), { secret: testSecret }),
    { ok: false, reason: "invalid" },
  );
});

test("a fresh therapist request gets a stable new expiry after the original booking is older than 48 hours", async () => {
  const {
    createBookingConfirmationToken,
    createTherapistBookingConfirmationToken,
    verifyBookingConfirmationToken,
  } = await import("@/server/booking/booking-confirmation-token");
  const booking = tokenBooking({
    id: "booking-older-than-link-window",
    createdAt: "2026-09-01T10:00:00.000Z",
    startsAt: "2026-09-25T12:00:00.000Z",
    endsAt: "2026-09-25T13:00:00.000Z",
    localDate: "2026-09-25",
  });
  const issuedAt = "2026-09-18T10:00:00.000Z";
  const first = createTherapistBookingConfirmationToken(
    booking,
    booking.assignedStaffId,
    { secret: testSecret, issuedAt },
  );
  const retry = createTherapistBookingConfirmationToken(
    booking,
    booking.assignedStaffId,
    { secret: testSecret, issuedAt },
  );
  assert.equal(first, retry);
  const therapistVerification = verifyBookingConfirmationToken(first, {
    secret: testSecret,
    now: new Date("2026-09-19T10:00:00.000Z"),
  });
  assert.equal(therapistVerification.ok, true);
  if (!therapistVerification.ok) {
    assert.fail("Expected the fresh therapist request token to be valid.");
  }
  assert.equal(
    therapistVerification.claims.expiresAt,
    Date.parse("2026-09-20T10:00:00.000Z") / 1_000,
  );
  assert.deepEqual(
    verifyBookingConfirmationToken(
      createBookingConfirmationToken(booking, { secret: testSecret }),
      {
        secret: testSecret,
        now: new Date("2026-09-19T10:00:00.000Z"),
      },
    ),
    { ok: false, reason: "expired" },
  );
  assert.throws(() =>
    createTherapistBookingConfirmationToken(
      booking,
      "different-therapist",
      { secret: testSecret, issuedAt },
    )
  );
});

test("a token generated inside the owner email verifies with the default encoded environment key", async () => {
  const fixture = await setup();
  const { sendOwnerBookingRequestedEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  const { verifyBookingConfirmationToken } = await import(
    "@/server/booking/booking-confirmation-token"
  );
  let html = "";
  const result = await sendOwnerBookingRequestedEmail(fixture.booking, {
    configuration: {
      apiKey: "re_test_booking_confirmation_123456",
      from: "Siriranee Bookings <bookings@siriranee.com>",
      to: "owner@siriranee.com",
      siteOrigin: "https://siriranee.com",
    },
    environment: { CMS_PII_ENCRYPTION_KEY: encryptionKey },
    client: {
      emails: {
        async send(payload: CreateEmailOptions): Promise<CreateEmailResponse> {
          html = String(payload.html ?? "");
          return {
            data: { id: "owner-confirmation-test-message" },
            error: null,
            headers: null,
          };
        },
      },
    },
  });
  assert.equal(result.status, "sent");
  const token = html.match(/\/book\/confirm\?token=([^"&<]+)/)?.[1] ?? "";
  assert.ok(token);
  const verification = verifyBookingConfirmationToken(token);
  assert.equal(verification.ok, true);
  if (!verification.ok) assert.fail("Expected the emailed token to verify.");
  assert.equal(verification.claims.bookingId, fixture.booking.id);
  assert.equal(verification.claims.confirmationRole, "owner");
});

test("a therapist email contains a no-login capability bound to the assigned therapist", async () => {
  const fixture = await setup();
  const { sendTherapistBookingEmail } = await import(
    "@/server/booking/resend-booking-email"
  );
  const { verifyBookingConfirmationToken } = await import(
    "@/server/booking/booking-confirmation-token"
  );
  const {
    confirmBookingFromEmailToken,
    getBookingEmailConfirmationReview,
  } = await import("@/server/booking/booking-email-confirmation");
  let html = "";
  let text = "";
  const result = await sendTherapistBookingEmail(
    fixture.booking,
    {
      id: fixture.therapist.id,
      name: fixture.therapist.name,
      notificationEmail: "therapist@siriranee.com",
    },
    "requested",
    fixture.booking.version,
    {
      name: "Siriranee Thai Massage",
      address: "Harbour Road, Howth, Dublin",
    },
    {
      configuration: {
        apiKey: "re_test_booking_confirmation_123456",
        from: "Siriranee Bookings <bookings@siriranee.com>",
        to: "owner@siriranee.com",
        siteOrigin: "https://siriranee.com",
      },
      environment: { CMS_PII_ENCRYPTION_KEY: encryptionKey },
      client: {
        emails: {
          async send(payload: CreateEmailOptions): Promise<CreateEmailResponse> {
            html = String(payload.html ?? "");
            text = String(payload.text ?? "");
            return {
              data: { id: "therapist-confirmation-test-message" },
              error: null,
              headers: null,
            };
          },
        },
      },
    },
  );
  assert.equal(result.status, "sent");
  assert.match(html, /Review and confirm booking/);
  assert.match(`${html}${text}`, /no (?:CMS )?login is required/i);
  assert.match(text, /Opening this link alone will not confirm the booking/i);
  const token = html.match(/\/book\/confirm\?token=([^"&<]+)/)?.[1] ?? "";
  assert.ok(token);
  const verification = verifyBookingConfirmationToken(token);
  assert.equal(verification.ok, true);
  if (!verification.ok) assert.fail("Expected the therapist token to verify.");
  assert.equal(verification.claims.confirmationRole, "therapist");
  if (verification.claims.confirmationRole !== "therapist") {
    assert.fail("Expected a therapist capability.");
  }
  assert.equal(verification.claims.therapistId, fixture.therapist.id);

  const review = await getBookingEmailConfirmationReview(token);
  assert.equal(review.kind, "ready");
  assert.equal(review.confirmationRole, "therapist");
  const confirmation = await confirmBookingFromEmailToken(token);
  assert.equal(confirmation.kind, "confirmed");
  assert.equal(confirmation.confirmationRole, "therapist");
  const audits = await fixture.repository.listAuditForEntity(
    "booking",
    fixture.booking.id,
  );
  assert.equal(audits[0]?.actorId, "therapist-email-confirmation");
  assert.equal(audits[0]?.actorName, "Therapist email confirmation");
});

test("owner and assigned therapist links confirm one transition without duplicate mutation", async () => {
  const fixture = await setup();
  const {
    createBookingConfirmationToken,
    createTherapistBookingConfirmationToken,
  } = await import("@/server/booking/booking-confirmation-token");
  const { confirmBookingFromEmailToken } = await import(
    "@/server/booking/booking-email-confirmation"
  );
  const ownerToken = createBookingConfirmationToken(fixture.booking);
  const therapistToken = createTherapistBookingConfirmationToken(
    fixture.booking,
    fixture.therapist.id,
  );

  const outcomes = await Promise.all([
    confirmBookingFromEmailToken(ownerToken),
    confirmBookingFromEmailToken(therapistToken),
  ]);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.kind).sort(),
    ["already-confirmed", "confirmed"],
  );
  assert.equal(
    (await fixture.repository.getBooking(fixture.booking.id))?.status,
    "confirmed",
  );
  const confirmationAudits = (
    await fixture.repository.listAuditForEntity("booking", fixture.booking.id)
  ).filter((event) =>
    event.actorId === "owner-email-confirmation" ||
    event.actorId === "therapist-email-confirmation"
  );
  assert.equal(confirmationAudits.length, 1);
});

test("a therapist capability fails closed after reassignment", async () => {
  const fixture = await setup();
  const { createTherapistBookingConfirmationToken } = await import(
    "@/server/booking/booking-confirmation-token"
  );
  const { getBookingEmailConfirmationReview } = await import(
    "@/server/booking/booking-email-confirmation"
  );
  const token = createTherapistBookingConfirmationToken(
    fixture.booking,
    fixture.therapist.id,
  );
  await fixture.repository.saveBooking(
    {
      ...fixture.booking,
      assignedStaffId: "replacement-therapist",
      assignedStaffName: "Replacement Therapist",
    },
    fixture.booking.version,
  );

  assert.deepEqual(await getBookingEmailConfirmationReview(token), {
    kind: "unavailable",
    reason: "stale",
    confirmationRole: "therapist",
  });
});

test("a valid website token exposes only safe review data and confirms once", async () => {
  const fixture = await setup();
  const { createBookingConfirmationToken } = await import(
    "@/server/booking/booking-confirmation-token"
  );
  const {
    confirmBookingFromEmailToken,
    getBookingEmailConfirmationReview,
  } = await import("@/server/booking/booking-email-confirmation");
  const token = createBookingConfirmationToken(fixture.booking);
  const review = await getBookingEmailConfirmationReview(token);

  assert.equal(review.kind, "ready");
  assert.doesNotMatch(
    JSON.stringify(review),
    /Demo Safety Guest|demo\.guest@example\.invalid|353 00 000 0000|Important operational note/,
  );

  const [first, second] = await Promise.all([
    confirmBookingFromEmailToken(token),
    confirmBookingFromEmailToken(token),
  ]);
  assert.deepEqual(
    [first.kind, second.kind].sort(),
    ["already-confirmed", "confirmed"],
  );
  assert.equal(
    (await fixture.repository.getBooking(fixture.booking.id))?.status,
    "confirmed",
  );
  const audits = await fixture.repository.listAuditForEntity(
    "booking",
    fixture.booking.id,
  );
  assert.equal(audits[0]?.actorId, "owner-email-confirmation");
  assert.equal(audits[0]?.actorName, "Owner email confirmation");
});

test("confirmation rejects an appointment changed between review and the write", async () => {
  const fixture = await setup();
  const { createBookingConfirmationToken } = await import(
    "@/server/booking/booking-confirmation-token"
  );
  const { confirmBookingFromEmailToken } = await import(
    "@/server/booking/booking-email-confirmation"
  );
  const token = createBookingConfirmationToken(fixture.booking);
  const originalGetBooking = fixture.repository.getBooking.bind(
    fixture.repository,
  );
  const changed = await fixture.repository.saveBooking(
    {
      ...fixture.booking,
      localTime: "13:00",
      startsAt: new Date(
        Date.parse(fixture.booking.startsAt) + 60 * 60 * 1_000,
      ).toISOString(),
      endsAt: new Date(
        Date.parse(fixture.booking.endsAt) + 60 * 60 * 1_000,
      ).toISOString(),
      version: fixture.booking.version + 1,
      updatedAt: new Date().toISOString(),
    },
    fixture.booking.version,
  );
  let bookingReads = 0;
  fixture.repository.getBooking = async (bookingId) => {
    bookingReads += 1;
    return bookingReads === 1 && bookingId === fixture.booking.id
      ? fixture.booking
      : originalGetBooking(bookingId);
  };

  assert.deepEqual(await confirmBookingFromEmailToken(token), {
    kind: "unavailable",
    reason: "stale",
    confirmationRole: "owner",
  });
  assert.equal(
    (await originalGetBooking(changed.id))?.status,
    "pending",
  );
});

test("confirmation revision ignores notes but rejects appointment, source and state changes", async (t) => {
  const { createBookingConfirmationToken } = await import(
    "@/server/booking/booking-confirmation-token"
  );
  const { getBookingEmailConfirmationReview } = await import(
    "@/server/booking/booking-email-confirmation"
  );

  await t.test("notes-only version change remains valid", async () => {
    const fixture = await setup();
    const token = createBookingConfirmationToken(fixture.booking);
    const notesOnly = await fixture.repository.saveBooking(
      {
        ...fixture.booking,
        internalNotes: "Owner reviewed the request from the email.",
        version: fixture.booking.version + 1,
        updatedAt: new Date().toISOString(),
      },
      fixture.booking.version,
    );
    assert.equal(createBookingConfirmationToken(notesOnly), token);
    assert.equal(
      (await getBookingEmailConfirmationReview(token)).kind,
      "ready",
    );
  });

  await t.test("changed appointment is stale", async () => {
    const fixture = await setup();
    const token = createBookingConfirmationToken(fixture.booking);
    const startsAt = new Date(
      Date.parse(fixture.booking.startsAt) + 60 * 60 * 1_000,
    ).toISOString();
    const endsAt = new Date(
      Date.parse(fixture.booking.endsAt) + 60 * 60 * 1_000,
    ).toISOString();
    await fixture.repository.saveBooking(
      {
        ...fixture.booking,
        localTime: "13:00",
        startsAt,
        endsAt,
        version: fixture.booking.version + 1,
        updatedAt: new Date().toISOString(),
      },
      fixture.booking.version,
    );
    assert.deepEqual(
      await getBookingEmailConfirmationReview(token),
      { kind: "unavailable", reason: "stale", confirmationRole: "owner" },
    );
  });

  await t.test("unsupported source", async () => {
    const fixture = await setup();
    const adminBooking = await fixture.repository.saveBooking(
      { ...fixture.booking, source: "administrator" },
      fixture.booking.version,
    );
    const token = createBookingConfirmationToken(adminBooking);
    assert.deepEqual(
      await getBookingEmailConfirmationReview(token),
      {
        kind: "unavailable",
        reason: "source-not-supported",
        confirmationRole: "owner",
      },
    );
  });

  await t.test("invalid state", async () => {
    const fixture = await setup();
    const token = createBookingConfirmationToken(fixture.booking);
    await fixture.repository.saveBooking(
      { ...fixture.booking, status: "cancelled" },
      fixture.booking.version,
    );
    assert.deepEqual(
      await getBookingEmailConfirmationReview(token),
      {
        kind: "unavailable",
        reason: "invalid-state",
        confirmationRole: "owner",
      },
    );
  });
});

test("confirmation page is a no-store POST review surface with no customer PII", async () => {
  const [page, action, button, config] = await Promise.all([
    source("src/app/(site)/book/confirm/page.tsx"),
    source("src/app/(site)/book/confirm/actions.ts"),
    source("src/components/booking/BookingEmailConfirmationButton.tsx"),
    source("next.config.ts"),
  ]);

  assert.match(page, /getBookingEmailConfirmationReview\(token\)/);
  assert.doesNotMatch(page, /<main\b/);
  assert.doesNotMatch(page, /updateAdminBooking|confirmBookingFromEmailToken/);
  assert.doesNotMatch(page, /customer\.(?:name|email|phone|notes)/);
  assert.match(page, /referrer:\s*"no-referrer"/);
  assert.match(page, /noarchive:\s*true/);
  assert.match(action, /^"use server";/);
  assert.match(action, /confirmBookingFromEmailToken\(token\)/);
  assert.match(action, /refresh\(\)/);
  assert.match(button, /<form action=\{action\}/);
  assert.match(button, /disabled=\{pending \|\| complete\}/);
  assert.match(config, /source:\s*"\/book\/confirm"/);
  assert.match(config, /"Cache-Control", value: "no-store, max-age=0"/);
  assert.match(config, /"Referrer-Policy", value: "no-referrer"/);
});
