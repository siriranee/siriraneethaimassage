import assert from "node:assert/strict";
import test from "node:test";

import { isPendingCapacityExpired } from "@/domain/booking/status";

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
