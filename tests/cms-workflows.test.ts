import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { isMongoCommitResultIndeterminate } from "../src/server/cms/mongo-error-label";
import {
  bookingActivityStatusLabel,
  bookingEmailDeliveryFeedback,
  withTherapistEmailFeedback,
} from "../src/domain/cms/notification-presentation";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("historical request activity only prompts review while the booking is still pending", () => {
  assert.match(bookingActivityStatusLabel("pending"), /review needed/);
  for (const status of ["confirmed", "cancelled", "completed", "no-show"] as const) {
    const label = bookingActivityStatusLabel(status);
    assert.match(label, /Current status:/);
    assert.doesNotMatch(label, /review needed|new request/i);
  }
  assert.match(bookingActivityStatusLabel(undefined), /Historical activity/);
});

test("provider acceptance is never presented as verified email delivery", () => {
  const accepted = bookingEmailDeliveryFeedback({ status: "sent", provider: "resend", lastError: "" });
  assert.equal(accepted.label, "Accepted by Resend");
  assert.match(accepted.text, /delivery has not been verified/);
  const delivered = bookingEmailDeliveryFeedback({ status: "sent", provider: "resend", deliveryStatus: "delivered", lastError: "" });
  assert.equal(delivered.label, "Delivered");
  assert.equal(delivered.tone, "success");
  assert.match(delivered.text, /does not confirm.*opened/);
});

test("adverse delivery events take precedence over earlier successful provider acceptance", () => {
  for (const deliveryStatus of ["bounced", "failed", "delayed", "complained", "suppressed"] as const) {
    const feedback = bookingEmailDeliveryFeedback({ status: "sent", provider: "resend", deliveryStatus, lastError: "" });
    assert.equal(feedback.tone, "warning", deliveryStatus);
    assert.notEqual(feedback.label, "Accepted by Resend");
    assert.notEqual(feedback.label, "Delivered");
  }
  const uncertain = bookingEmailDeliveryFeedback({ status: "indeterminate", provider: "resend", lastError: "" });
  assert.match(uncertain.text, /before retrying to avoid a duplicate/);
});

test("a saved booking still warns when its separate therapist email did not succeed", () => {
  const saved = { tone: "success" as const, text: "Booking confirmed." };
  for (const outcome of [
    { status: "failed" },
    { status: "pending" },
    { status: "indeterminate" },
    { status: "skipped", reason: "therapist-contact-unavailable" },
  ] as const) {
    const feedback = withTherapistEmailFeedback(saved, [outcome]);
    assert.equal(feedback.tone, "warning");
    assert.match(feedback.text, /^Booking confirmed\./);
    assert.match(feedback.text, /Therapist email needs attention/);
  }
  assert.deepEqual(withTherapistEmailFeedback(saved, [{ status: "skipped", reason: "mock-mode" }]), saved);
});

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

test("therapist notification addresses stay private and never enter public payloads", async () => {
  const [types, adapter, plannerConfig, bookingRoute] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/server/booking/public-config.ts"),
    source("src/app/api/public/bookings/route.ts"),
  ]);
  const publicTeamMapper = adapter.slice(
    adapter.indexOf("export const getPublicTeam"),
    adapter.indexOf("export const getPublicPromotions"),
  );
  const teamRecord = types.slice(
    types.indexOf("export type CmsTeamRecord"),
    types.indexOf("export type CmsTherapistContact"),
  );
  const privateContact = types.slice(
    types.indexOf("export type CmsTherapistContact"),
    types.indexOf("export type CmsTeamEditorRecord"),
  );

  assert.doesNotMatch(teamRecord, /notificationEmail/);
  assert.match(privateContact, /readonly notificationEmail:\s*string/);
  assert.match(privateContact, /readonly contactPhone:\s*string/);
  assert.doesNotMatch(publicTeamMapper, /notificationEmail/);
  assert.doesNotMatch(publicTeamMapper, /contactPhone/);
  assert.doesNotMatch(plannerConfig, /notificationEmail/);
  assert.doesNotMatch(plannerConfig, /contactPhone/);
  assert.match(bookingRoute, /therapistName:\s*booking\.assignedStaffName/);
  assert.doesNotMatch(bookingRoute, /therapistEmail|notificationEmail/);
});

test("notification records keep Resend delivery metadata free of contact details and message bodies", async () => {
  const [types, notifications, publicBooking] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/notification-service.ts"),
    source("src/server/booking/public-booking.ts"),
  ]);
  const record = types.slice(types.indexOf("export type CmsBookingNotification"), types.indexOf("export type CmsBookingQuery"));
  assert.doesNotMatch(record, /readonly\s+(?:recipient\w*|phone\w*|email\w*|messageBody|body)\??\s*:/i);
  assert.match(notifications, /status: "preview"/);
  assert.match(
    notifications,
    /id: ownerBookingRequestEmailNotificationId\(booking\.id\)/,
  );
  assert.match(notifications, /audience: "owner"/);
  assert.match(
    notifications,
    /customerBookingConfirmationEmailNotificationId\(booking\.id\)/,
  );
  assert.match(notifications, /audience: "customer"/);
  assert.match(notifications, /audience: "therapist"/);
  assert.match(notifications, /targetTeamMemberId:/);
  assert.match(notifications, /therapistBookingEmailNotificationId/);
  assert.match(notifications, /status: "queued"/);
  assert.match(notifications, /provider: "resend"/);
  assert.match(
    publicBooking,
    /const result = await create\(\);[\s\S]*?await attemptOwnerEmail\(result\.booking\)/,
  );
});

