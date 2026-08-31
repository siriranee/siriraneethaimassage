import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

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
  assert.doesNotMatch(serviceStyles, /^\.hero\s*\{/m);

  assert.match(styles, /aspect-ratio:\s*3 \/ 1;/);
  assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*?aspect-ratio:\s*16 \/ 9;/);
  assert.match(styles, /@media \(max-width:\s*620px\)[\s\S]*?aspect-ratio:\s*3 \/ 4;/);
  assert.match(styles, /object-fit:\s*cover;/);
  assert.match(styles, /object-position:\s*center;/);
  assert.doesNotMatch(styles, /^\s{2,}max-width\s*:|font-size\s*:\s*clamp\(/m);
});
