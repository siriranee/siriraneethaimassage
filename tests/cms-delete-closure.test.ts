import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CmsClosure } from "../src/domain/cms/types";

type ElementProps = {
  children?: ReactNode;
  ref?: { current: unknown };
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  onCancel?: (event: { preventDefault(): void }) => void;
  onKeyDown?: (event: { key: string; shiftKey: boolean; target: unknown; preventDefault(): void }) => void;
};
type Harness = {
  cursor: number;
  slots: unknown[];
  effects: (() => void)[];
  updates: unknown[];
  replacements: string[];
  refreshes: number;
};

// Keep the real component request and completion handlers, replacing only the
// React instance lifecycle, native dialog, and router for delayed-response tests.
const hookUrl = pathToFileURL(`${process.cwd()}/tests/support/cms-delete-closure-hooks-stub.mjs`).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/CmsDeleteClosureButton.tsx") && ["react", "next/navigation"].includes(specifier)) {
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

function button(tree: ReactNode, label?: RegExp) {
  const found = descendants(tree).find((node) => node.type === "button" && (!label || label.test(renderToStaticMarkup(node))));
  assert.ok(found, `Expected a button matching ${label}`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function setup(options: { open?: boolean; closedAllDay?: boolean; therapistId?: string } = {}) {
  const harness: Harness = { cursor: 0, slots: [], effects: [], updates: [], replacements: [], refreshes: 0 };
  Object.defineProperty(globalThis, Symbol.for("cms-delete-closure-test-harness"), { configurable: true, value: harness });
  const { CmsDeleteClosureButton } = await import("../src/components/cms/CmsDeleteClosureButton");
  const closure: CmsClosure = {
    id: "closure-a", therapistId: options.therapistId ?? "therapist-a", localDate: "2026-10-16",
    closedAllDay: options.closedAllDay ?? true, startsAtLocal: "12:00", endsAtLocal: "13:00",
    reason: "Day off", publicLabel: "", active: true, version: 7,
    createdAt: "2026-10-15T10:00:00.000Z", updatedAt: "2026-10-15T11:00:00.000Z", updatedBy: "owner-a",
  };
  const returnHref = "/cms/calendar?month=2026-10&date=2026-10-16";
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
    focus() { this.focusCount += 1; documentState.activeElement = this; }
  }
  const opener = new TestHTMLElement();
  const cancelElement = new TestHTMLElement();
  const confirmElement = new TestHTMLElement();
  const dialog = {
    open: false, showCount: 0,
    showModal() { this.open = true; this.showCount += 1; },
    close() { this.open = false; },
  };
  documentState.activeElement = opener;
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentState });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: TestHTMLElement });
  const requests: { url: unknown; method?: string; payload: unknown; response: ReturnType<typeof deferred<Response>> }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const response = deferred<Response>();
    requests.push({ url, method: init?.method, payload: JSON.parse(String(init?.body)), response });
    return response.promise;
  };
  let tree: ReactElement<ElementProps>;
  const dialogNode = () => descendants(tree).find((node) => node.type === "dialog");
  function action(label: RegExp) {
    const node = dialogNode();
    assert.ok(node, "Expected an open confirmation dialog");
    return button(node, label);
  }
  function render() {
    harness.cursor = 0;
    tree = CmsDeleteClosureButton({ closure, therapistName: closure.therapistId ? "Therapist A" : "All therapists", returnHref }) as ReactElement<ElementProps>;
    const trigger = button(tree);
    if (trigger.props.ref) trigger.props.ref.current = opener;
    const node = dialogNode();
    if (node) {
      if (node.props.ref) node.props.ref.current = dialog;
      const cancel = action(/Cancel/);
      if (cancel.props.ref) cancel.props.ref.current = cancelElement;
      cancelElement.disabled = cancel.props.disabled ?? false;
      const confirm = action(/Confirm delete|Deleting/);
      if (confirm.props.ref) confirm.props.ref.current = confirmElement;
      confirmElement.disabled = confirm.props.disabled ?? false;
    }
    harness.effects.splice(0).forEach((effect) => effect());
    return tree;
  }
  render();
  function open() { button(tree).props.onClick?.(); render(); }
  if (options.open !== false) open();
  return {
    harness, requests, closure, returnHref, render, dialog, bodyStyle, opener, cancelElement, confirmElement, open,
    get html() { return renderToStaticMarkup(tree); },
    get activeElement() { return documentState.activeElement; },
    confirm: () => action(/Confirm delete|Deleting/).props.onClick?.(),
    cancel: () => action(/Cancel/).props.onClick?.(),
    escape() {
      let prevented = false;
      dialogNode()?.props.onCancel?.({ preventDefault() { prevented = true; } });
      return prevented;
    },
    keyDown(key: string, shiftKey = false, target = documentState.activeElement) {
      let prevented = false;
      dialogNode()?.props.onKeyDown?.({ key, shiftKey, target, preventDefault() { prevented = true; } });
      return prevented;
    },
    unmount() {
      harness.slots.forEach((slot) => {
        if (slot && typeof slot === "object") (slot as { cleanup?: () => void }).cleanup?.();
      });
    },
    restore() {
      globalThis.fetch = originalFetch;
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
      if (originalHTMLElement) Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
      else Reflect.deleteProperty(globalThis, "HTMLElement");
      Reflect.deleteProperty(globalThis, Symbol.for("cms-delete-closure-test-harness"));
    },
  };
}

