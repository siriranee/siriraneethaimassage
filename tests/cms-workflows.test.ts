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

test("notification records keep owner Resend delivery metadata free of contact details and message bodies", async () => {
  const [types, notifications, publicBooking] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/notification-service.ts"),
    source("src/server/booking/public-booking.ts"),
  ]);
  const record = types.slice(types.indexOf("export type CmsBookingNotification"), types.indexOf("export type CmsBookingQuery"));
  assert.doesNotMatch(record, /recipient|phone|email|messageBody|body:/i);
  assert.match(notifications, /status: "preview"/);
  assert.match(
    notifications,
    /id: ownerBookingRequestEmailNotificationId\(booking\.id\)/,
  );
  assert.match(notifications, /audience: "owner"/);
  assert.match(notifications, /status: "queued"/);
  assert.match(notifications, /provider: "resend"/);
  assert.match(
    publicBooking,
    /const result = await create\(\);[\s\S]*?await attemptOwnerEmail\(result\.booking\)/,
  );
});

test("CMS navigation omits retired pages, media, recovery and manual publishing", async () => {
  const [shell, settings, integrations, types, contentService] = await Promise.all([
    source("src/components/cms/CmsShell.tsx"),
    source("src/app/cms/(protected)/settings/page.tsx"),
    source("src/app/cms/(protected)/settings/integrations/page.tsx"),
    source("src/domain/cms/types.ts"),
    source("src/server/cms/content-service.ts"),
  ]);
  assert.doesNotMatch(
    shell,
    /\/cms\/(?:team|content|notifications|search|pages|media)/,
  );
  assert.doesNotMatch(settings, /\/cms\/settings\/recovery|Recovery/);
  assert.doesNotMatch(integrations, /\/cms\/notifications/);
  assert.doesNotMatch(types, /CmsPageRecord|CmsGalleryRecord|readonly pages\??:|readonly gallery:/);
  assert.doesNotMatch(contentService, /updateCmsPage|createCmsGalleryItem|updateCmsGalleryItem/);

  for (const retiredPath of [
    "src/app/cms/(protected)/pages/page.tsx",
    "src/app/cms/(protected)/media/page.tsx",
    "src/app/cms/(protected)/settings/recovery/page.tsx",
    "src/app/cms/(protected)/content/preview/page.tsx",
    "src/app/api/cms/pages/[pageId]/route.ts",
    "src/app/api/cms/gallery/route.ts",
    "src/app/api/cms/content/publish/route.ts",
  ]) {
    await assert.rejects(source(retiredPath), { code: "ENOENT" });
  }
});

