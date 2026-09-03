import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { defaultHomeHeroSlides } from "../src/content/home-hero";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("static home hero provides six complete, unique local slides", () => {
  assert.equal(defaultHomeHeroSlides.length, 6);
  assert.equal(
    new Set(defaultHomeHeroSlides.map((slide) => slide.id)).size,
    defaultHomeHeroSlides.length,
  );
  assert.equal(
    new Set(defaultHomeHeroSlides.map((slide) => slide.imageUrl)).size,
    defaultHomeHeroSlides.length,
  );
  for (const slide of defaultHomeHeroSlides) {
    assert.match(slide.imageUrl, /^\/images\/Hero\/Home\/[1-6]\.png$/);
    assert.ok(slide.altText.trim().length > 0);
    assert.ok(slide.title.trim().length > 0);
    assert.ok(slide.focalX >= 0 && slide.focalX <= 100);
    assert.ok(slide.focalY >= 0 && slide.focalY <= 100);
  }
});

test("home slides, page copy and the gallery are static project content", async () => {
  const [
    types,
    defaults,
    contentService,
    validation,
    adapter,
    pageCopy,
    pageHeroes,
    galleryContent,
    home,
    slider,
    servicesPage,
    bookPage,
    therapistsPage,
    galleryPage,
    sitemap,
  ] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/content-validation.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/content/page-copy.ts"),
    source("src/content/page-heroes.ts"),
    source("src/content/gallery.ts"),
    source("src/app/(site)/page.tsx"),
    source("src/components/marketing/HomeHeroSlider.tsx"),
    source("src/app/(site)/services/page.tsx"),
    source("src/app/(site)/book/page.tsx"),
    source("src/app/(site)/therapists/page.tsx"),
    source("src/app/(site)/gallery/page.tsx"),
    source("src/app/sitemap.ts"),
  ]);

  assert.match(pageCopy, /heroSlides:\s*defaultHomeHeroSlides/);
  assert.match(pageCopy, /export function getPageCopy/);
  assert.match(pageHeroes, /export const pageHeroImages/);
  assert.match(galleryContent, /export const galleryImages/);
  assert.doesNotMatch(types, /CmsPageRecord|readonly pages\??:|CmsGalleryRecord|readonly gallery:/);
  assert.doesNotMatch(defaults, /defaultHomeHeroSlides|\bpages:|\bgallery:/);
  assert.doesNotMatch(contentService, /normaliseStoredPageHeroSlides|updateCmsPage|case "pages"/);
  assert.doesNotMatch(validation, /parseCmsPageHeroSlides|parsePageUpdate/);
  assert.doesNotMatch(adapter, /publishedSlides|getPublicPageCopy/);
  assert.match(home, /slides=\{pageCopy\.heroSlides\}/);
  assert.match(slider, /resolvedSlides\.map/);
  assert.match(slider, /objectPosition:/);
  assert.match(galleryPage, /galleryImages\.map/);
  assert.match(galleryPage, /getPageCopy\("gallery"\)/);

  for (const [pageId, pageSource] of [
    ["services", servicesPage],
    ["book", bookPage],
    ["therapists", therapistsPage],
  ] as const) {
    assert.match(pageSource, new RegExp(`getPageCopy\\("${pageId}"\\)`));
    assert.match(pageSource, /pageCopy\.eyebrow/);
    assert.match(pageSource, /title: page\.seoTitle/);
    assert.match(pageSource, /description: page\.seoDescription/);
  }

  for (const retiredPath of [
    "src/components/cms/HomeHeroSlidesEditor.tsx",
    "src/components/cms/PageEditorForm.tsx",
    "src/components/cms/GalleryEditorForm.tsx",
    "src/app/cms/(protected)/pages/page.tsx",
    "src/app/cms/(protected)/media/page.tsx",
  ]) {
    await assert.rejects(source(retiredPath), { code: "ENOENT" });
  }
  assert.doesNotMatch(sitemap, /path:\s*"\/therapists"/);
});
