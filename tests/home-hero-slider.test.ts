import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

const heroAssets = [
  "public/images/Hero/Home/1.png",
  "public/images/Hero/Home/2.png",
  "public/images/Hero/Home/3.png",
  "public/images/Hero/Home/4.png",
  "public/images/Hero/Home/5.png",
  "public/images/Hero/Home/6.png",
] as const;

test("homepage hero uses all six supplied hero images and the official logo crop", async () => {
  for (const path of heroAssets) {
    const [metadata, file] = await Promise.all([
      stat(resolve(process.cwd(), path)),
      readFile(resolve(process.cwd(), path)),
    ]);
    assert.ok(metadata.size > 100_000, `${path} should be a production-quality image`);
    assert.equal(file.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }

  const originalLogoPath = resolve(
    process.cwd(),
    "public/brand/siriranee-logo-gold-exact.svg",
  );
  const optimizedLogoPath = resolve(
    process.cwd(),
    "public/brand/siriranee-logo-gold-exact.webp",
  );
  const [originalLogo, optimizedLogo, optimizedFile, originalSource] =
    await Promise.all([
      stat(originalLogoPath),
      stat(optimizedLogoPath),
      readFile(optimizedLogoPath),
      readFile(originalLogoPath, "utf8"),
    ]);

  assert.ok(originalLogo.size > 1_000_000);
  assert.ok(optimizedLogo.size < originalLogo.size);
  assert.equal(optimizedFile.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(optimizedFile.subarray(8, 12).toString("ascii"), "WEBP");

  const embeddedPng = originalSource.match(/base64,([^"]+)/)?.[1];
  assert.ok(embeddedPng, "The retained SVG source should contain its original PNG");

  const [originalPixels, optimizedPixels] = await Promise.all([
    sharp(Buffer.from(embeddedPng, "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(optimizedLogoPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  assert.deepEqual(optimizedPixels.info, originalPixels.info);
  let alphaDifferences = 0;
  let visibleColourDifferences = 0;
  for (let offset = 0; offset < originalPixels.data.length; offset += 4) {
    const originalAlpha = originalPixels.data[offset + 3];
    const optimizedAlpha = optimizedPixels.data[offset + 3];
    if (originalAlpha !== optimizedAlpha) alphaDifferences += 1;
    if (
      originalAlpha > 0 &&
      (originalPixels.data[offset] !== optimizedPixels.data[offset] ||
        originalPixels.data[offset + 1] !== optimizedPixels.data[offset + 1] ||
        originalPixels.data[offset + 2] !== optimizedPixels.data[offset + 2])
    ) {
      visibleColourDifferences += 1;
    }
  }
  assert.equal(alphaDifferences, 0);
  assert.equal(visibleColourDifferences, 0);
});

test("homepage hero follows the autoplay and accessibility contract", async () => {
  const [component, styles, home, slideContent] = await Promise.all([
    source("src/components/marketing/HomeHeroSlider.tsx"),
    source("src/components/marketing/HomeHeroSlider.module.css"),
    source("src/app/(site)/page.tsx"),
    source("src/content/home-hero.ts"),
  ]);

  assert.equal(
    (slideContent.match(/imageUrl: "\/images\/Hero\/Home\//g) ?? []).length,
    6,
  );
  assert.equal((slideContent.match(/focalX: 50/g) ?? []).length, 6);
  assert.equal((slideContent.match(/focalY: 50/g) ?? []).length, 6);
  assert.match(component, /AUTOPLAY_DELAY_MS = 3_000/);
  assert.match(component, /window\.setInterval/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /visibilitychange/);
  assert.match(
    component,
    /aria-roledescription=\{hasMultipleSlides \? "carousel" : undefined\}/,
  );
  assert.match(component, /className=\{styles\.heroLogo\}/);
  assert.match(component, /siriranee-logo-gold-exact\.webp/);
  assert.doesNotMatch(component, /\bunoptimized\b/);
  assert.doesNotMatch(component, /Pause slideshow/);
  assert.doesNotMatch(component, /Play slideshow/);
  assert.doesNotMatch(component, /Hero slideshow controls/);
  assert.doesNotMatch(component, /Show previous slide/);
  assert.doesNotMatch(component, /Show next slide/);
  assert.match(component, /aria-live="polite"/);

  assert.match(styles, /aspect-ratio:\s*3\s*\/\s*1/);
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?aspect-ratio:\s*3\s*\/\s*4/,
  );
  assert.match(styles, /object-fit:\s*cover/);
  assert.match(component, /objectPosition:/);
  assert.match(component, /400vw/);
  assert.doesNotMatch(styles, /^\s*max-width\s*:/m);

  assert.match(home, /import \{ HomeHeroSlider \}/);
  assert.match(home, /description=\{pageCopy\.description\}/);
  assert.match(home, /eyebrow=\{pageCopy\.eyebrow\}/);
  assert.match(home, /title=\{pageCopy\.title\}/);
  assert.match(home, /slides=\{pageCopy\.heroSlides\}/);
  assert.match(component, /resolvedSlides\.map/);
  assert.match(component, /objectPosition:/);
  assert.match(component, /styles\.eyebrow/);
  assert.match(styles, /\.eyebrow/);
  assert.match(styles, /opacity:\s*0\.5/);
});

test("brand mark uses the exact full transparent gold logo without a background", async () => {
  const brand = await source("src/components/ui/BrandMark.tsx");
  const brandStyles = await source("src/components/ui/BrandMark.module.css");
  assert.match(brand, /siriranee-logo-gold-exact\.webp/);
  assert.doesNotMatch(brand, /\bunoptimized\b/);
  assert.doesNotMatch(brand, /<svg/);
  assert.match(brand, /Siriranee Thai Massage/);
  assert.doesNotMatch(brandStyles, /background:/);
  assert.doesNotMatch(brandStyles, /box-shadow:/);
});
