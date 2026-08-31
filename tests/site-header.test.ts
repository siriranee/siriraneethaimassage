import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("mobile drawer hides its scrollbar and keeps the close control stationary", async () => {
  const styles = await source("src/components/layout/SiteHeader.module.css");

  assert.match(
    styles,
    /\.drawer\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-width:\s*none;[\s\S]*?-ms-overflow-style:\s*none;/,
  );
  assert.match(styles, /\.drawer::\-webkit-scrollbar\s*\{[\s\S]*?display:\s*none;/);
  assert.match(
    styles,
    /\.menuButton\s*\{[\s\S]*?z-index:\s*103;[\s\S]*?width:\s*2\.9rem;[\s\S]*?height:\s*2\.9rem;/,
  );
  const component = await source("src/components/layout/SiteHeader.tsx");
  assert.doesNotMatch(component, /drawerCloseRef|styles\.drawerClose/);
  assert.match(component, /tabIndex=\{\-1\}/);
  assert.match(component, /\[menuButtonRef\.current, \.\.\.drawerElements\]/);
});

test("mobile drawer closes without moving the underlying page", async () => {
  const [component, styles] = await Promise.all([
    source("src/components/layout/SiteHeader.tsx"),
    source("src/components/layout/SiteHeader.module.css"),
  ]);

  assert.match(
    styles,
    /\.backdrop\s*\{[\s\S]*?overscroll-behavior:\s*none;[\s\S]*?touch-action:\s*none;/,
  );
  assert.match(component, /if \(!menuOpen\) \{\s*return;\s*\}/);
  assert.match(component, /scrollbarWidth = window\.innerWidth - root\.clientWidth/);
  assert.match(component, /body\.style\.paddingRight = `\$\{bodyPaddingRight \+ scrollbarWidth\}px`/);
  assert.match(component, /focus\(\{ preventScroll: true \}\)/);
});
