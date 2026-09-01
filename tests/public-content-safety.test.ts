import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { siteConfig } from "@/content/site";
import { buildDaySpaJsonLd } from "@/lib/structured-data";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("only owner-confirmed public contact data reaches static configuration and search data", async () => {
  const [defaults, adapter, structuredData] = await Promise.all([
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/lib/structured-data.ts"),
  ]);

  assert.deepEqual(siteConfig.contact.phone, {
    display: "089 948 4585",
    internationalDisplay: "+353 89 948 4585",
    e164: "+353899484585",
    href: "tel:+353899484585",
  });
  assert.equal(
    buildDaySpaJsonLd(siteConfig).telephone,
    "+353899484585",
  );
  assert.equal(siteConfig.contact.whatsapp.number, "353899484585");
  assert.equal("openingHoursSpecification" in buildDaySpaJsonLd(siteConfig), false);
  assert.match(defaults, /phoneDisplay: siteConfig\.contact\.phone\.display/);
  assert.match(defaults, /phoneE164: siteConfig\.contact\.phone\.e164/);
  assert.match(defaults, /phoneConfirmed: true/);
  assert.match(adapter, /source\.phoneConfirmed === true/);
  assert.match(adapter, /openingHoursConfirmed\s*\?\s*source\.weeklyHours\.map/);
  assert.doesNotMatch(adapter, /siteConfig\.contact\.phone\.(?:display|e164|href)/);
  assert.match(structuredData, /phone\s*\?\s*\{ telephone: phone\.e164 \}/);
});

test("legacy snapshots fail closed and production reads use a safe brochure boundary", async () => {
  const [service, defaults, validation] = await Promise.all([
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-validation.ts"),
  ]);

  assert.match(service, /content\.site\.phoneConfirmed === true/);
  assert.match(service, /storedSchemaVersion < 4/);
  assert.match(service, /migrateConfirmedPhone/);
  assert.match(service, /migrateConfirmedWhatsapp/);
  assert.match(service, /mode === "disabled"\) return createSafePublicContentState\(\)/);
  assert.match(service, /mode === "mock"\) return createDefaultContentState\(\)/);
  assert.match(service, /throw new CmsPublicContentUnavailableError\(error\)/);
  assert.match(defaults, /export function createSafePublicContentState/);
  assert.doesNotMatch(defaults, /phoneDisplay: ""/);
  assert.match(defaults, /team: \[\]/);
  assert.match(defaults, /vouchers: \[\]/);
  assert.match(defaults, /publicBookingEnabled: false/);
  assert.match(validation, /phoneConfirmed[\s\S]*?\^\\\+\[1-9\]\\d\{7,14\}\$/);
});

test("public phone and hours consumers render only confirmed values", async () => {
  const files = await Promise.all([
    source("src/components/contact/ContactFab.tsx"),
    source("src/components/layout/SiteHeader.tsx"),
    source("src/components/layout/SiteFooter.tsx"),
    source("src/app/(site)/contact/page.tsx"),
    source("src/app/(site)/visit/page.tsx"),
    source("src/app/(site)/privacy/page.tsx"),
  ]);
  const publicUi = files.join("\n");

  assert.doesNotMatch(publicUi, /site\.contact\.phone\.(?:display|internationalDisplay|href)/);
  assert.match(publicUi, /Opening hours are being confirmed/);
  assert.doesNotMatch(publicUi, /Provisional opening hours|Draft schedule/);
});
