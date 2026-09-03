import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { allNamedPageHeroImages } from "@/content/page-heroes";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("inner-page hero mirrors the home hero without carousel chrome", async () => {
  const [component, styles, privacyPage, servicePage, serviceStyles] = await Promise.all([
    source("src/components/marketing/PageHero.tsx"),
    source("src/components/marketing/PageHero.module.css"),
    source("src/app/(site)/privacy/page.tsx"),
    source("src/app/(site)/services/[slug]/page.tsx"),
    source("src/app/(site)/services/[slug]/page.module.css"),
  ]);

  assert.match(component, /fill/);
  assert.match(component, /preload/);
  assert.match(component, /quality=\{90\}/);
  assert.match(
    component,
    /sizes="\(max-width: 620px\) 400vw, \(max-width: 900px\) 180vw, 100vw"/,
  );
  assert.doesNotMatch(component, /ButtonLink|heroLogo|carousel|setInterval|divider/);
  assert.doesNotMatch(component, /compact/);
  assert.doesNotMatch(privacyPage, /compact/);
  assert.match(servicePage, /<PageHero/);
  assert.doesNotMatch(servicePage, /<section className=\{styles\.hero\}>/);
  assert.doesNotMatch(servicePage, /styles\.secondaryAction|Ask a question/);
  assert.doesNotMatch(serviceStyles, /^\.hero\s*\{/m);
  assert.doesNotMatch(serviceStyles, /\.secondaryAction/);

  assert.match(styles, /aspect-ratio:\s*3 \/ 1;/);
  assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*?aspect-ratio:\s*16 \/ 9;/);
  assert.match(styles, /@media \(max-width:\s*620px\)[\s\S]*?aspect-ratio:\s*3 \/ 4;/);
  assert.match(styles, /object-fit:\s*cover;/);
  assert.match(styles, /--page-hero-focal-x/);
  assert.match(styles, /--page-hero-mobile-focal-x/);
  assert.match(component, /style=\{imageStyle\}/);
  assert.doesNotMatch(styles, /^\s{2,}max-width\s*:|font-size\s*:\s*clamp\(/m);
});

test("every shared inner-page hero points to a supplied wide image", async () => {
  const uniqueImages = new Map(
    allNamedPageHeroImages.map((hero) => [hero.image, hero]),
  );

  assert.equal(uniqueImages.size, 5);

  for (const [imagePath, hero] of uniqueImages) {
    assert.ok(imagePath.startsWith("/images/Hero/"));
    assert.ok(hero.imageAlt.length >= 20);
    assert.equal(hero.focalX, 50);
    assert.equal(hero.focalY, 50);
    assert.equal(hero.mobileFocalX, 50);
    assert.equal(hero.mobileFocalY, 50);

    const filePath = path.join(root, "public", imagePath.slice(1));
    const [file, metadata] = await Promise.all([
      stat(filePath),
      sharp(filePath).metadata(),
    ]);

    assert.ok(file.size > 100_000, `${imagePath} should not be a placeholder`);
    assert.ok(metadata.width && metadata.width >= 1_700);
    assert.ok(metadata.height && metadata.height >= 590);
    assert.ok(
      metadata.width / metadata.height > 2.99 &&
        metadata.width / metadata.height < 3.02,
      `${imagePath} should retain the supplied 3:1 composition`,
    );
  }
});

test("page hero content has no service-specific local fallback map", async () => {
  const [heroes, therapistsPage] = await Promise.all([
    source("src/content/page-heroes.ts"),
    source("src/app/(site)/therapists/page.tsx"),
  ]);

  assert.doesNotMatch(heroes, /serviceHeroImages|getServicePageHero/);
  assert.match(therapistsPage, /\.\.\.pageHeroImages\.about/);
  assert.doesNotMatch(therapistsPage, /traditional-thai-massage/);
});
