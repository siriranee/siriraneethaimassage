import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionBookingStatus,
  getAllowedBookingStatusTransitions,
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
