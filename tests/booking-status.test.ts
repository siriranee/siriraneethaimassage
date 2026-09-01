import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionBookingStatus,
  getAllowedBookingStatusTransitions,
  isPendingCapacityExpired,
  isTerminalBookingStatus,
} from "@/domain/booking/status";

test("booking status transitions form a one-way operational workflow", () => {
  assert.deepEqual(getAllowedBookingStatusTransitions("pending"), [
    "confirmed",
    "cancelled",
  ]);
  assert.deepEqual(getAllowedBookingStatusTransitions("confirmed"), [
    "completed",
    "cancelled",
    "no-show",
  ]);

  assert.equal(canTransitionBookingStatus("pending", "pending"), true);
  assert.equal(canTransitionBookingStatus("pending", "confirmed"), true);
  assert.equal(canTransitionBookingStatus("pending", "completed"), false);
  assert.equal(canTransitionBookingStatus("confirmed", "pending"), false);
  assert.equal(canTransitionBookingStatus("cancelled", "confirmed"), false);
  assert.equal(isTerminalBookingStatus("completed"), true);
  assert.equal(isTerminalBookingStatus("cancelled"), true);
  assert.equal(isTerminalBookingStatus("no-show"), true);
  assert.equal(isTerminalBookingStatus("confirmed"), false);
});

test("only pending bookings with a valid past capacity expiry are expired", () => {
  const now = Date.parse("2026-06-01T10:00:00Z");

  assert.equal(
    isPendingCapacityExpired(
      { status: "pending", capacityExpiresAt: "2026-06-01T09:59:59Z" },
      now,
    ),
    true,
  );
  assert.equal(
    isPendingCapacityExpired(
      { status: "pending", capacityExpiresAt: "2026-06-01T10:00:01Z" },
      now,
    ),
    false,
  );
  assert.equal(
    isPendingCapacityExpired(
      { status: "confirmed", capacityExpiresAt: "2026-06-01T09:00:00Z" },
      now,
    ),
    false,
  );
  assert.equal(
    isPendingCapacityExpired(
      { status: "pending", capacityExpiresAt: "" },
      now,
    ),
    false,
  );
  assert.equal(
    isPendingCapacityExpired(
      { status: "pending", capacityExpiresAt: "not-a-date" },
      now,
    ),
    false,
  );
});
