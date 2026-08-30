import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("CMS-created service slugs can reach the public catalogue", async () => {
  const [adapter, serviceTypes] = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/content/services.ts"),
  ]);
  assert.doesNotMatch(adapter, /isServiceSlug/);
  assert.doesNotMatch(adapter, /serviceSlugs,/);
  assert.match(serviceTypes, /export type ServiceSlug = string/);
  assert.match(adapter, /fallbackBySlug\.get\(record\.slug\) \?\? fallbackServices\[0\]/);
});

test("notification preview records duplicate no contact details or message bodies", async () => {
  const [types, notifications, queuePage] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/notification-service.ts"),
    source("src/app/cms/(protected)/notifications/page.tsx"),
  ]);
  const record = types.slice(types.indexOf("export type CmsBookingNotification"), types.indexOf("export type CmsBookingQuery"));
  assert.doesNotMatch(record, /recipient|phone|email|messageBody|body:/i);
  assert.match(notifications, /status: "preview"/);
  assert.match(queuePage, /no recipient address and no message body/i);
  assert.match(queuePage, /no messages are sent/i);
});

test("publication restore creates a draft and preserves operational booking settings", async () => {
  const [service, route] = await Promise.all([
    source("src/server/cms/content-service.ts"),
    source("src/app/api/cms/content/publications/[publicationId]/restore/route.ts"),
  ]);
  assert.match(service, /bookingSettings: current\.bookingSettings/);
  assert.match(service, /weeklyHours: current\.site\.weeklyHours/);
  assert.match(service, /openingHoursConfirmed: current\.site\.openingHoursConfirmed/);
  assert.match(service, /revision: current\.revision \+ 1/);
  assert.match(route, /requireCmsApiUser\("content:publish"\)/);
});

test("closures repeat within a bounded range and use soft deactivation", async () => {
  const [service, editor] = await Promise.all([
    source("src/server/cms/booking-service.ts"),
    source("src/components/cms/ClosureForm.tsx"),
  ]);
  assert.match(service, /repeatWeeklyCount < 1 \|\| repeatWeeklyCount > 12/);
  assert.match(service, /calendar\.closure-deactivated/);
  assert.match(editor, /releasing the blocked time/);
  assert.doesNotMatch(editor, /method:\s*"DELETE"/);
});

test("published page headings and SEO come from the immutable CMS snapshot", async () => {
  const [adapter, home, contact] = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/app/(site)/page.tsx"),
    source("src/app/(site)/contact/page.tsx"),
  ]);
  assert.match(adapter, /getPublicPageCopy/);
  assert.match(home, /getPublicPageCopy\("home"\)/);
  assert.match(contact, /getPublicPageCopy\("contact"\)/);
  assert.match(home, /pageCopy\.title/);
  assert.match(contact, /pageCopy\.description/);
});

test("gift vouchers use CMS publication boundaries and information-only enquiries", async () => {
  const [types, service, adapter, home, editor, collectionRoute, itemRoute] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/app/(site)/page.tsx"),
    source("src/components/cms/VoucherEditorForm.tsx"),
    source("src/app/api/cms/vouchers/route.ts"),
    source("src/app/api/cms/vouchers/[voucherId]/route.ts"),
  ]);

  assert.match(types, /export type CmsVoucherRecord/);
  assert.match(service, /vouchers: \[\.\.\.\(current\.vouchers \?\? \[\]\), created\]/);
  assert.match(service, /label: "Gift vouchers"/);
  assert.match(adapter, /voucher\.status === "published"/);
  assert.match(adapter, /first\.sortOrder - second\.sortOrder/);
  assert.match(home, /Voucher information is shown for enquiry only/);
  assert.match(home, /No online payment is/);
  assert.doesNotMatch(home, />\s*Buy(?: now| voucher)?\s*</i);
  assert.doesNotMatch(editor, /\/api\/(?:checkout|stripe)|stripe\.com/i);
  assert.match(editor, /does not create an online product or payment link/i);
  assert.match(collectionRoute, /isSameOriginMutation/);
  assert.match(collectionRoute, /requireCmsApiUser\("content:write"\)/);
  assert.match(itemRoute, /Number\(body\.expectedVersion\)/);
});
