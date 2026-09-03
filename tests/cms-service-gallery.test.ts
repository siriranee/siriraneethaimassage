import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  CmsServiceGalleryValidationError,
  MAX_SERVICE_GALLERY_IMAGES,
  normaliseStoredServiceGalleryImages,
  parseCmsServiceGalleryImages,
  parseServiceGalleryImageUrl,
  type CmsServiceGalleryImage,
} from "../src/domain/cms/service-gallery";
import { CMS_CONTENT_SCHEMA_VERSION } from "../src/domain/cms/types";

const validImage: CmsServiceGalleryImage = {
  id: "gallery-one",
  imageUrl: "/images/services/example/gallery-01.webp",
  altText: "A prepared massage treatment room",
  caption: "A calm setting prepared for treatment.",
};

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function expectGalleryError(action: () => unknown, pattern: RegExp) {
  assert.throws(
    action,
    (error) =>
      error instanceof CmsServiceGalleryValidationError &&
      pattern.test(error.message),
  );
}

test("service gallery accepts an ordered empty-to-ten image list", () => {
  assert.equal(parseCmsServiceGalleryImages([]).length, 0);

  const tenImages = Array.from(
    { length: MAX_SERVICE_GALLERY_IMAGES },
    (_, index) => ({
      ...validImage,
      id: `gallery-${index + 1}`,
      imageUrl: `/images/services/example/gallery-${index + 1}.webp`,
    }),
  );
  const parsed = parseCmsServiceGalleryImages(tenImages);

  assert.equal(parsed.length, MAX_SERVICE_GALLERY_IMAGES);
  assert.deepEqual(
    parsed.map((image) => image.id),
    tenImages.map((image) => image.id),
  );
  expectGalleryError(
    () =>
      parseCmsServiceGalleryImages([
        ...tenImages,
        {
          ...validImage,
          id: "gallery-eleven",
          imageUrl: "/images/services/example/gallery-11.webp",
        },
      ]),
    /up to 10 images/i,
  );
});

test("service gallery rejects duplicate IDs and image URLs", () => {
  expectGalleryError(
    () =>
      parseCmsServiceGalleryImages([
        validImage,
        {
          ...validImage,
          imageUrl: "/images/services/example/gallery-02.webp",
        },
      ]),
    /unique ID/i,
  );
  expectGalleryError(
    () =>
      parseCmsServiceGalleryImages([
        validImage,
        { ...validImage, id: "gallery-two" },
      ]),
    /unique image path or URL/i,
  );
});

test("service gallery validates accessible copy and strips legacy focal coordinates", () => {
  expectGalleryError(
    () => parseCmsServiceGalleryImages([{ ...validImage, altText: "Short" }]),
    /gallery fields/i,
  );
  expectGalleryError(
    () => parseCmsServiceGalleryImages([{ ...validImage, caption: "A" }]),
    /gallery fields/i,
  );

  const migrated = parseCmsServiceGalleryImages([
    { ...validImage, focalX: 0, focalY: 100 },
  ]);
  assert.deepEqual(migrated, [validImage]);
});

test("service gallery permits safe project paths and credential-free HTTPS URLs", () => {
  assert.equal(
    parseServiceGalleryImageUrl(
      "/images/services/example/gallery-01.webp",
      "imageUrl",
    ),
    "/images/services/example/gallery-01.webp",
  );
  assert.equal(
    parseServiceGalleryImageUrl(
      "https://media.example.com/siriranee/gallery-one.webp",
      "imageUrl",
    ),
    "https://media.example.com/siriranee/gallery-one.webp",
  );

  for (const unsafeUrl of [
    "/images/../private/secret.webp",
    "//media.example.com/gallery.webp",
    "http://media.example.com/gallery.webp",
    "https://user:password@media.example.com/gallery.webp",
    "https://media.example.com/gallery.webp#fragment",
    "data:image/png;base64,AAAA",
  ]) {
    expectGalleryError(
      () => parseServiceGalleryImageUrl(unsafeUrl, "imageUrl"),
      /gallery fields/i,
    );
  }
});

