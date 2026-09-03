import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { isMongoCommitResultIndeterminate } from "../src/server/cms/mongo-error-label";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("MongoDB indeterminate commit labels are detected without a driver dependency", () => {
  assert.equal(
    isMongoCommitResultIndeterminate({
      errorLabels: ["UnknownTransactionCommitResult"],
    }),
    true,
  );
  assert.equal(
    isMongoCommitResultIndeterminate({
      hasErrorLabel(label: string) {
        return label === "UnknownTransactionCommitResult";
      },
    }),
    true,
  );
  assert.equal(
    isMongoCommitResultIndeterminate({
      cause: { errorLabels: ["UnknownTransactionCommitResult"] },
    }),
    true,
  );
  assert.equal(
    isMongoCommitResultIndeterminate({
      errorLabels: ["TransientTransactionError"],
    }),
    false,
  );
  assert.equal(
    isMongoCommitResultIndeterminate({
      hasErrorLabel() {
        throw new Error("Unavailable label accessor");
      },
    }),
    false,
  );
});

test("CMS-created service slugs reach the public catalogue without local fallbacks", async () => {
  const [adapter, serviceTypes] = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/domain/service.ts"),
  ]);
  assert.doesNotMatch(adapter, /isServiceSlug/);
  assert.doesNotMatch(adapter, /serviceSlugs,/);
  assert.match(serviceTypes, /export type ServiceSlug = string/);
  assert.doesNotMatch(adapter, /fallbackServices|fallbackBySlug/);
  assert.doesNotMatch(adapter, /serviceCategories|record\.category/);
  assert.match(adapter, /if \(!isPublicProjectImage\(record\.imageUrl\)\) return null/);
  assert.match(adapter, /const imageSource = record\.imageUrl/);
});

test("public service details resolve current CMS slugs only at request time", async () => {
  const page = await source("src/app/(site)/services/[slug]/page.tsx");

  assert.doesNotMatch(page, /generateStaticParams/);
  assert.match(page, /getPublicServicesSnapshot\(\)/);
  assert.match(page, /services\.find\(\(item\) => item\.slug === slug\)/);
  assert.match(page, /notFound\(\)/);
});

test("notification preview records duplicate no contact details or message bodies", async () => {
  const [types, notifications] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/notification-service.ts"),
  ]);
  const record = types.slice(types.indexOf("export type CmsBookingNotification"), types.indexOf("export type CmsBookingQuery"));
  assert.doesNotMatch(record, /recipient|phone|email|messageBody|body:/i);
  assert.match(notifications, /status: "preview"/);
});

test("CMS navigation omits retired sections and manual publishing", async () => {
  const [shell, pages, integrations] = await Promise.all([
    source("src/components/cms/CmsShell.tsx"),
    source("src/app/cms/(protected)/pages/page.tsx"),
    source("src/app/cms/(protected)/settings/integrations/page.tsx"),
  ]);
  assert.doesNotMatch(shell, /\/cms\/(?:team|content|notifications|search)/);
  assert.match(shell, /href: "\/cms\/pages"/);
  assert.doesNotMatch(pages, /content\/preview|Review & publish/);
  assert.doesNotMatch(integrations, /\/cms\/notifications/);
  await assert.rejects(
    source("src/app/cms/(protected)/content/preview/page.tsx"),
    { code: "ENOENT" },
  );
  await assert.rejects(
    source("src/app/api/cms/content/publish/route.ts"),
    { code: "ENOENT" },
  );
});

test("notification bell loads one safe dashboard feed per CMS page load", async () => {
  const [layout, shell, bell, bellStyles, readService, mockRepository, mongoRepository, indexes] = await Promise.all([
    source("src/app/cms/(protected)/layout.tsx"),
    source("src/components/cms/CmsShell.tsx"),
    source("src/components/cms/CmsNotificationBell.tsx"),
    source("src/components/cms/CmsNotificationBell.module.css"),
    source("src/server/cms/read-service.ts"),
    source("src/server/cms/repositories/mock-repository.ts"),
    source("src/server/cms/repositories/mongo-repository.ts"),
    source("scripts/cms-indexes.mjs"),
  ]);
  const bellMapper = readService.slice(
    readService.indexOf("export async function listCmsNotificationBellItems"),
    readService.indexOf("export async function listCmsClosures"),
  );

  assert.match(layout, /await listCmsNotificationBellItems\(\)/);
  assert.match(layout, /notifications=\{notifications\}/);
  assert.doesNotMatch(bell, /fetch\(|setInterval\(|setTimeout\(|visibilitychange/);
  assert.doesNotMatch(bellMapper, /lastError|attemptCount|status|channel/);
  assert.match(mockRepository, /filter\(\(item\) => item\.channel === "dashboard"\)/);
  assert.match(mongoRepository, /find\(\{ channel: "dashboard" \}/);
  assert.match(indexes, /\{ channel: 1, createdAt: -1 \}/);
  assert.match(shell, /placement="desktop"/);
  assert.match(shell, /placement="mobile"/);
  assert.match(bell, /aria-expanded=\{open\}/);
  assert.match(bell, /event\.key !== "Escape"/);
  assert.match(bell, /Loaded when this page opened/);
  assert.match(bellStyles, /\.desktop[\s\S]*position: fixed/);
  assert.match(bellStyles, /@media \(max-width: 980px\)/);
});

test("content saves publish inside the same repository transaction", async () => {
  const service = await source("src/server/cms/content-service.ts");
  const mutation = service.slice(
    service.indexOf("async function mutateContent"),
    service.indexOf("export async function getCmsContent"),
  );

  assert.match(
    mutation,
    /commitCmsMediaForContentMutation[\s\S]*saveContent[\s\S]*publishContentImmediately[\s\S]*appendCmsAudit/,
  );
  assert.match(mutation, /return repository\.transaction/);
  assert.doesNotMatch(service, /getCmsPublicationPreview|restoreCmsPublicationToDraft|publishCmsContent/);
  await assert.rejects(
    source("src/app/api/cms/content/publications/[publicationId]/restore/route.ts"),
    { code: "ENOENT" },
  );
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

test("gift vouchers publish on save and remain information-only enquiries", async () => {
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
  assert.equal((service.match(/\{ section: "vouchers", entityId: voucherId \}/g) ?? []).length, 2);
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
