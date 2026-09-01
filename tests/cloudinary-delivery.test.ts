import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  isApprovedImageUrlForOwnership,
  isApprovedPublicImageUrl,
  isConfiguredCloudinaryImageUrl,
  isProjectImagePath,
} from "@/lib/media/cloudinary-delivery";
import { absoluteMediaUrl } from "@/lib/metadata";

function restoreCloudName(value: string | undefined) {
  if (value === undefined) {
    delete process.env.CLOUDINARY_CLOUD_NAME;
  } else {
    process.env.CLOUDINARY_CLOUD_NAME = value;
  }
}

function restoreFolder(value: string | undefined) {
  if (value === undefined) {
    delete process.env.CLOUDINARY_FOLDER;
  } else {
    process.env.CLOUDINARY_FOLDER = value;
  }
}

test("project media paths reject traversal and URL modifiers", () => {
  assert.equal(isProjectImagePath("/images/spa/treatment.webp"), true);
  assert.equal(isProjectImagePath("/images/../private.webp"), false);
  assert.equal(isProjectImagePath("/images/%2e%2e/private.webp"), false);
  assert.equal(isProjectImagePath("/images/spa/image.webp?download=1"), false);
  assert.equal(isProjectImagePath("/images/spa/vector.svg"), false);
  assert.equal(isProjectImagePath("/images/spa/no-extension"), false);
  assert.equal(isProjectImagePath("//images.example.com/image.webp"), false);
});

test("only HTTPS delivery URLs from the configured Cloudinary account are approved", () => {
  const original = process.env.CLOUDINARY_CLOUD_NAME;
  const originalFolder = process.env.CLOUDINARY_FOLDER;
  process.env.CLOUDINARY_CLOUD_NAME = "siriranee-demo";
  process.env.CLOUDINARY_FOLDER = "siriranee/cms";

  try {
    const approved =
      "https://res.cloudinary.com/siriranee-demo/image/upload/v1/siriranee/cms/assets/user/submission/image.webp";
    assert.equal(isConfiguredCloudinaryImageUrl(approved), true);
    assert.equal(
      isApprovedImageUrlForOwnership(approved, {
        cloudName: "siriranee-demo",
        folder: "siriranee/cms",
      }),
      true,
    );
    assert.equal(isApprovedPublicImageUrl(approved), true);
    assert.equal(absoluteMediaUrl(approved), approved);
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://res.cloudinary.com/another-account/image/upload/v1/image.webp",
      ),
      false,
    );
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "http://res.cloudinary.com/siriranee-demo/image/upload/v1/image.webp",
      ),
      false,
    );
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://example.com/siriranee-demo/image/upload/v1/image.webp",
      ),
      false,
    );
    assert.equal(
      isConfiguredCloudinaryImageUrl(`${approved}?attachment=true`),
      false,
    );
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://res.cloudinary.com/siriranee-demo/image/upload/f_auto/v1/siriranee/cms/assets/user/submission/image.webp",
      ),
      false,
    );
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://res.cloudinary.com/siriranee-demo/image/upload/v1/unsafe.svg",
      ),
      false,
    );
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://res.cloudinary.com/siriranee-demo/image/upload/v1/another-folder/image.webp",
      ),
      false,
    );
  } finally {
    restoreCloudName(original);
    restoreFolder(originalFolder);
  }
});

test("an invalid or missing Cloudinary account fails closed", () => {
  const original = process.env.CLOUDINARY_CLOUD_NAME;
  const originalFolder = process.env.CLOUDINARY_FOLDER;

  try {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_FOLDER = "siriranee/cms";
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://res.cloudinary.com/demo/image/upload/v1/image.webp",
      ),
      false,
    );
    process.env.CLOUDINARY_CLOUD_NAME = "not/a/cloud";
    assert.equal(
      isConfiguredCloudinaryImageUrl(
        "https://res.cloudinary.com/not-a-cloud/image/upload/v1/image.webp",
      ),
      false,
    );
  } finally {
    restoreCloudName(original);
    restoreFolder(originalFolder);
  }
});

test("Next image configuration is restricted to the configured Cloudinary delivery path", async () => {
  const config = await readFile(resolve(process.cwd(), "next.config.ts"), "utf8");

  assert.match(config, /hostname: "res\.cloudinary\.com"/);
  assert.match(
    config,
    /pathname: `\/\$\{cloudinaryCloudName\}\/image\/upload\/v\*\/\$\{cloudinaryFolder\}\/assets\/\*\*`/,
  );
  assert.match(config, /search: ""/);
});
