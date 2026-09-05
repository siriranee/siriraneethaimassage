import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  siteConfig,
} from "@/content/site";
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
  assert.equal(
    googleMapsDirectionsUrl,
    "https://maps.app.goo.gl/CFWPtF1oM92TTj7P6?g_st=al",
  );
  assert.equal(siteConfig.address.directionsUrl, googleMapsDirectionsUrl);
  assert.equal(siteConfig.address.mapsEmbedUrl, googleMapsEmbedUrl);
  assert.match(googleMapsEmbedUrl, /Siriranee%20Thai%20Massage/);
  assert.match(googleMapsEmbedUrl, /D13%20E9H9/);
  assert.equal("openingHoursSpecification" in buildDaySpaJsonLd(siteConfig), false);
  assert.match(defaults, /phoneDisplay: siteConfig\.contact\.phone\.display/);
  assert.match(defaults, /phoneE164: siteConfig\.contact\.phone\.e164/);
  assert.match(defaults, /phoneConfirmed: true/);
  assert.match(adapter, /source\.phoneConfirmed === true/);
  assert.match(adapter, /openingHoursConfirmed\s*\?\s*source\.weeklyHours\.map/);
  assert.doesNotMatch(adapter, /siteConfig\.contact\.phone\.(?:display|e164|href)/);
  assert.match(structuredData, /phone\s*\?\s*\{ telephone: phone\.e164 \}/);
});

test("legacy snapshots and unavailable production reads use a safe brochure boundary", async () => {
  const [service, defaults, validation] = await Promise.all([
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-validation.ts"),
  ]);
  const publishedRead = service.slice(
    service.indexOf("export async function getPublishedCmsContent"),
    service.indexOf("function contentChanged"),
  );

  assert.match(service, /content\.site\.phoneConfirmed === true/);
  assert.match(service, /storedSchemaVersion < 4/);
  assert.match(service, /migrateConfirmedPhone/);
  assert.match(service, /migrateConfirmedWhatsapp/);
  assert.match(publishedRead, /mode === "disabled"\) return createSafePublicContentState\(\)/);
  assert.match(publishedRead, /mode === "mock"\) return createDefaultContentState\(\)/);
  assert.match(publishedRead, /catch \{[\s\S]*?return createSafePublicContentState\(\)/);
  assert.doesNotMatch(publishedRead, /CmsPublicContentUnavailableError/);
  assert.match(defaults, /export function createSafePublicContentState/);
  assert.match(
    defaults,
    /export function createSafePublicContentState[\s\S]*?services: \[\]/,
  );
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

test("contact page always offers the owner-confirmed WhatsApp number", async () => {
  const contactPage = await source("src/app/(site)/contact/page.tsx");

  assert.match(
    contactPage,
    /site\.contact\.whatsapp\.number \?\? siteConfig\.contact\.whatsapp\.number/,
  );
  assert.match(
    contactPage,
    /site\.contact\.whatsapp\.url \?\? siteConfig\.contact\.whatsapp\.url/,
  );
  assert.match(contactPage, /WhatsApp \+\{whatsappNumber\}/);
  assert.match(contactPage, /Message on WhatsApp/);
});
