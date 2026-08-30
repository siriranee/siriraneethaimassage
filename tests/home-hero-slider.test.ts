import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

const heroAssets = [
  "public/images/hero/slide-traditional-thai.webp",
  "public/images/hero/slide-hot-oil.webp",
  "public/images/hero/slide-hot-stone.webp",
] as const;

test("homepage hero has three optimized mock images and the official logo crops", async () => {
  for (const path of heroAssets) {
    const [metadata, file] = await Promise.all([
      stat(resolve(process.cwd(), path)),
      readFile(resolve(process.cwd(), path)),
    ]);
    assert.ok(metadata.size > 100_000, `${path} should be a production-quality image`);
    assert.equal(file.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(file.subarray(8, 12).toString("ascii"), "WEBP");
  }

  const exactLogo = await stat(
    resolve(process.cwd(), "public/brand/siriranee-logo-gold-exact.svg"),
  );
  assert.ok(exactLogo.size > 1_000_000);
});

test("homepage hero follows the autoplay and accessibility contract", async () => {
  const [component, styles, home] = await Promise.all([
    source("src/components/marketing/HomeHeroSlider.tsx"),
    source("src/components/marketing/HomeHeroSlider.module.css"),
    source("src/app/(site)/page.tsx"),
  ]);

  assert.equal((component.match(/src: "\/images\/hero\//g) ?? []).length, 3);
  assert.match(component, /AUTOPLAY_DELAY_MS = 3_000/);
  assert.match(component, /window\.setInterval/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /aria-roledescription="carousel"/);
  assert.match(component, /className=\{styles\.heroLogo\}/);
  assert.match(component, /siriranee-logo-gold-exact\.svg/);
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
  assert.match(styles, /object-position:\s*center/);
  assert.doesNotMatch(styles, /^\s*max-width\s*:/m);

  assert.match(home, /import \{ HomeHeroSlider \}/);
  assert.match(home, /description=\{pageCopy\.description\}/);
  assert.match(home, /eyebrow=\{pageCopy\.eyebrow\}/);
  assert.match(home, /title=\{pageCopy\.title\}/);
  assert.match(component, /styles\.eyebrow/);
  assert.match(styles, /\.eyebrow/);
  assert.match(styles, /opacity:\s*0\.5/);
});

test("brand mark uses the exact full transparent gold logo without a background", async () => {
  const brand = await source("src/components/ui/BrandMark.tsx");
  const brandStyles = await source("src/components/ui/BrandMark.module.css");
  assert.match(brand, /siriranee-logo-gold-exact\.svg/);
  assert.doesNotMatch(brand, /<svg/);
  assert.match(brand, /Siriranee Thai Massage/);
  assert.doesNotMatch(brandStyles, /background:/);
  assert.doesNotMatch(brandStyles, /box-shadow:/);
});