function successfulResponse() {
  return new Response(JSON.stringify({ deleted: { id: "closure-a", localDate: "2026-10-16", therapistId: "therapist-a" } }), { status: 200 });
}

test("opening the closure or cancelling its delete dialog never writes or navigates", async () => {
  const fixture = await setup({ open: false });
  try {
    assert.match(fixture.html, /Delete day off/);
    assert.doesNotMatch(fixture.html, /<dialog/);
    fixture.open();
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.dialog.showCount, 1);
    assert.match(fixture.html, /Therapist A/);
    assert.match(fixture.html, /16 October 2026/);
    assert.equal(fixture.activeElement, fixture.cancelElement);
    assert.equal(fixture.bodyStyle.overflow, "hidden");
    assert.equal(fixture.requests.length, 0);
    await fixture.cancel();
    fixture.render();
    assert.equal(fixture.dialog.open, false);
    assert.doesNotMatch(fixture.html, /<dialog/);
    assert.equal(fixture.bodyStyle.overflow, "scroll");
    assert.equal(fixture.activeElement, fixture.opener);
    assert.equal(fixture.requests.length, 0);
    assert.deepEqual(fixture.harness.replacements, []);
    assert.equal(fixture.harness.refreshes, 0);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("confirming deletes the selected closure version once and returns to its calendar date", async () => {
  const fixture = await setup();
  try {
    const deleting = fixture.confirm();
    await fixture.confirm();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].url, "/api/cms/closures/closure-a");
    assert.equal(fixture.requests[0].method, "DELETE");
    assert.deepEqual(fixture.requests[0].payload, { expectedVersion: 7 });
    fixture.render();
    assert.equal(fixture.confirmElement.disabled, true);
    assert.equal(fixture.cancelElement.disabled, true);
    assert.deepEqual(fixture.harness.replacements, []);
    fixture.requests[0].response.resolve(successfulResponse());
    await deleting;
    assert.deepEqual(fixture.harness.replacements, [fixture.returnHref]);
    assert.equal(fixture.harness.refreshes, 1);
    fixture.render();
    assert.equal(fixture.confirmElement.disabled, true);
    await fixture.confirm();
    assert.equal(fixture.requests.length, 1, "Success remains locked until navigation completes");
  } finally { fixture.unmount(); fixture.restore(); }
});

