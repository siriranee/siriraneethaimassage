import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { services } from "@/content/services";
import { siteConfig } from "@/content/site";
import robots from "@/app/robots";
import {
  buildDaySpaJsonLd,
  buildServicePriceRange,
} from "@/lib/structured-data";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function restoreEnvironment(
  name: "VERCEL" | "VERCEL_ENV",
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("DaySpa price range comes from the published service list", () => {
  assert.equal(buildServicePriceRange(services), "€40–€95");
  assert.equal(
    buildServicePriceRange([
      {
        pricing: [
          { durationMinutes: 45, label: "45 minutes", priceEur: 72.5 },
        ],
      },
    ]),
    "€72.5",
  );

  const schema = buildDaySpaJsonLd(siteConfig, services);
  assert.equal(schema.priceRange, "€40–€95");
  assert.equal("priceRange" in buildDaySpaJsonLd(siteConfig, []), false);
});

test("contact map remains click-to-load", async () => {
  const [contactPage, mapEmbed] = await Promise.all([
    source("src/app/(site)/contact/page.tsx"),
    source("src/components/contact/MapEmbed.tsx"),
  ]);

  assert.match(contactPage, /<MapEmbed/);
  assert.doesNotMatch(contactPage, /loadImmediately/);
  assert.doesNotMatch(mapEmbed, /loadImmediately/);
  assert.match(mapEmbed, /useState\(false\)/);
});

test("sitemap excludes the team page and conditionally includes promotions", async () => {
  const sitemapSource = await source("src/app/sitemap.ts");

  assert.doesNotMatch(sitemapSource, /path:\s*"\/therapists"/);
  assert.match(sitemapSource, /getPublicPromotions/);
  assert.match(sitemapSource, /promotions\.length > 0/);
  assert.match(sitemapSource, /path:\s*"\/promotions"/);
});

test("the team page hides an empty profile grid and blocks indexing until profiles exist", async () => {
  const teamPage = await source("src/app/(site)/therapists/page.tsx");

  assert.match(teamPage, /noIndex:\s*teamMembers\.length === 0/);
  assert.match(teamPage, /\{teamMembers\.length \? \(/);
  assert.doesNotMatch(
    teamPage,
    /The spa assigns the team member for each appointment/,
  );
});

test("Vercel previews block indexing without changing local or production robots", () => {
  const originalVercel = process.env.VERCEL;
  const originalVercelEnvironment = process.env.VERCEL_ENV;

  try {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(robots().rules, {
      userAgent: "*",
      disallow: "/",
    });

    process.env.VERCEL_ENV = "production";
    assert.deepEqual(robots().rules, {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin-preview", "/cms", "/cms/"],
    });

    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    assert.deepEqual(robots().rules, {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin-preview", "/cms", "/cms/"],
    });
  } finally {
    restoreEnvironment("VERCEL", originalVercel);
    restoreEnvironment("VERCEL_ENV", originalVercelEnvironment);
  }
});

test("public marketing copy avoids unsupported qualification claims", async () => {
  const publicCopy = (
    await Promise.all([
      source("src/app/(site)/page.tsx"),
      source("src/app/(site)/about/page.tsx"),
      source("src/app/(site)/therapists/page.tsx"),
      source("src/app/opengraph-image.tsx"),
      source("src/server/cms/default-content.ts"),
    ])
  ).join("\n");

  assert.doesNotMatch(publicCopy, /\bauthentic Thai\b/i);
  assert.doesNotMatch(publicCopy, /\bspecialist treatments?\b/i);
  assert.doesNotMatch(publicCopy, /\bconfirmed team\b/i);
});
