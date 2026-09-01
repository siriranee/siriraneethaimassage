import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { CmsContentState } from "../src/domain/cms/types";
import {
  CMS_MEDIA_MAX_BYTES,
  CmsMediaValidationError,
  parseCmsMediaContentType,
  parseCmsMediaDeclaredBytes,
  parseCmsMediaScope,
  validateCmsMediaDimensions,
} from "../src/server/media/policy";
import {
  assertCmsContentImageReferencesApproved,
  collectNewCmsScopedMediaReferences,
  collectCmsScopedMediaReferences,
  isOwnedCloudinaryPublicId,
  isOwnedCmsCloudinaryImageUrl,
  parseCmsCloudinarySecureUrl,
} from "../src/server/media/references";
import {
  issueCmsMediaStagedToken,
  issueCmsMediaUploadToken,
  verifyCmsMediaStagedToken,
  verifyCmsMediaUploadToken,
} from "../src/server/media/tokens";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

const secret = "media-token-secret-that-is-at-least-thirty-two-bytes";
const baseClaims = {
  userId: "user-123",
  submissionId: "submission-123",
  scope: "service-gallery" as const,
  publicId:
    "siriranee/cms/assets/0123456789abcdef/submission-123/asset-123",
};

test("media policy only accepts compressed image types and bounded dimensions", () => {
  assert.equal(parseCmsMediaContentType("image/webp"), "image/webp");
  assert.equal(parseCmsMediaDeclaredBytes(CMS_MEDIA_MAX_BYTES), CMS_MEDIA_MAX_BYTES);
  assert.deepEqual(validateCmsMediaDimensions(4_000, 4_000), {
    width: 4_000,
    height: 4_000,
  });
  assert.equal(parseCmsMediaScope("home-hero"), "home-hero");

  assert.throws(
    () => parseCmsMediaContentType("image/svg+xml"),
    CmsMediaValidationError,
  );
  assert.throws(
    () => parseCmsMediaDeclaredBytes(CMS_MEDIA_MAX_BYTES + 1),
    CmsMediaValidationError,
  );
  assert.throws(
    () => validateCmsMediaDimensions(4_096, 4_096),
    CmsMediaValidationError,
  );
  assert.throws(() => parseCmsMediaScope("avatar"), CmsMediaValidationError);
});

test("upload tokens are short-lived and bound to user, submission, scope and public ID", () => {
  const issued = issueCmsMediaUploadToken(baseClaims, secret, 10_000);
  assert.deepEqual(
    verifyCmsMediaUploadToken(issued.token, baseClaims, secret, 10_100),
    issued.claims,
  );

  assert.throws(
    () =>
      verifyCmsMediaUploadToken(
        issued.token,
        { ...baseClaims, userId: "other-user" },
        secret,
        10_100,
      ),
    CmsMediaValidationError,
  );
  assert.throws(
    () => verifyCmsMediaUploadToken(issued.token, baseClaims, secret, 10_301),
    CmsMediaValidationError,
  );
  assert.throws(
    () =>
      verifyCmsMediaUploadToken(
        `${issued.token.slice(0, -1)}x`,
        baseClaims,
        secret,
        10_100,
      ),
    CmsMediaValidationError,
  );

});

test("staged tokens bind the exact URL and immutable provider identity", () => {
  const secureUrl =
    "https://res.cloudinary.com/siriranee/image/upload/v123/siriranee/cms/assets/0123456789abcdef/submission-123/asset-123.webp";
  const issued = issueCmsMediaStagedToken(
    {
      ...baseClaims,
      secureUrl,
      providerAssetId: "provider_asset_123",
      assetVersion: 123,
      format: "webp",
      bytes: 150_000,
      width: 1_600,
      height: 900,
    },
    secret,
    20_000,
  );
  assert.equal(
    verifyCmsMediaStagedToken(
      issued.token,
      { ...baseClaims, secureUrl },
      secret,
      20_100,
    ).providerAssetId,
    "provider_asset_123",
  );
  assert.throws(
    () =>
      verifyCmsMediaStagedToken(
        issued.token,
        { ...baseClaims, secureUrl: `${secureUrl}?changed=1` },
        secret,
        20_100,
      ),
    CmsMediaValidationError,
  );
});

test("only exact owned untransformed Cloudinary delivery URLs pass", () => {
  const ownership = { cloudName: "siriranee", folder: "siriranee/cms" };
  const secureUrl =
    "https://res.cloudinary.com/siriranee/image/upload/v123/siriranee/cms/assets/0123456789abcdef/submission-123/asset-123.webp";
  assert.equal(isOwnedCmsCloudinaryImageUrl(secureUrl, ownership), true);
  assert.equal(
    parseCmsCloudinarySecureUrl(secureUrl, {
      ...ownership,
      publicId: baseClaims.publicId,
      format: "webp",
      version: 123,
    }),
    secureUrl,
  );
  assert.equal(
    isOwnedCmsCloudinaryImageUrl(
      secureUrl.replace("/upload/v123/", "/upload/c_fill,w_300/v123/"),
      ownership,
    ),
    false,
  );
  assert.equal(
    isOwnedCmsCloudinaryImageUrl(
      secureUrl.replace("/siriranee/image/", "/another-cloud/image/"),
      ownership,
    ),
    false,
  );
  assert.equal(
    isOwnedCmsCloudinaryImageUrl(
      secureUrl.replace("res.cloudinary.com", "res.cloudinary.com:444"),
      ownership,
    ),
    false,
  );
  assert.equal(
    isOwnedCmsCloudinaryImageUrl(
      secureUrl.replace("/assets/", "/assets%2F"),
      ownership,
    ),
    false,
  );
  assert.equal(
    isOwnedCloudinaryPublicId("siriranee/cms/assets/../other", ownership.folder),
    false,
  );
});