test("legacy gallery normalization is idempotent and preserves an intentional empty list", () => {
  assert.ok(CMS_CONTENT_SCHEMA_VERSION >= 6);

  const migrated = normaliseStoredServiceGalleryImages(undefined, [validImage]);
  const migratedAgain = normaliseStoredServiceGalleryImages(migrated, [
    { ...validImage, id: "different-default" },
  ]);

  assert.deepEqual(migratedAgain, migrated);
  assert.notEqual(migratedAgain, migrated);
  assert.deepEqual(normaliseStoredServiceGalleryImages([], [validImage]), []);
});

test("malformed stored galleries fall back to trusted defaults", () => {
  const fallback = [validImage];

  for (const malformed of [
    [null],
    [{ ...validImage, id: "" }],
    [{ ...validImage, imageUrl: "javascript:alert(1)" }],
    Array.from({ length: MAX_SERVICE_GALLERY_IMAGES + 1 }, (_, index) => ({
      ...validImage,
      id: `image-${index}`,
      imageUrl: `/images/services/test/gallery-${index}.webp`,
    })),
  ]) {
    const normalised = normaliseStoredServiceGalleryImages(malformed, fallback);
    assert.deepEqual(normalised, fallback);
    assert.notEqual(normalised, fallback);
  }
});

test("CMS gallery metadata stays inside service publication and editor boundaries", async () => {
  const [
    types,
    defaults,
    contentService,
    validation,
    adapter,
    serviceForm,
    galleryEditor,
    slider,
  ] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/content-validation.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/components/cms/ServiceEditorForm.tsx"),
    source("src/components/cms/ServiceGalleryEditor.tsx"),
    source("src/components/services/ServiceImageSlider.tsx"),
  ]);

  assert.match(types, /galleryImages: readonly CmsServiceGalleryImage\[\]/);
  assert.match(defaults, /services:\s*\[\]/);
  assert.doesNotMatch(defaults, /getServiceGalleryImages|galleryImages:/);
  assert.match(defaults, /schemaVersion: CMS_CONTENT_SCHEMA_VERSION/);
  assert.match(contentService, /normaliseStoredServiceGalleryImages/);
  assert.match(
    contentService,
    /normaliseStoredServiceGalleryImages\(\s*storedService\.galleryImages,\s*\[\],\s*\)/,
  );
  assert.match(contentService, /normalisePublishedCmsContent\(currentPublication\.snapshot\)/);
  assert.match(contentService, /replacePublishedService\(publicBase\.services, service\)/);
  assert.match(validation, /parseCmsServiceGalleryImages\(value\)/);
  assert.match(validation, /galleryImages: serviceGalleryImages/);
  assert.match(adapter, /gallery: record\.galleryImages/);
  assert.match(adapter, /isPublicProjectImage/);
  assert.match(serviceForm, /galleryImages,/);
  assert.match(serviceForm, /<ServiceGalleryEditor/);
  assert.match(galleryEditor, /MAX_SERVICE_GALLERY_IMAGES/);
  assert.match(galleryEditor, /preparedImages\?: Readonly/);
  assert.match(galleryEditor, /onPreparedImageChange\?\.\(imageId, null\)/);
  assert.match(galleryEditor, /onPreparationBusyChange\?: \(/);
  assert.match(galleryEditor, /onPreparationBusyChange\?\.\(image\.id, isBusy\)/);
  assert.match(galleryEditor, /<CmsImageUploadField/);
  assert.match(galleryEditor, /preparedImage=\{preparedImages\[image\.id\] \?\? null\}/);
  assert.match(
    galleryEditor,
    /required=\{!image\.imageUrl && !preparedImages\[image\.id\]\}/,
  );
  assert.match(galleryEditor, /stays local until the service form is saved/);
  assert.match(galleryEditor, /Move image \$\{index \+ 1\} up/);
  assert.match(galleryEditor, /Move image \$\{index \+ 1\} down/);
  assert.match(galleryEditor, /onDragStart/);
  assert.match(galleryEditor, /aria-labelledby=\{cardHeadingId\}/);
  assert.match(galleryEditor, /data-drag-handle/);
  assert.match(galleryEditor, /role="status"/);
  assert.match(galleryEditor, /removeButtonRefs\.current\[focusImage\.id\]\?\.focus\(\)/);
  assert.match(galleryEditor, /Removing a card only\s+detaches/);
  assert.doesNotMatch(galleryEditor, /method:\s*"DELETE"/);
  assert.doesNotMatch(galleryEditor, /focalX|focalY|Horizontal focus|Vertical focus/);
  assert.doesNotMatch(slider, /objectPosition:/);
});
