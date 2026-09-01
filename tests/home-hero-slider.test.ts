import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

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

test("homepage hero uses all six supplied hero images and the official logo", async () => {
  for (const path of heroAssets) {
    const [metadata, file] = await Promise.all([
      stat(resolve(process.cwd(), path)),
      readFile(resolve(process.cwd(), path)),
    ]);
    assert.ok(metadata.size > 100_000, `${path} should be a production-quality image`);
    assert.equal(file.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }

  const logoPath = resolve(process.cwd(), "public/siriranee_logo.svg");
  const [logo, logoSource] = await Promise.all([
    stat(logoPath),
    readFile(logoPath, "utf8"),
  ]);

  assert.ok(logo.size > 100_000);
  assert.match(logoSource, /<svg\b/);
  assert.match(logoSource, /viewBox="0 0 1200 1200"/);
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
  assert.match(component, /siriranee_logo\.svg/);
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

test("brand mark uses the supplied full SVG logo without a background", async () => {
  const [brand, brandStyles, metadata] = await Promise.all([
    source("src/components/ui/BrandMark.tsx"),
    source("src/components/ui/BrandMark.module.css"),
    source("src/lib/metadata.ts"),
  ]);
  assert.match(brand, /siriranee_logo\.svg/);
  assert.match(metadata, /siriranee_logo\.svg/);
  assert.doesNotMatch(brand, /\bunoptimized\b/);
  assert.doesNotMatch(brand, /<svg/);
  assert.match(brand, /Siriranee Thai Massage/);
  assert.doesNotMatch(brandStyles, /background:/);
  assert.doesNotMatch(brandStyles, /box-shadow:/);
});
