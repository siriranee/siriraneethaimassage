import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("contact FAB uses live site channels and accessible disclosure behavior", async () => {
  const [component, shell] = await Promise.all([
    source("src/components/contact/ContactFab.tsx"),
    source("src/components/layout/PublicShell.tsx"),
  ]);

  assert.match(shell, /<ContactFab site=\{site\} \/>/);
  assert.doesNotMatch(shell, /MobileBookingBar/);
  assert.match(component, /const phone = site\.contact\.phone/);
  assert.match(component, /phone\s*\?[\s\S]*?phone\.href/);
  assert.match(component, /phone\?\.e164\.replace\(\/\\D\/g, ""\)/);
  assert.match(component, /https:\/\/wa\.me\/\$\{whatsappNumber\}/);
  assert.match(component, /phone\?\.internationalDisplay/);
  assert.match(component, /label: "Call Siriranee"/);
  assert.match(component, /label: "WhatsApp"/);
  assert.match(component, /site\.address\.directionsUrl/);
  assert.match(component, /aria-expanded=\{isOpen\}/);
  assert.match(component, /aria-controls=\{actionsId\}/);
  assert.match(component, /inert=\{!isOpen\}/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /handlePointerDown/);
  assert.match(component, /tabIndex:\s*isOpen \? 0 : -1/);
  assert.match(component, /requestAnimationFrame\(\(\) => setIsOpen\(false\)\)/);
  assert.match(component, /\}, \[pathname\]\)/);
  assert.match(component, /site\.contact\.email/);
  assert.match(component, /site\.social\.instagram/);
  for (const icon of [
    "Call-start.png",
    "Call-end.png",
    "Phone-2.png",
    "Whatsapp.svg",
    "Location.png",
    "Email.png",
    "IG.svg",
  ]) {
    assert.match(component, new RegExp(`/icons/${icon.replace(".", "\\.")}`));
  }
  assert.doesNotMatch(component, /MessageCircle/);
  assert.doesNotMatch(component, /mainLabel/);
  assert.doesNotMatch(component, /Contact us|See all contact options/);
  assert.ok(
    component.indexOf("data-contact-fab-toggle") <
      component.indexOf("data-contact-fab-menu"),
    "toggle must precede revealed actions in keyboard order",
  );
  assert.doesNotMatch(component, /maps\.app\.goo\.gl\//);
  assert.doesNotMatch(component, /(?:086|092)-?\d{3}/);
});

test("contact FAB replaces the mobile booking bar and follows UI constraints", async () => {
  const styles = await source("src/components/contact/ContactFab.module.css");

  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.fabWrap\s*\{[\s\S]*?bottom:\s*max\(0\.75rem, env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(styles, /@media \(max-width: 640px\)[\s\S]*?\.fabWrap\s*\{[^}]*display:\s*none/);
  assert.match(styles, /max-height:\s*calc\(100dvh/);
  assert.match(styles, /scrollbar-width:\s*none/);
  assert.match(styles, /\.items::\-webkit-scrollbar/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /font-size:\s*var\(--fs-sm\)/);
  assert.doesNotMatch(styles, /^\s*max-width\s*:/m);
  assert.doesNotMatch(styles, /font-size:\s*clamp\(/);
  assert.doesNotMatch(styles, /outline-color:\s*var\(--color-purple-400\)/);
});

test("footer removes the Explore column and places Privacy in the bottom row", async () => {
  const [footer, styles] = await Promise.all([
    source("src/components/layout/SiteFooter.tsx"),
    source("src/components/layout/SiteFooter.module.css"),
  ]);

  assert.doesNotMatch(footer, />Explore</);
  assert.doesNotMatch(footer, /Footer navigation/);
  assert.match(footer, /className=\{styles\.bottomMeta\}/);
  assert.ok(
    footer.indexOf("styles.bottomMeta") < footer.indexOf('href="/privacy"'),
    "Privacy should be inside the bottom metadata group",
  );
  assert.match(styles, /grid-template-columns:\s*1\.1fr 1\.25fr 1fr/);
  assert.match(styles, /\.bottomMeta a\s*\{/);
});
