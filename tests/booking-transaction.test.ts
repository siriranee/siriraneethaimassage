import assert from "node:assert/strict";
import test from "node:test";

import { readTransactionalAvailability } from "@/server/booking/transactional-availability";

test("transactional availability reads never overlap on one session", async () => {
  let activeReads = 0;
  let maximumActiveReads = 0;
  const events: string[] = [];

  async function trackedRead(name: string) {
    activeReads += 1;
    maximumActiveReads = Math.max(maximumActiveReads, activeReads);
    events.push(`${name}:start`);
    await Promise.resolve();
    events.push(`${name}:end`);
    activeReads -= 1;
    return [];
  }

  const result = await readTransactionalAvailability(
    {
      listBookingOccupancy: () => trackedRead("bookings"),
      listActiveHolds: () => trackedRead("holds"),
      listClosures: () => trackedRead("closures"),
    },
    "2026-09-03",
    "2026-09-03T08:00:00Z",
  );

  assert.equal(maximumActiveReads, 1);
  assert.deepEqual(events, [
    "bookings:start",
    "bookings:end",
    "holds:start",
    "holds:end",
    "closures:start",
    "closures:end",
  ]);
  assert.deepEqual(result, { bookings: [], holds: [], closures: [] });
});
