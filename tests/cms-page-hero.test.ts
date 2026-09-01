import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  defaultHomeHeroSlides,
  migrateLegacyHomeHeroSlides,
} from "../src/content/home-hero";

import {
  CmsPageHeroValidationError,
  MAX_HOME_HERO_SLIDES,
  normaliseStoredPageHeroSlides,
  parseCmsPageHeroSlides,
  parsePageHeroImageUrl,
  type CmsPageHeroSlide,
} from "../src/domain/cms/page-hero";

const validSlide: CmsPageHeroSlide = {
  id: "home-slide-one",
  imageUrl: "/images/hero/slide-one.webp",
  altText: "A calm Thai massage treatment room",
  title: "Calm treatment room",
  focalX: 50,
  focalY: 50,
};

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function expectHeroError(action: () => unknown, pattern: RegExp) {
  assert.throws(
    action,
    (error) =>
      error instanceof CmsPageHeroValidationError && pattern.test(error.message),
  );
}

test("home hero validates one-to-eight ordered slides", () => {
  const eightSlides = Array.from(
    { length: MAX_HOME_HERO_SLIDES },
    (_, index) => ({
      ...validSlide,
      id: `home-slide-${index + 1}`,
      imageUrl: `/images/hero/slide-${index + 1}.webp`,
      focalX: index * 10,
      focalY: 100 - index * 10,
    }),
  );

  assert.equal(parseCmsPageHeroSlides(eightSlides).length, 8);
  expectHeroError(() => parseCmsPageHeroSlides([]), /between one and 8/i);
  expectHeroError(
    () =>
      parseCmsPageHeroSlides([
        ...eightSlides,
        {
          ...validSlide,
          id: "home-slide-nine",
          imageUrl: "/images/hero/slide-nine.webp",
        },
      ]),
    /between one and 8/i,
  );
});

test("home hero rejects duplicate IDs, image URLs, and invalid focal values", () => {
  expectHeroError(
    () =>
      parseCmsPageHeroSlides([
        validSlide,
        { ...validSlide, imageUrl: "/images/hero/slide-two.webp" },
      ]),
    /unique ID/i,
  );
  expectHeroError(
    () =>
      parseCmsPageHeroSlides([
        validSlide,
        { ...validSlide, id: "home-slide-two" },
      ]),
    /unique image path or URL/i,
  );
  expectHeroError(
    () => parseCmsPageHeroSlides([{ ...validSlide, focalY: 101 }]),
    /slide fields/i,
  );
});

test("home hero accepts safe local paths and credential-free HTTPS URLs", () => {
  assert.equal(
    parsePageHeroImageUrl("/images/hero/slide-one.webp", "imageUrl"),
    "/images/hero/slide-one.webp",
  );
  assert.equal(
    parsePageHeroImageUrl(
      "https://media.example.com/siriranee/slide-one.webp",
      "imageUrl",
    ),
    "https://media.example.com/siriranee/slide-one.webp",
  );

  for (const unsafeUrl of [
    "/images/../private/secret.webp",
    "//media.example.com/slide.webp",
    "http://media.example.com/slide.webp",
    "https://user:password@media.example.com/slide.webp",
    "https://media.example.com/slide.webp#fragment",
    "data:image/png;base64,AAAA",
  ]) {
    expectHeroError(
      () => parsePageHeroImageUrl(unsafeUrl, "imageUrl"),
      /slide fields/i,
    );
  }
});

test("legacy home pages receive cloned defaults without overwriting valid slides", () => {
  const migrated = normaliseStoredPageHeroSlides(undefined, [validSlide]);
  const stored = normaliseStoredPageHeroSlides(migrated, [
    { ...validSlide, id: "different-default" },
  ]);

  assert.deepEqual(stored, migrated);
  assert.notEqual(stored, migrated);
  assert.notEqual(stored[0], migrated[0]);
  assert.deepEqual(
    normaliseStoredPageHeroSlides([{ ...validSlide, focalX: 101 }], [validSlide]),
    [validSlide],
  );
});

