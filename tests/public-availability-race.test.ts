import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && /\/(BookingCalendar|BookingPlanner)\.tsx$/.test(context.parentURL ?? "")) {
      return { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/availability-hooks-stub.mjs`).href };
    }
    return specifier.endsWith(".module.css")
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/css-module-names-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

async function runAvailability(component: "calendar" | "planner", abort: boolean) {
  const harness = { effects: [] as (() => (() => void) | undefined)[], updates: [] as unknown[] };
  Object.defineProperty(globalThis, Symbol.for("availability-test-harness"), { configurable: true, value: harness });
  const selections: string[] = [];
  const signals: AbortSignal[] = [];
  const originalFetch = globalThis.fetch;
  let finishJson!: (value: unknown) => void;
  const parsedBody = new Promise((resolve) => { finishJson = resolve; });
  globalThis.fetch = async (_url, init) => {
    signals.push(init?.signal as AbortSignal);
    return { ok: true, json: () => parsedBody } as Response;
  };
  try {
    if (component === "calendar") {
      const { BookingCalendar } = await import("../src/components/booking/BookingCalendar");
      BookingCalendar({
        serviceId: "service-a", therapistId: "therapist-a", durationMinutes: 60,
        minimumDate: "2026-10-16", selectedDate: "2026-10-16",
        onSelectDate: (date) => selections.push(date),
      });
    } else {
      const { BookingPlanner } = await import("../src/components/booking/BookingPlanner");
      BookingPlanner({
        services: [{ id: "service-a", slug: "test-service", name: "Test treatment", shortDescription: "", pricing: [{ durationMinutes: 60, priceEur: 65 }] }],
        therapists: [{ id: "therapist-a", slug: "test-therapist", name: "Therapist A", role: "Therapist", shortBio: "", imageUrl: "", imageAlt: "", serviceIds: ["service-a"] }],
        initialDate: "2026-10-16", initialTime: "12:00",
      });
    }
    // Calendar first synchronizes refs, then starts its request. Planner's first
    // effect is the request; later timer/focus effects do not affect this race.
    const requestEffects = component === "calendar" ? harness.effects.slice(0, 2) : harness.effects.slice(0, 1);
    const cleanups = requestEffects.map((effect) => effect()).filter((cleanup) => cleanup !== undefined);
    await Promise.resolve(); // The fetch response has arrived; JSON is pending.
    assert.equal(signals.length, 1);
    if (abort) cleanups.forEach((cleanup) => cleanup());
    finishJson(component === "calendar" ? {
      status: "live", month: "2026-10", minimumDate: "2026-10-16", maximumDate: "2026-11-16",
      message: "Therapist A is off", days: [{ localDate: "2026-10-16", state: "day-off", label: "Day off", availableSlotCount: 0 }],
    } : { status: "live", message: "Therapist A is off", slots: [] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { updates: harness.updates, selections, aborted: signals[0].aborted };
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, Symbol.for("availability-test-harness"));
  }
}

test("a retired calendar request cannot clear the newly selected therapist's date", async () => {
  const retired = await runAvailability("calendar", true);
  assert.equal(retired.aborted, true);
  assert.deepEqual(retired.updates, []);
  assert.deepEqual(retired.selections, []);
  const current = await runAvailability("calendar", false);
  assert.ok(current.updates.length > 0);
  assert.deepEqual(current.selections, [""]);
});

test("a retired slot request cannot replace current slots or clear the new time selection", async () => {
  const retired = await runAvailability("planner", true);
  assert.equal(retired.aborted, true);
  assert.deepEqual(retired.updates, []);
  const current = await runAvailability("planner", false);
  assert.ok(current.updates.length > 0);
  assert.ok(current.updates.includes(""));
});
