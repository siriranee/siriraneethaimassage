import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { FormEvent, ReactElement } from "react";

type Harness = {
  cleanups: (() => void)[];
  updates: unknown[];
  refreshes: number;
  saved: number;
};

// Execute the actual submit handler with per-instance hooks. This isolates the
// request lifecycle from a browser while retaining the production payload and
// success/error paths; cleanups model React replacing the keyed inline form.
const hookUrl = pathToFileURL(`${process.cwd()}/tests/support/closure-form-hooks-stub.mjs`).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/ClosureForm.tsx") &&
      ["react", "next/navigation", "./useUnsavedChanges"].includes(specifier)) {
      return { shortCircuit: true, url: hookUrl };
    }
    return specifier.endsWith(".module.css")
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/css-module-names-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function setup(onSaved: () => void) {
  const harness: Harness = { cleanups: [], updates: [], refreshes: 0, saved: 0 };
  Object.defineProperty(globalThis, Symbol.for("closure-form-test-harness"), { configurable: true, value: harness });
  const { ClosureForm } = await import("../src/components/cms/ClosureForm");
  const element = ClosureForm({
    defaultDate: "2026-10-16", defaultTherapistId: "therapist-a", inline: true,
    therapists: [{ id: "therapist-a", name: "Therapist A" }], onSaved,
  }) as ReactElement<{ onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }>;
  const request = deferred<Response>();
  const payloads: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const originalInput = globalThis.HTMLInputElement;
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return request.promise;
  };
  globalThis.FormData = class {
    get(name: string) {
      return ({ localDate: "2026-10-16", reason: "Day off", publicLabel: "" } as Record<string, string>)[name] ?? null;
    }
  } as unknown as typeof FormData;
  globalThis.HTMLInputElement = class {} as typeof HTMLInputElement;
  const event = {
    preventDefault() {},
    currentTarget: { elements: { namedItem: () => null }, reportValidity: () => true },
  } as unknown as FormEvent<HTMLFormElement>;
  return {
    harness, payloads, request,
    save: () => element.props.onSubmit(event),
    unmount: () => harness.cleanups.forEach((cleanup) => cleanup()),
    restore() {
      globalThis.fetch = originalFetch;
      globalThis.FormData = originalFormData;
      if (originalInput) globalThis.HTMLInputElement = originalInput;
      else Reflect.deleteProperty(globalThis, "HTMLInputElement");
      Reflect.deleteProperty(globalThis, Symbol.for("closure-form-test-harness"));
    },
  };
}

test("a delayed save refreshes committed availability without dismissing the replacement draft", async () => {
  let replacementDraftOpen = true;
  const fixture = await setup(() => { replacementDraftOpen = false; });
  try {
    const saving = fixture.save();
    fixture.unmount();
    const updatesAtUnmount = fixture.harness.updates.length;
    fixture.request.resolve(new Response(JSON.stringify({ closure: { id: "closure-a" } }), { status: 200 }));
    await saving;
    assert.equal(fixture.harness.refreshes, 1);
    assert.equal(replacementDraftOpen, true);
    assert.equal(fixture.harness.saved, 0);
    assert.equal(fixture.harness.updates.length, updatesAtUnmount);
    assert.deepEqual(fixture.payloads, [{
      localDate: "2026-10-16", therapistId: "therapist-a", closedAllDay: true,
      startsAtLocal: null, endsAtLocal: null, reason: "Day off", publicLabel: "",
      active: true, repeatWeeklyCount: 1,
    }]);
  } finally { fixture.restore(); }
});

test("the current form confirms one save and suppresses duplicate submits", async () => {
  let saved = 0;
  const fixture = await setup(() => { saved += 1; });
  try {
    const saving = fixture.save();
    await fixture.save();
    assert.equal(fixture.payloads.length, 1);
    fixture.request.resolve(new Response(JSON.stringify({ closure: { id: "closure-a" } }), { status: 200 }));
    await saving;
    assert.equal(fixture.harness.refreshes, 1);
    assert.equal(fixture.harness.saved, 1);
    assert.equal(saved, 1);
    assert.ok(fixture.harness.updates.some((value) => typeof value === "object" && value !== null && "tone" in value && value.tone === "success"));
  } finally { fixture.restore(); }
});

test("late server rejection and connection failure cannot modify a replacement draft", async () => {
  for (const failure of ["server", "connection"]) {
    let saved = 0;
    const fixture = await setup(() => { saved += 1; });
    try {
      const saving = fixture.save();
      fixture.unmount();
      const updatesAtUnmount = fixture.harness.updates.length;
      if (failure === "server") fixture.request.resolve(new Response(JSON.stringify({ error: "An appointment conflicts." }), { status: 409 }));
      else fixture.request.reject(new Error("Connection lost"));
      await saving;
      assert.equal(fixture.harness.refreshes, 0);
      assert.equal(fixture.harness.updates.length, updatesAtUnmount);
      assert.equal(saved, 0);
    } finally { fixture.restore(); }
  }
});