test("the central CMS image boundary covers every editable image surface", () => {
  const ownership = { cloudName: "siriranee", folder: "siriranee/cms" };
  const ownedUrl =
    "https://res.cloudinary.com/siriranee/image/upload/v123/siriranee/cms/assets/0123456789abcdef/submission-123/asset-123.webp";
  type ImageLocations = {
    serviceCover: string;
    serviceGallery: string;
    siteGallery: string;
    homeHero: string;
  };
  const contentWith = (locations: ImageLocations) =>
    ({
      services: [
        {
          imageUrl: locations.serviceCover,
          galleryImages: [{ imageUrl: locations.serviceGallery }],
        },
      ],
      gallery: [{ imageUrl: locations.siteGallery }],
      pages: [{ heroSlides: [{ imageUrl: locations.homeHero }] }],
    }) as unknown as CmsContentState;
  const localLocations: ImageLocations = {
    serviceCover: "/images/services/cover.webp",
    serviceGallery: "/images/services/gallery.webp",
    siteGallery: "/images/gallery/room.webp",
    homeHero: "/images/home/hero.webp",
  };

  assert.deepEqual(
    collectCmsScopedMediaReferences(contentWith(localLocations)).map(
      (reference) => reference.scope,
    ),
    ["service-cover", "service-gallery", "site-gallery", "home-hero"],
  );
  assert.doesNotThrow(() =>
    assertCmsContentImageReferencesApproved(
      contentWith(localLocations),
      ownership,
    ),
  );
  assert.doesNotThrow(() =>
    assertCmsContentImageReferencesApproved(
      contentWith({
        serviceCover: ownedUrl,
        serviceGallery: ownedUrl,
        siteGallery: ownedUrl,
        homeHero: ownedUrl,
      }),
      ownership,
    ),
  );

  for (const location of Object.keys(localLocations) as Array<keyof ImageLocations>) {
    assert.throws(
      () =>
        assertCmsContentImageReferencesApproved(
          contentWith({
            ...localLocations,
            [location]: "https://images.example.test/unapproved.webp",
          }),
          ownership,
        ),
      CmsMediaValidationError,
      `${location} must reject arbitrary remote URLs`,
    );
  }
  assert.throws(
    () =>
      assertCmsContentImageReferencesApproved(
        contentWith({ ...localLocations, homeHero: "/images/../secret.webp" }),
        ownership,
      ),
    CmsMediaValidationError,
  );
  assert.throws(
    () =>
      assertCmsContentImageReferencesApproved(
        contentWith({ ...localLocations, serviceCover: ownedUrl }),
        null,
      ),
    CmsMediaValidationError,
  );

  const current = contentWith({
    ...localLocations,
    serviceCover: ownedUrl,
  });
  const reusedInNewScope = contentWith({
    ...localLocations,
    serviceCover: ownedUrl,
    homeHero: ownedUrl,
  });
  assert.deepEqual(
    collectNewCmsScopedMediaReferences(current, reusedInNewScope),
    [{ scope: "home-hero", secureUrl: ownedUrl }],
  );
  assert.deepEqual(collectNewCmsScopedMediaReferences(current, current), []);

  const legacySnapshot = {
    services: [{ imageUrl: ownedUrl }],
    gallery: [],
    pages: [],
  } as unknown as CmsContentState;
  assert.deepEqual(collectCmsScopedMediaReferences(legacySnapshot), [
    { scope: "service-cover", secureUrl: ownedUrl },
  ]);
});

test("Cloudinary routes and persistence enforce the authenticated staged workflow", async () => {
  const [rootRoute, completeRoute, cleanupRoute, service, repository, mongo, indexes] =
    await Promise.all([
      source("src/app/api/cms/media-upload/route.ts"),
      source("src/app/api/cms/media-upload/complete/route.ts"),
      source("src/app/api/cms/media-upload/cleanup/route.ts"),
      source("src/server/media/cloudinary-service.ts"),
      source("src/server/cms/repositories/repository.ts"),
      source("src/server/cms/repositories/mongo-repository.ts"),
      source("scripts/cms-indexes.mjs"),
    ]);

  for (const route of [rootRoute, completeRoute, cleanupRoute]) {
    assert.match(route, /requireCmsApiUser\("content:write"\)/);
    assert.match(route, /cmsNoStoreJson/);
  }
  for (const route of [rootRoute, completeRoute, cleanupRoute]) {
    if (route.includes("export async function POST") || route.includes("DELETE")) {
      assert.match(route, /isSameOriginMutation/);
    }
  }
  assert.match(service, /status: "authorized"/);
  assert.match(service, /providerSignatureExpiresAt/);
  assert.match(service, /verify_api_response_signature/);
  assert.match(service, /provider\.getResource/);
  assert.match(service, /providerAssetId/);
  assert.match(service, /status: "staged"/);
  assert.match(service, /status: "deleting"/);
  assert.match(service, /pendingFinalSweep/);
  assert.match(service, /record\.status === "committed"/);
  assert.match(repository, /isMediaAssetReferenced/);
  assert.match(mongo, /for await \(const row of cursor\)/);
  assert.match(indexes, /cms_media_provider_asset_id_unique/);
  assert.match(indexes, /cms_media_status_expiry/);
  assert.doesNotMatch(rootRoute + completeRoute, /CLOUDINARY_API_SECRET/);
});