test("CMS navigation includes therapist management and omits retired publishing surfaces", async () => {
  const [shell, settings, integrations, types, contentService, teamPage, teamEditPage, teamPageStyles, teamEditor, collectionRoute, itemRoute] = await Promise.all([
    source("src/components/cms/CmsShell.tsx"),
    source("src/app/cms/(protected)/settings/page.tsx"),
    source("src/app/cms/(protected)/settings/integrations/page.tsx"),
    source("src/domain/cms/types.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/app/cms/(protected)/team/page.tsx"),
    source("src/app/cms/(protected)/team/[memberId]/edit/page.tsx"),
    source("src/app/cms/(protected)/team/page.module.css"),
    source("src/components/cms/TeamEditorForm.tsx"),
    source("src/app/api/cms/team/route.ts"),
    source("src/app/api/cms/team/[memberId]/route.ts"),
  ]);
  assert.match(shell, /href: "\/cms\/team", label: "Therapists"/);
  assert.match(
    shell,
    /href: "\/cms\/team", label: "Therapists", icon: UsersRound, permission: "content:write"/,
  );
  assert.doesNotMatch(
    shell,
    /\/cms\/(?:content|notifications|search|pages|media)/,
  );
  assert.match(teamPage, /listCmsTeamEditorRecords/);
  assert.match(teamPage, /requireCmsPageUser\("content:write"\)/);
  assert.match(teamPage, /href="\/cms\/team\/new"/);
  assert.match(teamPageStyles, /\.teamGrid\s*\{[\s\S]*?align-items:\s*start/);
  assert.match(teamPageStyles, /\.memberCard\s*\{[\s\S]*?align-self:\s*start/);
  assert.doesNotMatch(teamPageStyles, /\.cardBody\s*\{[\s\S]*?height:\s*100%/);
  assert.match(teamEditor, /name="notificationEmail"/);
  assert.match(teamEditor, /name="contactPhone"/);
  assert.match(teamEditor, /name="operationalActive"/);
  assert.match(teamEditor, /name="publicProfile"/);
  assert.match(teamEditor, /name="serviceIds"/);
  assert.match(teamEditor, /scope:\s*"therapist-profile"/);
  assert.match(teamEditor, /Delete therapist/);
  assert.match(teamEditor, /method:\s*"DELETE"/);
  assert.match(teamEditor, /Permanently delete/);
  assert.match(teamEditor, /No cancellation emails will be sent/);
  assert.match(teamEditor, /!isNew \? \(/);
  assert.doesNotMatch(teamEditor, /!isNew && !member\.archived/);
  assert.match(teamEditor, /router\.replace\("\/cms\/team"\)/);
  assert.doesNotMatch(
    teamEditor,
    /router\.replace\("\/cms\/team"\);\s*router\.refresh\(\)/,
  );
  assert.match(teamEditor, /deletionImpact\.bookingCount/);
  assert.match(teamEditor, /therapist-deletion-impact/);
  assert.match(teamEditPage, /getCmsTeamDeletionImpact/);
  assert.match(teamEditPage, /deletionImpact=\{deletionImpact\}/);
  assert.match(collectionRoute, /requireCmsApiUser\("content:write"\)/);
  assert.match(itemRoute, /requireCmsApiUser\("content:write"\)/);
  assert.match(collectionRoute, /isSameOriginMutation/);
  assert.match(itemRoute, /isSameOriginMutation/);
  assert.match(itemRoute, /export async function DELETE/);
  assert.match(itemRoute, /deleteCmsTeamMember/);
  assert.match(contentService, /export async function deleteCmsTeamMember/);
  assert.match(contentService, /export async function getCmsTeamDeletionImpact/);
  assert.match(contentService, /deletedTeam:\s*true/);
  assert.match(contentService, /action:\s*"team\.deleted"/);
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
  assert.doesNotMatch(bellMapper, /lastError|attemptCount|channel|\.customer/);
  assert.match(bellMapper, /currentStatus: currentStatuses\.get/);
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
  const voucherSection = home.slice(
    home.indexOf('id="voucher-section-title"'),
    home.indexOf('id="service-areas-title"'),
  );
  assert.match(voucherSection, /Give the gift of calm/);
  assert.match(voucherSection, /Popular gift occasions/);
  assert.match(voucherSection, /How it works/);
  assert.match(voucherSection, /Gift envelopes can be collected from Siriranee in Howth/);
  assert.doesNotMatch(voucherSection, /\b(?:Malahide|instant(?:ly)?)\b/i);
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
