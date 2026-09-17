import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { applyEmailDeliveryEvent, parseEmailDeliveryEvent } from "../src/domain/booking/email-delivery";
import type { CmsBookingNotification } from "../src/domain/cms/types";

registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "server-only"
    ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
    : nextResolve(specifier, context);
} });

const notification: CmsBookingNotification = {
  id: "customer-confirmation-test", bookingId: "fictional-booking", bookingReference: "TEST",
  channel: "email", audience: "customer", kind: "booking-confirmed", status: "sent",
  provider: "resend", providerMessageId: "email_test_123", attemptCount: 1, lastError: "",
  createdAt: "2026-09-17T10:00:00.000Z", updatedAt: "2026-09-17T10:00:00.000Z",
};
function payload(type = "email.delivered") {
  return { type, created_at: "2026-09-17T10:01:00.000Z", data: {
    email_id: "email_test_123", to: ["fictional@example.test"], subject: "Private subject",
  } };
}
const secretBytes = Buffer.alloc(32, 42);
const secret = `whsec_${secretBytes.toString("base64")}`;
function signedRequest(raw = JSON.stringify(payload()), options: { age?: number; signature?: string } = {}) {
  const id = "msg_test_123";
  const timestamp = String(Math.floor(Date.now() / 1000) - (options.age ?? 0));
  const signature = options.signature ?? createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST", body: raw,
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
  });
}
async function repository() {
  Reflect.deleteProperty(globalThis, "__siriraneeCmsMockState");
  const { MockCmsRepository } = await import("../src/server/cms/repositories/mock-repository");
  return new MockCmsRepository();
}

test("signed delivery event retains metadata only, deduplicates, and never changes acceptance state", async () => {
  const repo = await repository();
  await repo.saveNotification(notification);
  const { handleResendDeliveryWebhook } = await import("../src/server/booking/email-delivery-webhook");
  for (let n = 0; n < 2; n++) {
    assert.equal((await handleResendDeliveryWebhook(signedRequest(), { secret, repository: () => repo })).status, 200);
  }
  const updated = await repo.getNotification(notification.id);
  assert.equal(updated?.status, "sent");
  assert.equal(updated?.deliveryStatus, "delivered");
  assert.equal(updated?.providerEventId, "msg_test_123");
  const event = parseEmailDeliveryEvent(payload(), "msg_test_123")!;
  assert.deepEqual(Object.keys(event).sort(), ["deliveryStatus", "id", "occurredAt", "providerMessageId", "receivedAt"]);
  assert.doesNotMatch(JSON.stringify(event), /fictional@example|Private subject/);
});

test("invalid, tampered, missing and expired signatures never access storage", async () => {
  const { handleResendDeliveryWebhook } = await import("../src/server/booking/email-delivery-webhook");
  let storageCalls = 0;
  const deps = { secret, repository: () => { storageCalls++; throw new Error("must not access storage"); } };
  for (const request of [
    signedRequest(undefined, { signature: "invalid" }),
    signedRequest(undefined, { age: 601 }),
    new Request("http://localhost", { method: "POST", body: "{}" }),
    signedRequest("not JSON"),
  ]) assert.ok((await handleResendDeliveryWebhook(request, deps)).status >= 400);
  assert.equal(storageCalls, 0);
  assert.equal((await handleResendDeliveryWebhook(signedRequest(), { ...deps, secret: undefined })).status, 503);
});

test("bounded webhook rejects oversized payload and ignores unrelated tracking events", async () => {
  const repo = await repository();
  const { handleResendDeliveryWebhook } = await import("../src/server/booking/email-delivery-webhook");
  const deps = { secret, repository: () => repo };
  assert.equal((await handleResendDeliveryWebhook(signedRequest("x".repeat(65537)), deps)).status, 413);
  const ignored = await handleResendDeliveryWebhook(signedRequest(JSON.stringify(payload("email.opened"))), deps);
  assert.equal(ignored.status, 200);
  assert.deepEqual(await ignored.json(), { received: true, ignored: true });
});

test("provider event arriving before the send response is reconciled after claimed completion", async () => {
  const repo = await repository();
  const { providerMessageId: ignored, ...unsent } = notification;
  void ignored;
  await repo.saveNotification({ ...unsent, status: "queued", attemptCount: 0 });
  const claimed = await repo.claimNotificationDelivery(notification.id, "queued", 0, undefined, "claim_test", notification.createdAt, notification.createdAt);
  assert.ok(claimed);
  await repo.recordEmailDeliveryEvent(parseEmailDeliveryEvent(payload(), "msg_early")!);
  assert.equal((await repo.getNotification(notification.id))?.deliveryStatus, undefined);
  // Binding the immutable payload must retain the live claim.
  assert.equal(await repo.completeNotificationDelivery({ ...claimed, deliveryPayloadHash: "safe_hash" }, "claim_test"), true);
  assert.equal(await repo.completeNotificationDelivery(notification, "claim_test"), true);
  assert.equal((await repo.getNotification(notification.id))?.deliveryStatus, "delivered");
  assert.equal(await repo.completeNotificationDelivery({ ...notification, status: "failed" }, "claim_test"), false);
});

test("duplicate/out-of-order events never hide terminal failures or reopen delivery", () => {
  const delivered = parseEmailDeliveryEvent(payload(), "msg_delivered")!;
  const bounced = { ...delivered, id: "msg_bounced", deliveryStatus: "bounced" as const, occurredAt: "2026-09-17T10:02:00.000Z" };
  const delayed = { ...delivered, id: "msg_delayed", deliveryStatus: "delayed" as const, occurredAt: "2026-09-17T10:03:00.000Z" };
  const expected = [delivered, bounced, delayed].reduce(applyEmailDeliveryEvent, notification);
  const reordered = [delayed, bounced, delivered, delivered].reduce(applyEmailDeliveryEvent, notification);
  assert.deepEqual(reordered, expected);
  assert.equal(expected.deliveryStatus, "bounced");
  assert.equal(expected.status, "sent");
  assert.equal(expected.attemptCount, 1);
  assert.equal(applyEmailDeliveryEvent(notification, { ...delivered, providerMessageId: "different" }), notification);
});