test("CMS shell keeps a purple desktop sidebar and a compact mobile drawer", async () => {
  const [shell, shellStyles] = await Promise.all([
    source("src/components/cms/CmsShell.tsx"),
    source("src/components/cms/CmsShell.module.css"),
  ]);

  assert.doesNotMatch(shell, /BrandMark|topbarTitle|View website|ExternalLink|workspaceLabel/);
  assert.match(shell, /src="\/siriranee_logo\.svg"/);
  assert.match(shell, /<span>Siriranee<\/span>[\s\S]*?<strong>CMS<\/strong>/);
  assert.match(shell, /href="\/"[\s\S]*?<span>Website<\/span>/);
  assert.match(shellStyles, /\.drawerHeader[\s\S]*justify-items:\s*center/);
  assert.match(shellStyles, /\.topbar[\s\S]*linear-gradient\(100deg, var\(--color-purple-800\)/);
  assert.match(shellStyles, /\.sidebar[\s\S]*transform:\s*translateX\(0\);[\s\S]*visibility:\s*visible/);
  assert.match(shellStyles, /\.workspace[\s\S]*margin-left:\s*var\(--cms-sidebar-width\)/);
  assert.match(shellStyles, /@media \(max-width: 980px\)[\s\S]*\.sidebar[\s\S]*translateX\(-105%\)/);
  assert.match(shellStyles, /\.menuButton\s*\{[\s\S]*display:\s*none/);
});

test("CMS overview omits warning notices without changing booking safeguards", async () => {
  const dashboard = await source("src/app/cms/(protected)/page.tsx");

  assert.doesNotMatch(dashboard, /CmsNotice|tone="warning"/);
  assert.match(dashboard, /summary\.pendingCount/);
  assert.match(dashboard, /<CmsBookingQuickActions/);
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

test("public page headings and SEO come from static project content", async () => {
  const [adapter, home, contact, pageCopy, types, contentService] = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/app/(site)/page.tsx"),
    source("src/app/(site)/contact/page.tsx"),
    source("src/content/page-copy.ts"),
    source("src/domain/cms/types.ts"),
    source("src/server/cms/content-service.ts"),
  ]);
  assert.match(pageCopy, /export function getPageCopy/);
  assert.match(pageCopy, /home:\s*\{/);
  assert.match(pageCopy, /contact:\s*\{/);
  assert.match(home, /getPageCopy\("home"\)/);
  assert.match(contact, /getPageCopy\("contact"\)/);
  assert.match(home, /pageCopy\.title/);
  assert.match(contact, /pageCopy\.description/);
  assert.doesNotMatch(adapter, /getPublicPageCopy|publishedSlides/);
  assert.doesNotMatch(types, /CmsPageRecord|readonly pages\??:/);
  assert.doesNotMatch(contentService, /parsePageUpdate|updateCmsPage|case "pages"/);
});

test("image-only vouchers publish on save and render in a navigation-free drag slider", async () => {
  const [types, service, adapter, home, slider, sliderStyles, editor, collectionRoute, itemRoute] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/app/(site)/page.tsx"),
    source("src/components/marketing/VoucherSlider.tsx"),
    source("src/components/marketing/VoucherSlider.module.css"),
    source("src/components/cms/VoucherEditorForm.tsx"),
    source("src/app/api/cms/vouchers/route.ts"),
    source("src/app/api/cms/vouchers/[voucherId]/route.ts"),
  ]);

  const voucherType = types.slice(
    types.indexOf("export type CmsVoucherRecord"),
    types.indexOf("export type CmsContentState"),
  );
  assert.match(voucherType, /readonly title:\s*string/);
  assert.match(voucherType, /readonly imageUrl:\s*string/);
  assert.match(voucherType, /readonly imageAlt:\s*string/);
  assert.doesNotMatch(voucherType, /description|amountCents|badge|terms/);
  assert.match(service, /vouchers: \[\.\.\.\(current\.vouchers \?\? \[\]\), created\]/);
  assert.equal((service.match(/\{ section: "vouchers", entityId: voucherId \}/g) ?? []).length, 2);
  assert.match(adapter, /voucher\.status === "published"/);
  assert.match(adapter, /first\.sortOrder - second\.sortOrder/);
  assert.match(adapter, /imageUrl:\s*voucher\.imageUrl/);
  assert.match(adapter, /imageAlt:\s*voucher\.imageAlt/);
  assert.match(home, /<VoucherSlider vouchers=\{vouchers\} \/>/);
  assert.match(slider, /onPointerDown/);
  assert.match(slider, /onPointerMove/);
  assert.match(slider, /onKeyDown=\{handleKeyDown\}/);
  assert.match(slider, /aria-roledescription="carousel"/);
  assert.match(slider, /<h3>\{voucher\.title\}<\/h3>/);
  assert.doesNotMatch(slider, /<button(?:\s|>)/i);
  assert.doesNotMatch(slider, />\s*(?:Previous|Next)\s*</i);
  assert.match(sliderStyles, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(sliderStyles, /object-fit:\s*contain/);
  assert.match(sliderStyles, /scrollbar-width:\s*none/);
  assert.doesNotMatch(home, />\s*Buy(?: now| voucher)?\s*</i);
  assert.doesNotMatch(editor, /\/api\/(?:checkout|stripe)|stripe\.com/i);
  assert.match(editor, /scope:\s*"voucher-image"/);
  assert.match(editor, /uploadCmsMediaSequentially/);
  assert.match(editor, /rollbackStagedCmsMediaAssets/);
  assert.doesNotMatch(editor, /name="(?:description|amountCents|badge|terms)"/);
  assert.match(collectionRoute, /isSameOriginMutation/);
  assert.match(collectionRoute, /requireCmsApiUser\("content:write"\)/);
  assert.match(collectionRoute, /rollbackCmsMediaSubmission/);
  assert.match(itemRoute, /Number\(parsed\.body\.expectedVersion\)/);
  assert.match(itemRoute, /rollbackCmsMediaSubmission/);
});
