import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type ElementProps = {
  children?: ReactNode;
  ref?: { current: unknown };
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  onCancel?: (event: { preventDefault(): void }) => void;
  onKeyDown?: (event: { key: string; shiftKey: boolean; target: unknown; preventDefault(): void }) => void;
};

type HookSlot = { cleanup?: () => void };
type Harness = {
  id: number;
  cursor: number;
  slots: unknown[];
  effects: (() => void)[];
  updates: unknown[];
  refreshes: number;
};

const hookUrl = pathToFileURL(`${process.cwd()}/tests/support/day-off-confirmation-hooks-stub.mjs`).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/DayOffConfirmation.tsx") && ["react", "next/navigation"].includes(specifier)) {
      return { shortCircuit: true, url: hookUrl };
    }
    return specifier.endsWith(".module.css")
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/css-module-names-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

function descendants(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

function button(tree: ReactNode, label: RegExp) {
  const found = descendants(tree).find((node) => node.type === "button" && label.test(renderToStaticMarkup(node)));
  assert.ok(found, `Expected a button matching ${label}`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let instanceId = 0;

async function setup(therapistId = "therapist-a", therapistName = "Therapist A", options: { triggerRef?: "present" | "empty" } = {}) {
  const harness: Harness = { id: ++instanceId, cursor: 0, slots: [], effects: [], updates: [], refreshes: 0 };
  Object.defineProperty(globalThis, Symbol.for("day-off-confirmation-test-harness"), { configurable: true, value: harness });
  const { DayOffConfirmation } = await import("../src/components/cms/DayOffConfirmation");
  const dialog = {
    open: false,
    showCount: 0,
    showModal() { this.open = true; this.showCount += 1; },
    close() { this.open = false; },
  };
  let saved = 0;
  let cancelled = 0;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const bodyStyle = { overflow: "scroll" };
  const documentState: { body: { style: typeof bodyStyle }; activeElement: unknown } = {
    body: { style: bodyStyle }, activeElement: null,
  };
  class TestHTMLElement {
    isConnected = true;
    disabled = false;
    focusCount = 0;
    focus() {
      this.focusCount += 1;
      documentState.activeElement = this;
    }
  }
  const opener = new TestHTMLElement();
  const trigger = new TestHTMLElement();
  const cancelElement = new TestHTMLElement();
  const confirmElement = new TestHTMLElement();
  const props = {
    localDate: "2026-10-16", therapistId, therapistName,
    triggerRef: options.triggerRef ? { current: options.triggerRef === "present" ? trigger as unknown as HTMLButtonElement : null } : undefined,
    onCancel: () => { cancelled += 1; }, onSaved: () => { saved += 1; },
  };
  documentState.activeElement = opener;
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentState });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: TestHTMLElement });
  let tree: ReactElement<ElementProps>;
  function render() {
    harness.cursor = 0;
    tree = DayOffConfirmation(props) as ReactElement<ElementProps>;
    const dialogElement = descendants(tree).find((node) => node.type === "dialog");
    assert.ok(dialogElement, "Confirmation is a native dialog");
    if (dialogElement.props.ref) dialogElement.props.ref.current = dialog;
    const cancelButton = button(tree, /Cancel/);
    if (cancelButton.props.ref) cancelButton.props.ref.current = cancelElement;
    cancelElement.disabled = cancelButton.props.disabled ?? false;
    const confirmButton = button(tree, /Confirm day off|Saving/);
    if (confirmButton.props.ref) confirmButton.props.ref.current = confirmElement;
    confirmElement.disabled = confirmButton.props.disabled ?? false;
    harness.effects.splice(0).forEach((effect) => effect());
    return tree;
  }

  const requests: {
    url: unknown; method?: string; payload: unknown;
    response: ReturnType<typeof deferred<Response>>;
  }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const response = deferred<Response>();
    requests.push({ url, method: init?.method, payload: JSON.parse(String(init?.body)), response });
    return response.promise;
  };
  render();
  return {
    harness, dialog, requests, render, bodyStyle, opener, trigger, cancelElement, confirmElement,
    get html() { return renderToStaticMarkup(tree); },
    get saved() { return saved; },
    get cancelled() { return cancelled; },
    get cancelFocused() { return documentState.activeElement === cancelElement; },
    get activeElement() { return documentState.activeElement; },
    confirm: () => button(tree, /Confirm day off/).props.onClick?.(),
    cancel: () => button(tree, /Cancel/).props.onClick?.(),
    escape() {
      let prevented = false;
      const element = descendants(tree).find((node) => node.type === "dialog");
      element?.props.onCancel?.({ preventDefault() { prevented = true; } });
      return prevented;
    },
    keyDown(key: string, shiftKey = false, target = documentState.activeElement) {
      let prevented = false;
      const element = descendants(tree).find((node) => node.type === "dialog");
      element?.props.onKeyDown?.({ key, shiftKey, target, preventDefault() { prevented = true; } });
      return prevented;
    },
    unmount() {
      harness.slots.forEach((slot) => {
        if (slot && typeof slot === "object") (slot as HookSlot).cleanup?.();
      });
    },
    restore() {
      globalThis.fetch = originalFetch;
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
      if (originalHTMLElement) Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
      else Reflect.deleteProperty(globalThis, "HTMLElement");
      Reflect.deleteProperty(globalThis, Symbol.for("day-off-confirmation-test-harness"));
    },
  };
}