test("blocked time uses an accurate delete label and displays the saved time range", async () => {
  const fixture = await setup({ closedAllDay: false });
  try {
    assert.match(fixture.html, /Delete blocked time/);
    assert.match(fixture.html, /12:00–13:00/);
    assert.equal(fixture.requests.length, 0);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("whole-business delete confirmation identifies all therapists", async () => {
  const fixture = await setup({ therapistId: "" });
  try {
    assert.match(fixture.html, /all therapists/i);
    assert.equal(fixture.requests.length, 0);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("a stale closure conflict stays in the open dialog without navigating", async () => {
  const fixture = await setup();
  try {
    const deleting = fixture.confirm();
    fixture.requests[0].response.resolve(new Response(JSON.stringify({ error: "This day off changed. Refresh before deleting." }), { status: 409 }));
    await deleting;
    fixture.render();
    assert.equal(fixture.dialog.open, true);
    assert.match(fixture.html, /role="alert"/);
    assert.match(fixture.html, /This day off changed\. Refresh before deleting\./);
    assert.equal(fixture.confirmElement.disabled, false);
    assert.deepEqual(fixture.harness.replacements, []);
    assert.equal(fixture.harness.refreshes, 0);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("server and malformed-success failures cannot be mistaken for a successful delete", async () => {
  for (const response of [
    new Response(JSON.stringify({ error: "Deletion is unavailable." }), { status: 503 }),
    new Response(JSON.stringify({}), { status: 200 }),
    new Response(JSON.stringify({ deleted: { id: "another-closure" } }), { status: 200 }),
    new Response("not json", { status: 200 }),
  ]) {
    const fixture = await setup();
    try {
      const deleting = fixture.confirm();
      fixture.requests[0].response.resolve(response);
      await deleting;
      fixture.render();
      assert.equal(fixture.confirmElement.disabled, false);
      assert.match(fixture.html, /role="alert"/);
      assert.deepEqual(fixture.harness.replacements, []);
      assert.equal(fixture.harness.refreshes, 0);
    } finally { fixture.unmount(); fixture.restore(); }
  }
});

test("a connection failure permits an explicit retry and clears its error on success", async () => {
  const fixture = await setup();
  try {
    const deleting = fixture.confirm();
    fixture.requests[0].response.reject(new Error("Connection lost"));
    await deleting;
    fixture.render();
    assert.equal(fixture.confirmElement.disabled, false);
    assert.match(fixture.html, /role="alert"/);
    assert.deepEqual(fixture.harness.replacements, []);
    const retry = fixture.confirm();
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(fixture.requests[1].payload, { expectedVersion: 7 });
    fixture.render();
    assert.doesNotMatch(fixture.html, /role="alert"/);
    fixture.requests[1].response.resolve(successfulResponse());
    await retry;
    assert.deepEqual(fixture.harness.replacements, [fixture.returnHref]);
    assert.equal(fixture.harness.refreshes, 1);
  } finally { fixture.unmount(); fixture.restore(); }
});

test("Escape cancels without writing but neither Escape nor Cancel can dismiss a pending delete", async () => {
  const fixture = await setup();
  try {
    assert.equal(fixture.escape(), true);
    fixture.render();
    assert.equal(fixture.dialog.open, false);
    assert.equal(fixture.requests.length, 0);
    fixture.open();
    const deleting = fixture.confirm();
    fixture.render();
    assert.equal(fixture.escape(), true);
    await fixture.cancel();
    fixture.render();
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.requests.length, 1);
    fixture.requests[0].response.resolve(successfulResponse());
    await deleting;
  } finally { fixture.unmount(); fixture.restore(); }
});

test("dialog keyboard boundaries retain focus and block Tab while deletion is pending", async () => {
  const fixture = await setup();
  try {
    assert.equal(fixture.keyDown("Tab", true, fixture.cancelElement), true);
    assert.equal(fixture.activeElement, fixture.confirmElement);
    assert.equal(fixture.keyDown("Tab", false, fixture.confirmElement), true);
    assert.equal(fixture.activeElement, fixture.cancelElement);
    assert.equal(fixture.keyDown("ArrowRight"), false);
    const deleting = fixture.confirm();
    fixture.render();
    assert.equal(fixture.keyDown("Tab"), true);
    assert.equal(fixture.keyDown("Tab", true), true);
    fixture.requests[0].response.resolve(successfulResponse());
    await deleting;
  } finally { fixture.unmount(); fixture.restore(); }
});

test("an unmounted successful delete refreshes availability without navigating a replacement page", async () => {
  const fixture = await setup();
  try {
    const deleting = fixture.confirm();
    fixture.unmount();
    assert.equal(fixture.bodyStyle.overflow, "scroll");
    assert.equal(fixture.dialog.open, false);
    const updatesAtUnmount = fixture.harness.updates.length;
    fixture.requests[0].response.resolve(successfulResponse());
    await deleting;
    assert.deepEqual(fixture.harness.replacements, []);
    assert.equal(fixture.harness.refreshes, 1);
    assert.equal(fixture.harness.updates.length, updatesAtUnmount);
  } finally { fixture.restore(); }
});

test("unmounted server and connection failures cannot update a replacement page", async () => {
  for (const failure of ["server", "connection"]) {
    const fixture = await setup();
    try {
      const deleting = fixture.confirm();
      fixture.unmount();
      const updatesAtUnmount = fixture.harness.updates.length;
      if (failure === "server") fixture.requests[0].response.resolve(new Response(JSON.stringify({ error: "This day off changed." }), { status: 409 }));
      else fixture.requests[0].response.reject(new Error("Connection lost"));
      await deleting;
      assert.deepEqual(fixture.harness.replacements, []);
      assert.equal(fixture.harness.refreshes, 0);
      assert.equal(fixture.harness.updates.length, updatesAtUnmount);
    } finally { fixture.restore(); }
  }
});