test("content writes commit media in the same repository transaction", async () => {
  const [contentService, submission, routes] = await Promise.all([
    source("src/server/cms/content-service.ts"),
    source("src/server/media/submission.ts"),
    Promise.all([
      source("src/app/api/cms/services/route.ts"),
      source("src/app/api/cms/services/[serviceId]/route.ts"),
      source("src/app/api/cms/pages/[pageId]/route.ts"),
      source("src/app/api/cms/gallery/route.ts"),
      source("src/app/api/cms/gallery/[itemId]/route.ts"),
    ]),
  ]);

  assert.match(
    contentService,
    /repository\.transaction[\s\S]*commitCmsMediaForContentMutation\(transaction,[\s\S]*transaction\.saveContent/,
  );
  assert.match(submission, /record\.status !== "staged"/);
  assert.match(submission, /status: "committed"/);
  assert.match(submission, /assertCmsContentImageReferencesApproved/);
  assert.match(submission, /collectNewCmsScopedMediaReferences/);
  assert.match(submission, /claims\.providerAssetId !== record\.providerAssetId/);
  for (const route of routes) {
    assert.match(route, /removeCmsMediaSubmissionEnvelope/);
    assert.match(route, /mediaSubmission: submission/);
  }
});

test("CMS image forms defer uploads until valid final save and roll back failures", async () => {
  const [galleryForm, serviceForm, pageForm, serviceGallery, heroEditor, formStyles] =
    await Promise.all([
      source("src/components/cms/GalleryEditorForm.tsx"),
      source("src/components/cms/ServiceEditorForm.tsx"),
      source("src/components/cms/PageEditorForm.tsx"),
      source("src/components/cms/ServiceGalleryEditor.tsx"),
      source("src/components/cms/HomeHeroSlidesEditor.tsx"),
      source("src/components/cms/CmsEditorForm.module.css"),
    ]);

  for (const form of [galleryForm, serviceForm, pageForm]) {
    const validationIndex = form.indexOf("form.reportValidity()");
    const uploadIndex = form.indexOf("uploadCmsMediaSequentially({", validationIndex);

    assert.ok(validationIndex >= 0, "form must run native validation");
    assert.ok(uploadIndex > validationIndex, "validation must run before upload");
    assert.match(form, /createCmsMediaSubmissionId\(\)/);
    assert.match(form, /createCmsMediaSubmissionEnvelope\(/);
    assert.match(form, /mediaSubmission:/);
    assert.match(form, /rollbackStagedCmsMediaAssets\(submissionId, stagedAssets\)/);
    assert.match(form, /saveLockRef\.current/);
    assert.match(form, /<fieldset className=\{styles\.formFields\} disabled=\{locked\}>/);
    assert.match(form, /cache: "no-store"/);
  }

  assert.match(galleryForm, /scope: "site-gallery"/);
  assert.match(galleryForm, /required=\{!preparedImage\}/);
  assert.match(galleryForm, /setPreparedImage\(null\)/);

  assert.match(serviceForm, /scope: "service-cover"/);
  assert.match(serviceForm, /scope: "service-gallery"/);
  assert.match(serviceForm, /for \(const image of galleryImages\)/);
  assert.match(serviceForm, /required=\{!preparedCover\}/);
  assert.match(serviceForm, /preparedImages=\{preparedGalleryImages\}/);
  assert.match(serviceForm, /setPreparedCover\(null\)/);
  assert.match(serviceForm, /setPreparedGalleryImages\(\{\}\)/);
  assert.match(serviceGallery, /required=\{!preparedImages\[image\.id\]\}/);

  assert.match(pageForm, /scope: "home-hero"/);
  assert.match(pageForm, /for \(const slide of heroSlides\)/);
  assert.match(pageForm, /preparedImages=\{preparedHeroImages\}/);
  assert.match(pageForm, /setPreparedHeroImages\(\{\}\)/);
  assert.match(heroEditor, /required=\{!preparedImages\[slide\.id\]\}/);

  assert.match(formStyles, /\.formFields\s*\{/);
  assert.match(formStyles, /\.formBusy \.formFields\s*\{/);
  assert.match(formStyles, /\.progressStatus\s*\{/);
});