test("the previous mock home slides migrate to the six supplied images", () => {
  const migrated = migrateLegacyHomeHeroSlides([
    {
      ...validSlide,
      id: "traditional-thai-massage",
      imageUrl: "/images/hero/slide-traditional-thai.webp",
    },
    {
      ...validSlide,
      id: "warm-oil-ritual",
      imageUrl: "/images/hero/slide-hot-oil.webp",
    },
    {
      ...validSlide,
      id: "hot-stone-relaxation",
      imageUrl: "/images/hero/slide-hot-stone.webp",
    },
  ]);

  assert.deepEqual(migrated, defaultHomeHeroSlides);
  assert.equal(migrated.length, 6);
  assert.ok(
    migrated.every((slide) => slide.imageUrl.startsWith("/images/Hero/Home/")),
  );

  const custom = [{ ...validSlide, imageUrl: "/images/custom/hero.webp" }];
  assert.equal(migrateLegacyHomeHeroSlides(custom), custom);
});

test("the earlier four-image home set migrates to all six current images", () => {
  const migrated = migrateLegacyHomeHeroSlides(
    [1, 2, 3, 4].map((number) => ({
      ...validSlide,
      id: `previous-home-${number}`,
      imageUrl: `/images/Hero/Home/${number}.png`,
    })),
  );

  assert.deepEqual(migrated, defaultHomeHeroSlides);
  assert.equal(migrated.length, 6);
});

test("CMS home slides and inner-page hero copy stay inside publication boundaries", async () => {
  const [
    types,
    defaults,
    contentService,
    validation,
    adapter,
    editor,
    home,
    slider,
    servicesPage,
    bookPage,
    therapistsPage,
    sitemap,
  ] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/content-validation.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/components/cms/HomeHeroSlidesEditor.tsx"),
    source("src/app/(site)/page.tsx"),
    source("src/components/marketing/HomeHeroSlider.tsx"),
    source("src/app/(site)/services/page.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/app/(site)/therapists/page.tsx"),
    source("src/app/sitemap.ts"),
  ]);

  assert.match(types, /heroSlides\?: readonly CmsPageHeroSlide\[\]/);
  assert.match(types, /"services"/);
  assert.match(types, /"book"/);
  assert.match(types, /"therapists"/);
  assert.match(defaults, /heroSlides: defaultHomeHeroSlides/);
  assert.match(contentService, /normaliseStoredPageHeroSlides/);
  assert.match(contentService, /parseCmsPageHeroSlides\(homePage\?\.heroSlides\)/);
  assert.match(validation, /current\.id === "home"/);
  assert.match(adapter, /publishedSlides/);
  assert.match(adapter, /isPublicProjectImage\(slide\.imageUrl\)/);
  assert.match(editor, /MAX_HOME_HERO_SLIDES/);
  assert.match(editor, /preparedImages\?: Readonly/);
  assert.match(editor, /onPreparedImageChange\?\.\(slideId, null\)/);
  assert.match(editor, /onPreparationBusyChange\?: \(/);
  assert.match(editor, /onPreparationBusyChange\?\.\(slide\.id, isBusy\)/);
  assert.match(editor, /<CmsImageUploadField/);
  assert.match(editor, /preparedImage=\{preparedImages\[slide\.id\] \?\? null\}/);
  assert.match(editor, /required=\{!preparedImages\[slide\.id\]\}/);
  assert.match(editor, /stays local until the page form is saved/);
  assert.match(editor, /Move slide \$\{index \+ 1\} up/);
  assert.match(editor, /onDragStart/);
  assert.match(editor, /aria-labelledby=\{cardHeadingId\}/);
  assert.match(editor, /data-drag-handle/);
  assert.match(editor, /role="status"/);
  assert.match(editor, /removeButtonRefs\.current\[focusSlide\.id\]\?\.focus\(\)/);
  assert.doesNotMatch(editor, /method:\s*"DELETE"/);
  assert.match(home, /slides=\{pageCopy\.heroSlides\}/);
  assert.match(slider, /resolvedSlides\.map/);
  assert.match(slider, /objectPosition:/);

  for (const [pageId, pageSource] of [
    ["services", servicesPage],
    ["book", bookPage],
    ["therapists", therapistsPage],
  ] as const) {
    assert.match(pageSource, new RegExp(`getPublicPageCopy\\("${pageId}"\\)`));
    assert.match(pageSource, /pageCopy\.eyebrow/);
    assert.match(pageSource, /title: page\.seoTitle/);
    assert.match(pageSource, /description: page\.seoDescription/);
  }
  assert.doesNotMatch(sitemap, /path:\s*"\/therapists"/);
});
