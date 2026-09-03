import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  CMS_CONTENT_SCHEMA_VERSION,
  type CmsContentState,
} from "../src/domain/cms/types";
import {
  CmsServiceHeroValidationError,
  normaliseStoredServiceHero,
  parseCmsServiceHero,
  type CmsServiceHero,
} from "../src/domain/cms/service-hero";
import { collectCmsScopedMediaReferences } from "../src/server/media/references";

const validHero: CmsServiceHero = {
  imageUrl: "/images/Hero/Services/sample-hero.webp",
  altText: "A peaceful Thai massage treatment room in Dublin",
};

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function sourceSection(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Expected source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Expected source marker: ${end}`);
  return value.slice(startIndex, endIndex);
}

function expectHeroError(action: () => unknown, field: string) {
  assert.throws(
    action,
    (error) =>
      error instanceof CmsServiceHeroValidationError &&
      Object.hasOwn(error.fields, field),
  );
}

test("service hero parser accepts safe images and trims accessible copy", () => {
  assert.deepEqual(
    parseCmsServiceHero({
      ...validHero,
      altText: `  ${validHero.altText}  `,
    }),
    validHero,
  );

  assert.equal(
    parseCmsServiceHero({
      ...validHero,
      imageUrl: "https://media.example.com/siriranee/treatment.webp",
    }).imageUrl,
    "https://media.example.com/siriranee/treatment.webp",
  );
  assert.equal(
    parseCmsServiceHero({
      ...validHero,
      imageUrl: "/images/Hero/Services/example-service-hero.png",
    }).imageUrl,
    "/images/Hero/Services/example-service-hero.png",
  );
});

test("service hero parser rejects unsafe URLs and weak alt text", () => {
  for (const imageUrl of [
    "/images/../private/secret.webp",
    "//media.example.com/treatment.webp",
    "http://media.example.com/treatment.webp",
    "https://user:password@media.example.com/treatment.webp",
    "https://media.example.com/treatment.webp#fragment",
    "data:image/png;base64,AAAA",
  ]) {
    expectHeroError(
      () => parseCmsServiceHero({ ...validHero, imageUrl }),
      "hero.imageUrl",
    );
  }

  expectHeroError(
    () => parseCmsServiceHero({ ...validHero, altText: "Too few" }),
    "hero.altText",
  );

  const migrated = parseCmsServiceHero({
    ...validHero,
    focalX: 0,
    focalY: 100,
    mobileFocalX: 25,
    mobileFocalY: 75,
  });
  assert.deepEqual(migrated, validHero);
});

test("stored service hero normalization preserves valid data and safely clones fallbacks", () => {
  const stored = normaliseStoredServiceHero(validHero, {
    ...validHero,
    imageUrl: "/images/Hero/Services/fallback.webp",
  });
  assert.deepEqual(stored, validHero);
  assert.notEqual(stored, validHero);

  const fallback = {
    ...validHero,
    altText: "A fallback massage treatment room prepared for a guest",
  };
  const migrated = normaliseStoredServiceHero(
    { ...validHero, imageUrl: "javascript:alert(1)" },
    fallback,
  );
  assert.deepEqual(migrated, fallback);
  assert.notEqual(migrated, fallback);
  assert.deepEqual(normaliseStoredServiceHero(migrated, validHero), migrated);
});

test("schema v6 removes retired fields and normalises legacy heroes from their own cover", async () => {
  const [types, defaults, contentService] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-service.ts"),
  ]);

  assert.equal(CMS_CONTENT_SCHEMA_VERSION, 6);
  assert.match(types, /schemaVersion:\s*1\s*\|\s*2\s*\|\s*3\s*\|\s*4\s*\|\s*5\s*\|\s*6/);
  assert.match(types, /hero:\s*CmsServiceHero/);
  assert.match(types, /priceNote:\s*string/);
  assert.doesNotMatch(types, /readonly category:\s*string/);
  assert.doesNotMatch(types, /readonly bookingNotice:\s*string/);
  assert.doesNotMatch(types, /CmsServiceStatus/);
  assert.match(defaults, /services:\s*\[\]/);
  assert.doesNotMatch(defaults, /getServicePageHero|mapService/);

  const migration = sourceSection(
    contentService,
    "function legacyServiceHero",
    "function assertServiceReadyForPublication",
  );
  assert.match(migration, /imageUrl:\s*service\.imageUrl/);
  assert.match(migration, /altText:\s*service\.imageAlt/);
  assert.doesNotMatch(migration, /knownService|getServicePageHero/);
  assert.doesNotMatch(migration, /focalX|focalY|mobileFocal/);
  assert.match(
    contentService,
    /storedSchemaVersion\s*<\s*5[\s\S]*?\?\s*fallbackHero\s*:\s*normaliseStoredServiceHero\(storedService\.hero, fallbackHero\)/,
  );
  assert.match(contentService, /schemaVersion:\s*CMS_CONTENT_SCHEMA_VERSION/);
  assert.match(contentService, /normalisePublishedCmsContent\(publication\.snapshot\)/);
  assert.doesNotMatch(contentService, /defaultServicesBySlug|getServicePageHero/);
});

test("service validation rejects list overflow and URL collisions without retired fields", async () => {
  const [validation, nextConfig] = await Promise.all([
    source("src/server/cms/content-validation.ts"),
    source("next.config.ts"),
  ]);
  const listValidation = sourceSection(
    validation,
    "function stringList",
    "function prices",
  );
  const priceValidation = sourceSection(
    validation,
    "function prices",
    "function serviceHero",
  );

  const serviceUpdate = sourceSection(
    validation,
    "export function parseServiceUpdate",
    "export function parseServiceCreate",
  );
  assert.doesNotMatch(serviceUpdate, /category|bookingNotice|sortOrder|status/);
  assert.match(listValidation, /items\.length\s*>\s*maximumItems/);
  assert.match(listValidation, /result\.length\s*>\s*maximumLength/);
  assert.doesNotMatch(listValidation, /\.slice\(/);
  assert.match(priceValidation, /option\.durationMinutes/);
  assert.match(priceValidation, /option\.id\.toLocaleLowerCase\("en-IE"\)/);
  assert.match(priceValidation, /duration option ID must be unique/i);

  for (const slug of [
    "back-neck-shoulder-massage",
    "full-body-massage",
    "couples-massage",
    "head-massage",
    "foot-massage-reflexology",
    "cupping-therapy",
    "sports-massage",
  ]) {
    assert.match(validation, new RegExp(`"${slug}"`));
    assert.match(nextConfig, new RegExp(`/services/${slug}`));
  }
  assert.match(validation, /reservedLegacyServiceSlugs\.has\(result\)/);
  assert.match(validation, /parseServiceCreate[\s\S]*slug:\s*safeSlug\(source\.slug\)/);
});

test("service hero media is tracked as a cover upload without duplicate references", () => {
  const content = {
    services: [
      {
        imageUrl: "/images/services/cover.webp",
        hero: { imageUrl: "/images/services/hero.webp" },
        galleryImages: [],
      },
      {
        imageUrl: "/images/services/shared.webp",
        hero: { imageUrl: "/images/services/shared.webp" },
        galleryImages: [],
      },
    ],
    gallery: [],
    pages: [],
  } as unknown as CmsContentState;

  assert.deepEqual(collectCmsScopedMediaReferences(content), [
    { scope: "service-cover", secureUrl: "/images/services/cover.webp" },
    { scope: "service-cover", secureUrl: "/images/services/hero.webp" },
    { scope: "service-cover", secureUrl: "/images/services/shared.webp" },
  ]);
});

test("public treatment pages use each CMS service's own hero and optional guidance", async () => {
  const [adapter, page] = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/app/(site)/services/[slug]/page.tsx"),
  ]);

  assert.doesNotMatch(adapter, /fallbackServices|fallbackBySlug/);
  assert.match(adapter, /if \(!isPublicProjectImage\(record\.imageUrl\)\) return null/);
  assert.match(adapter, /const imageSource = record\.imageUrl/);
  assert.match(adapter, /heroImageSource = isPublicProjectImage\(record\.hero\.imageUrl\)/);
  assert.match(adapter, /priceNote:\s*record\.priceNote\s*\|\|\s*undefined/);
  assert.match(page, /image=\{service\.hero\.imageUrl\}/);
  assert.match(page, /imageAlt=\{service\.hero\.altText\}/);
  assert.match(page, /service\.priceNote\s*\?/);
  assert.match(page, /service\.idealFor\.length\s*\?/);
  assert.match(page, /service\.idealFor\.map/);
  assert.doesNotMatch(page, /bookingNotice|focalX|focalY|mobileFocal/);
  assert.doesNotMatch(page, /getServicePageHero\(service\.slug\)/);
});

test("service editor stages a dedicated hero and preserves failed-save recovery", async () => {
  const editor = await source("src/components/cms/ServiceEditorForm.tsx");

  assert.doesNotMatch(editor, /FORM_MARKUP_/);
  assert.match(editor, /priceNote:\s*data\.get\("priceNote"\)/);
  assert.match(editor, /hero:\s*\{/);
  assert.match(editor, /scope:\s*"service-cover"/);
  assert.match(editor, /requestState = "ambiguous"/);
  assert.match(editor, /requestState = "definite-failure"/);
  assert.match(editor, /result\.mediaCommitState === "indeterminate"/);
  assert.match(editor, /requestState = "ambiguous";\s*throw new ServiceSaveError\(AMBIGUOUS_SAVE_MESSAGE/);
  assert.match(editor, /!isCmsServiceRecord\(result\.service\)/);
  assert.match(editor, /requestState === "ambiguous" \|\| requestState === "succeeded"/);
  assert.match(editor, /selectCmsMediaRollbackRetryAssets\(stagedAssets, serverRollback\)/);
  assert.match(editor, /item\.outcome === "protected"/);
  assert.match(editor, /already committed or referenced/);
  assert.match(editor, /rollbackStagedCmsMediaAssets\(\s*submissionId,\s*retryAssets/);
  assert.match(editor, /cleanupFailed = rollback\.failed > 0/);
  assert.match(editor, /cleanupPending \|\|= rollback\.pendingFinalSweep > 0/);
  assert.match(editor, /uploaded images were not deleted/i);
  assert.match(editor, /Reload the services list and verify this treatment/);
  assert.match(editor, /rollbackCompletedOnError: false/);
  assert.match(editor, /onStaged:/);
  assert.match(editor, /\b\w+\.status\s*===\s*409/);
  assert.match(editor, /fields\?:\s*unknown/);
  assert.match(editor, /safeFieldErrors\(result\.fields\)/);
  assert.match(editor, /fieldErrors/);
  assert.match(editor, /focus\(\)/);

  const priceSection = sourceSection(
    editor,
    "function changePriceRows",
    "async function save",
  );
  assert.match(priceSection, /markDirty\(\)/);
  assert.match(priceSection, /function addPrice/);
  assert.match(priceSection, /function removePrice/);
  assert.match(editor, /aria-label=/);
  assert.doesNotMatch(editor, /name="(?:category|sortOrder|bookingNotice|status|hero\.focal)/);
  assert.doesNotMatch(editor, /draft/i);
  assert.match(editor, /Saving and publishing treatment/);
  assert.match(editor, /Save and publish/);
});

test("content mutations publish only their saved section immediately", async () => {
  const contentService = await source("src/server/cms/content-service.ts");
  const immediatePublication = sourceSection(
    contentService,
    "function createImmediatePublicationSnapshot",
    "async function mutateContent",
  );
  const createAndUpdate = sourceSection(
    contentService,
    "export async function createCmsService",
    "export async function updateCmsSiteSettings",
  );

  assert.match(immediatePublication, /getPublishedContent\(\)/);
  assert.match(immediatePublication, /replacePublishedService\(publicBase\.services, service\)/);
  assert.match(immediatePublication, /case "site"/);
  assert.match(immediatePublication, /case "bookingSettings"/);
  assert.match(immediatePublication, /case "pages"/);
  assert.match(immediatePublication, /case "team"/);
  assert.match(immediatePublication, /case "gallery"/);
  assert.match(immediatePublication, /case "promotions"/);
  assert.match(immediatePublication, /case "vouchers"/);
  assert.match(immediatePublication, /createSafePublicContentState\(\)/);
  assert.match(immediatePublication, /assertCmsContentMediaReferencesApproved\(snapshot\)/);
  assert.match(immediatePublication, /savePublication/);
  assert.match(createAndUpdate, /Created and published a new treatment/);
  assert.match(createAndUpdate, /Updated and published treatment content and pricing/);
  assert.equal((createAndUpdate.match(/\{ section: "services", entityId: serviceId \}/g) ?? []).length, 2);
  assert.equal((contentService.match(/\{ section: "team", entityId: memberId \}/g) ?? []).length, 2);
  assert.equal((contentService.match(/\{ section: "gallery", entityId: itemId \}/g) ?? []).length, 2);
  assert.equal((contentService.match(/\{ section: "promotions", entityId: promotionId \}/g) ?? []).length, 2);
  assert.equal((contentService.match(/\{ section: "vouchers", entityId: voucherId \}/g) ?? []).length, 2);
  assert.doesNotMatch(contentService, /publishCmsContent|getCmsPublicationPreview/);
});

test("service management respects permissions and keeps the singular route protected", async () => {
  const [listing, alias] = await Promise.all([
    source("src/app/cms/(protected)/services/page.tsx"),
    source("src/app/cms/(protected)/service/page.tsx"),
  ]);

  assert.match(listing, /requireCmsPageUser\("content:view"\)/);
  assert.match(listing, /canCmsRole\(user\.role, "content:write"\)/);
  assert.match(listing, /\{canWrite \?/);
  assert.doesNotMatch(listing, /content:publish|Review &amp; publish|categoryLabels|Display order|sortOrder/);
  assert.match(listing, /Every successful save publishes that treatment immediately/);
  assert.match(listing, /minimumFractionDigits:\s*2/);
  assert.match(listing, /service\.galleryImages\.length/);
  assert.match(alias, /requireCmsPageUser\("content:view"\)/);
  assert.match(alias, /redirect\("\/cms\/services"\)/);
});
