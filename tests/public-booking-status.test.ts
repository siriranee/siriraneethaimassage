import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createPublicBookingStatusSnapshot,
  parsePublicBookingIdentifier,
  type PublicBookingStatusSource,
} from "@/domain/booking/public-status";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("public booking identifiers accept canonical IDs and references only", () => {
  assert.deepEqual(
    parsePublicBookingIdentifier(" 550E8400-E29B-41D4-A716-446655440000 "),
    { kind: "id", value: "550e8400-e29b-41d4-a716-446655440000" },
  );
  assert.deepEqual(parsePublicBookingIdentifier(" srn-20260903-a1b2c3 "), {
    kind: "reference",
    value: "SRN-20260903-A1B2C3",
  });

  for (const value of [
    "",
    "booking-1",
    "SRN-20260903-ABCDE",
    "SRN-20260903-ABC123-extra",
    "550e8400-e29b-41d4-a716-446655440000-extra",
  ]) {
    assert.equal(parsePublicBookingIdentifier(value), null);
  }
});

test("public booking snapshots expose status copy only", () => {
  const sourceWithSensitiveFields = {
    status: "confirmed",
    capacityExpiresAt: "",
    customer: { name: "Private name", phone: "+3530000000" },
    localDate: "2026-09-03",
    localTime: "10:00",
    serviceName: "Private treatment",
    priceCents: 5000,
  } as unknown as PublicBookingStatusSource;

  const snapshot = createPublicBookingStatusSnapshot(
    sourceWithSensitiveFields,
    Date.parse("2026-09-03T08:00:00Z"),
  );

  assert.deepEqual(Object.keys(snapshot).sort(), ["code", "label", "message"]);
  assert.equal(snapshot.code, "confirmed");
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /Private name|3530000000|2026-09-03|10:00|Private treatment|5000/,
  );
});

test("public status hides internal no-show detail and identifies expired requests", () => {
  for (const status of ["cancelled", "no-show"] as const) {
    assert.equal(
      createPublicBookingStatusSnapshot({ status, capacityExpiresAt: "" }).code,
      "closed",
    );
  }

  assert.equal(
    createPublicBookingStatusSnapshot(
      {
        status: "pending",
        capacityExpiresAt: "2026-09-03T07:59:59Z",
      },
      Date.parse("2026-09-03T08:00:00Z"),
    ).code,
    "expired",
  );
  assert.equal(
    createPublicBookingStatusSnapshot(
      {
        status: "pending",
        capacityExpiresAt: "2026-09-03T08:00:01Z",
      },
      Date.parse("2026-09-03T08:00:00Z"),
    ).code,
    "pending",
  );
});

test("Mongo status lookup projects no encrypted customer or appointment data", async () => {
  const mongo = await source("src/server/cms/repositories/mongo-repository.ts");
  const start = mongo.indexOf("async findBookingPublicStatus");
  const end = mongo.indexOf("async findBookingByIdempotencyHash", start);
  const lookup = mongo.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    lookup,
    /projection:\s*\{ _id: 0, status: 1, capacityExpiresAt: 1 \}/,
  );
  assert.doesNotMatch(
    lookup,
    /customerEncrypted|decodeBooking|serviceName|localDate|localTime|priceCents/,
  );
});

test("status endpoint and booking page keep identifiers out of URLs", async () => {
  const [route, lookup, bookPage, statusPage] = await Promise.all([
    source("src/app/api/public/bookings/status/route.ts"),
    source("src/components/booking/BookingStatusLookup.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/app/(site)/book/status/page.tsx"),
  ]);

  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /checkPublicBookingStatusRateLimit/);
  assert.match(route, /Cache-Control["'],\s*["']no-store/);
  assert.match(lookup, /method:\s*"POST"/);
  assert.match(lookup, /JSON\.stringify\(\{ identifier \}\)/);
  assert.doesNotMatch(
    lookup,
    /name="(?:customerName|phone|email|notes|localDate|localTime)"/,
  );
  assert.match(bookPage, /href="\/book\/status"/);
  assert.match(statusPage, /noIndex:\s*true/);
});