function successfulResponse() {
  return new Response(JSON.stringify({ closure: { id: "day-off-a" } }), { status: 201 });
}

test("opening or cancelling a therapist day-off confirmation never saves a closure", async () => {
  const fixture = await setup();
  try {
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.dialog.showCount, 1);
    assert.equal(fixture.cancelFocused, true);
    assert.equal(fixture.bodyStyle.overflow, "hidden");
    assert.match(fixture.html, /Therapist A/);
    assert.match(fixture.html, /Friday 16 October 2026/);
    assert.doesNotMatch(fixture.html, /<(input|select|textarea|form)\b/);
    assert.equal(fixture.requests.length, 0);
    await fixture.cancel();
    assert.equal(fixture.cancelled, 1);
    assert.equal(fixture.saved, 0);
    assert.equal(fixture.requests.length, 0);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("confirming saves exactly the selected therapist and date once", async () => {
  const fixture = await setup();
  try {
    const saving = fixture.confirm();
    await fixture.confirm();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].url, "/api/cms/closures");
    assert.equal(fixture.requests[0].method, "POST");
    assert.deepEqual(fixture.requests[0].payload, {
      localDate: "2026-10-16", therapistId: "therapist-a", closedAllDay: true,
      startsAtLocal: "", endsAtLocal: "", reason: "Day off", publicLabel: "",
      active: true, repeatWeeklyCount: 1,
    });
    const pendingTree = fixture.render();
    assert.equal(button(pendingTree, /Saving/).props.disabled, true);
    assert.equal(button(pendingTree, /Cancel/).props.disabled, true);
    fixture.requests[0].response.resolve(successfulResponse());
    await saving;
    assert.equal(fixture.saved, 1);
    assert.equal(fixture.cancelled, 0);
    assert.equal(fixture.harness.refreshes, 1);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("whole-business confirmation explicitly names all therapists and saves that scope", async () => {
  const fixture = await setup("", "All therapists");
  try {
    assert.match(fixture.html, /all therapists/i);
    const saving = fixture.confirm();
    assert.equal((fixture.requests[0].payload as { therapistId: string }).therapistId, "");
    fixture.requests[0].response.resolve(successfulResponse());
    await saving;
    assert.equal(fixture.saved, 1);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("a booking conflict remains visible in the dialog and permits a retry", async () => {
  const fixture = await setup();
  try {
    const saving = fixture.confirm();
    fixture.requests[0].response.resolve(new Response(JSON.stringify({ error: "An appointment conflicts. Resolve it first." }), { status: 409 }));
    await saving;
    const afterConflict = fixture.render();
    assert.match(fixture.html, /role="alert"/);
    assert.match(fixture.html, /An appointment conflicts\. Resolve it first\./);
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.saved, 0);
    assert.equal(fixture.cancelled, 0);
    assert.equal(fixture.harness.refreshes, 0);
    assert.equal(button(afterConflict, /Confirm day off/).props.disabled, false);
    const retry = fixture.confirm();
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(fixture.requests[1].payload, fixture.requests[0].payload);
    fixture.requests[1].response.resolve(successfulResponse());
    await retry;
    assert.equal(fixture.saved, 1);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("a connection failure keeps the confirmation available to retry or cancel", async () => {
  const fixture = await setup();
  try {
    const saving = fixture.confirm();
    fixture.requests[0].response.reject(new Error("Connection lost"));
    await saving;
    const afterError = fixture.render();
    assert.match(fixture.html, /role="alert"/);
    assert.match(fixture.html, /try again/i);
    assert.equal(button(afterError, /Confirm day off/).props.disabled, false);
    assert.equal(fixture.saved, 0);
    assert.equal(fixture.harness.refreshes, 0);
    await fixture.cancel();
    assert.equal(fixture.cancelled, 1);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("an unmounted successful confirmation refreshes availability without closing its replacement", async () => {
  const fixture = await setup();
  try {
    const saving = fixture.confirm();
    fixture.unmount();
    assert.equal(fixture.bodyStyle.overflow, "scroll");
    const updatesAtUnmount = fixture.harness.updates.length;
    fixture.requests[0].response.resolve(successfulResponse());
    await saving;
    assert.equal(fixture.harness.refreshes, 1);
    assert.equal(fixture.saved, 0);
    assert.equal(fixture.cancelled, 0);
    assert.equal(fixture.harness.updates.length, updatesAtUnmount);
  } finally { fixture.restore(); }
});

test("an unmounted failure cannot show an error in a replacement confirmation", async () => {
  for (const failure of ["server", "connection"]) {
    const fixture = await setup();
    try {
      const saving = fixture.confirm();
      fixture.unmount();
      const updatesAtUnmount = fixture.harness.updates.length;
      if (failure === "server") fixture.requests[0].response.resolve(new Response(JSON.stringify({ error: "An appointment conflicts." }), { status: 409 }));
      else fixture.requests[0].response.reject(new Error("Connection lost"));
      await saving;
      assert.equal(fixture.harness.refreshes, 0);
      assert.equal(fixture.saved, 0);
      assert.equal(fixture.cancelled, 0);
      assert.equal(fixture.harness.updates.length, updatesAtUnmount);
    } finally { fixture.restore(); }
  }
});

test("Escape cancels an idle dialog but cannot dismiss a save in progress", async () => {
  const fixture = await setup();
  try {
    assert.equal(fixture.escape(), true);
    assert.equal(fixture.cancelled, 1);
    const saving = fixture.confirm();
    assert.equal(fixture.escape(), true);
    assert.equal(fixture.cancelled, 1);
    fixture.requests[0].response.resolve(successfulResponse());
    await saving;
    assert.equal(fixture.saved, 1);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("keyboard focus wraps between the confirmation actions without trapping unrelated keys", async () => {
  const fixture = await setup();
  try {
    assert.equal(fixture.activeElement, fixture.cancelElement);
    assert.equal(fixture.keyDown("Tab"), false);
    assert.equal(fixture.keyDown("Tab", true), true);
    assert.equal(fixture.activeElement, fixture.confirmElement);
    assert.equal(fixture.keyDown("Tab", true), false);
    assert.equal(fixture.keyDown("Tab"), true);
    assert.equal(fixture.activeElement, fixture.cancelElement);
    assert.equal(fixture.keyDown("Enter"), false);
    assert.equal(fixture.keyDown("ArrowRight"), false);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("closing restores focus to the connected Day off trigger and restores scrolling", async () => {
  for (const connected of [true, false]) {
    const fixture = await setup();
    try {
      fixture.opener.isConnected = connected;
      fixture.unmount();
      assert.equal(fixture.dialog.open, false);
      assert.equal(fixture.opener.focusCount, connected ? 1 : 0);
      if (connected) assert.equal(fixture.activeElement, fixture.opener);
      assert.equal(fixture.bodyStyle.overflow, "scroll");
    } finally { fixture.restore(); }
  }
});

test("the provided Day off trigger receives focus even when a click did not focus it", async () => {
  for (const triggerRef of ["present", "empty"] as const) {
    const fixture = await setup("therapist-a", "Therapist A", { triggerRef });
    try {
      fixture.unmount();
      const expected = triggerRef === "present" ? fixture.trigger : fixture.opener;
      const other = triggerRef === "present" ? fixture.opener : fixture.trigger;
      assert.equal(fixture.activeElement, expected);
      assert.equal(expected.focusCount, 1);
      assert.equal(other.focusCount, 0);
    } finally { fixture.restore(); }
  }
});

test("keyboard events from the action buttons wrap focus even if native focus is stale", async () => {
  const fixture = await setup();
  try {
    fixture.opener.focus();
    assert.equal(fixture.keyDown("Tab", false, fixture.confirmElement), true);
    assert.equal(fixture.activeElement, fixture.cancelElement);
    fixture.opener.focus();
    assert.equal(fixture.keyDown("Tab", true, fixture.cancelElement), true);
    assert.equal(fixture.activeElement, fixture.confirmElement);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("Tab cannot leave the confirmation while its actions are disabled during a save", async () => {
  const fixture = await setup();
  try {
    fixture.confirmElement.focus();
    const saving = fixture.confirm();
    fixture.render();
    assert.equal(fixture.cancelElement.disabled, true);
    assert.equal(fixture.confirmElement.disabled, true);
    assert.equal(fixture.keyDown("Tab"), true);
    assert.equal(fixture.keyDown("Tab", true), true);
    assert.equal(fixture.activeElement, fixture.confirmElement);
    fixture.requests[0].response.resolve(new Response(JSON.stringify({ error: "An appointment conflicts." }), { status: 409 }));
    await saving;
    fixture.render();
    assert.equal(fixture.keyDown("Tab"), true);
    assert.equal(fixture.activeElement, fixture.cancelElement);
  } finally { fixture.unmount(); fixture.restore(); }
});
