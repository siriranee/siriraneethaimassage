import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { CmsBooking } from "@/domain/cms/types";

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

function booking(overrides: Partial<CmsBooking> = {}): CmsBooking {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    reference: "SRN-20260910-ABC123",
    customer: {
      name: "Nok Example",
      phone: "+353 85 123 4567",
      email: "nok@example.com",
      notes: "Please call before the appointment.",
    },
    serviceId: "traditional-thai",
    serviceSlug: "traditional-thai-massage",
    serviceName: "Traditional Thai Massage",
    durationMinutes: 60,
    priceCents: 6500,
    currency: "EUR",
    startsAt: "2026-09-10T09:00:00.000Z",
    endsAt: "2026-09-10T10:00:00.000Z",
    localDate: "2026-09-10",
    localTime: "10:00",
    timezone: "Europe/Dublin",
    status: "pending",
    source: "website",
    capacityExpiresAt: "2026-09-03T10:30:00.000Z",
    assignedStaffId: "",
    internalNotes: "Never include this internal note.",
    privacyAcceptedAt: "2026-09-03T10:00:00.000Z",
    privacyNoticeVersion: "2026-09-03",
    holdTokenHash: "secret-hold-hash",
    idempotencyKeyHash: "secret-idempotency-hash",
    requestFingerprintHash: "secret-fingerprint-hash",
    demo: false,
    version: 1,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    updatedBy: "public-booking",
    ...overrides,
  };
}

test("owner booking email renders Thai first and English second with complete operational details", async () => {
  const { renderOwnerBookingRequestedEmail } = await import(
    "@/server/booking/booking-email"
  );
  const message = renderOwnerBookingRequestedEmail(booking(), {
    cmsBookingUrl:
      "https://siriranee.example/cms/bookings/11111111-2222-4333-8444-555555555555",
  });

  assert.ok(
    message.html.indexOf('<td lang="th" style="padding:30px') <
      message.html.indexOf('<td lang="en-IE" style="padding:30px'),
  );
  assert.ok(message.text.indexOf("คำขอจองใหม่") < message.text.indexOf("NEW BOOKING REQUEST"));
  for (const expected of [
    "SRN-20260910-ABC123",
    "Nok Example",
    "+353 85 123 4567",
    "nok@example.com",
    "Please call before the appointment.",
    "Traditional Thai Massage",
    "10:00",
    "€65.00",
    "11111111-2222-4333-8444-555555555555",
    "Pending confirmation",
  ]) {
    assert.match(message.html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(message.text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(message.html, /lang="th"/);
  assert.match(message.html, /lang="en-IE"/);
  assert.match(message.html, /scope="row"/);
  assert.match(message.html, /Open booking in CMS/);
  assert.match(message.text, /Open booking in CMS: https:\/\/siriranee\.example/);
  assert.match(message.text, /2026/);
  assert.doesNotMatch(message.text, /2569/);

  for (const forbidden of [
    "Never include this internal note.",
    "secret-hold-hash",
    "secret-idempotency-hash",
    "secret-fingerprint-hash",
  ]) {
    assert.doesNotMatch(message.html, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(message.text, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("owner booking email escapes HTML and removes control and bidi override characters", async () => {
  const { renderOwnerBookingRequestedEmail } = await import(
    "@/server/booking/booking-email"
  );
  const message = renderOwnerBookingRequestedEmail(
    booking({
      customer: {
        name: 'Nok <script>alert("x")</script> & friend\u202E',
        phone: "+353 85 123 4567",
        email: "nok@example.com",
        notes: "Line one\n<img src=x onerror=alert(1)>",
      },
    }),
  );

  assert.doesNotMatch(message.html, /<script>|<img src=x|\u202E/);
  assert.match(message.html, /Nok &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; friend/);
  assert.match(message.html, /Line one<br>&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(message.html, /<img src=x/);
  assert.doesNotMatch(message.text, /\u202E/);
  assert.match(message.text, /<script>alert\("x"\)<\/script>/);
  assert.match(message.text, /Line one\n<img src=x onerror=alert\(1\)>/);
});

test("owner booking email supplies bilingual fallbacks for optional customer fields", async () => {
  const { renderOwnerBookingRequestedEmail } = await import(
    "@/server/booking/booking-email"
  );
  const message = renderOwnerBookingRequestedEmail(
    booking({
      customer: {
        name: "Nok Example",
        phone: "+353 85 123 4567",
        email: "",
        notes: "",
      },
    }),
  );

  assert.match(message.html, /ไม่ได้ระบุ/);
  assert.match(message.html, /Not provided/);
  assert.doesNotMatch(message.html, /Open booking in CMS/);
  assert.doesNotMatch(message.text, /Open booking in CMS:/);
});
