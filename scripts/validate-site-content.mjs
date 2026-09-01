import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

function extractConstArray(source, exportName) {
  const match = source.match(
    new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`),
  );
  check(Boolean(match), `Could not find ${exportName}`);
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]) : [];
}

function sameArray(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const expectedName = "Siriranee Thai Massage";
const expectedAddress =
  "Floor 3, Harbour House, Harbour Road, Howth, Dublin, Ireland";
const expectedServiceAreas = [
  "Howth",
  "Sutton",
  "Malahide",
  "Portmarnock",
  "Clontarf",
  "Raheny",
  "Dublin",
];
const expectedServices = {
  "traditional-thai-massage": {
    name: "Traditional Thai Massage",
    pricing: [[60, 65], [90, 95]],
  },
  "hot-oil-massage": {
    name: "Hot Oil Massage",
    pricing: [[60, 65], [90, 95]],
  },
  "neck-shoulder-upper-back-massage": {
    name: "Neck, Shoulder & Upper Back Massage",
    pricing: [[30, 40]],
  },
  "deep-tissue-massage": {
    name: "Deep Tissue Massage",
    pricing: [[60, 65], [90, 95]],
  },
  "hot-stone-massage": {
    name: "Hot Stone Massage",
    pricing: [[90, 95]],
  },
};

const siteSource = await read("src/content/site.ts");
const servicesSource = await read("src/content/services.ts");
const globalStylesSource = await read("src/app/globals.css");
const schemaSource = await read("src/lib/structured-data.ts");
const homePageSource = await read("src/app/(site)/page.tsx");
const aboutPageSource = await read("src/app/(site)/about/page.tsx");
const openGraphImageSource = await read("src/app/opengraph-image.tsx");
const mapEmbedSource = await read("src/components/contact/MapEmbed.tsx");
const sitemapSource = await read("src/app/sitemap.ts");
const robotsSource = await read("src/app/robots.ts");
const publicAdapterSource = await read("src/server/cms/public-adapter.ts");
const publicBookingSource = await read("src/server/booking/public-booking.ts");
const defaultContentSource = await read("src/server/cms/default-content.ts");
const servicesPageSource = await read("src/app/(site)/services/page.tsx");
const therapistsPageSource = await read("src/app/(site)/therapists/page.tsx");
const contactPageSource = await read("src/app/(site)/contact/page.tsx");
const galleryPageSource = await read("src/app/(site)/gallery/page.tsx");
const promotionsPageSource = await read("src/app/(site)/promotions/page.tsx");
const customerBookingSources = new Map(
  await Promise.all(
    [
      "src/components/booking/BookingPlanner.tsx",
      "src/lib/contact-links.ts",
      "src/app/(site)/book/page.tsx",
      "src/app/(site)/contact/page.tsx",
      "src/content/booking.ts",
      "src/content/team.ts",
    ].map(async (relativePath) => [relativePath, await read(relativePath)]),
  ),
);

const bookNowSources = [
  "src/components/layout/SiteHeader.tsx",
  "src/components/layout/SiteFooter.tsx",
  "src/components/marketing/BookingCta.tsx",
  "src/components/marketing/HomeHeroSlider.tsx",
  "src/components/services/ServiceExplorer.tsx",
  "src/components/booking/BookingPlanner.tsx",
  "src/app/(site)/page.tsx",
  "src/app/(site)/visit/page.tsx",
  "src/app/(site)/contact/page.tsx",
  "src/app/(site)/promotions/page.tsx",
  "src/app/(site)/services/[slug]/page.tsx",
];

const publicShellSource = await read("src/components/layout/PublicShell.tsx");

check(
  publicShellSource.includes("<ContactFab site={site} />"),
  "The public shell must render the contact FAB",
);
check(
  !publicShellSource.includes("MobileBookingBar"),
  "The retired mobile booking bar must not return to the public shell",
);

const retiredBookingLabels = [
  "Plan a massage",
  "Plan this treatment",
  "Plan an appointment",
  "Plan your massage",
  "Plan your appointment",
  "Plan visit",
  "Plan your visit",
  "Plan another appointment",
  "Plan your treatment",
];

check(
  siteSource.includes(`name: "${expectedName}"`),
  `Business name must be exactly ${expectedName}`,
);
check(
  siteSource.includes('alternateName: "Siriranee"'),
  'Business alternateName must be exactly "Siriranee"',
);
check(
  siteSource.includes('streetAddress: "Floor 3, Harbour House, Harbour Road"'),
  "Street address is not the confirmed Harbour House address",
);
check(siteSource.includes('locality: "Howth"'), "Address locality must be Howth");
check(siteSource.includes('region: "Dublin"'), "Address region must be Dublin");
check(siteSource.includes("postalCode: null"), "Unknown Eircode must remain null");
check(
  siteSource.includes("openingHoursConfirmed: false"),
  "Draft opening hours must remain unconfirmed until the owner approves them",
);
check(siteSource.includes(expectedAddress), "Formatted address is incorrect");

const conciseHeroSource = [
  defaultContentSource,
  servicesPageSource,
  therapistsPageSource,
].join("\n");

for (const copy of [
  "Thai Massage with Thoughtful Care",
  "Contact Siriranee in Howth",
  "Find Us in Howth",
  "Privacy Notice",
  "Massage Gifts & Offers",
  "A Look Inside Siriranee",
  "Massage in Howth, Dublin",
  "The Siriranee Team",
]) {
  check(conciseHeroSource.includes(copy), `Concise PageHero copy is missing: ${copy}`);
}

for (const retiredCopy of [
  "Discover a massage and spa setting in Howth shaped around thoughtful care",
  "continue an appointment request with your chosen massage preferences",
  "Check the practical details below before your appointment",
  "Arrange a thoughtful massage gift, explore longer appointments",
  "shaping Siriranee's visual direction in Howth",
  "Explore our five-treatment menu with clear 30-, 60- and 90-minute options",
  "A calm massage experience begins with feeling heard",
]) {
  check(!conciseHeroSource.includes(retiredCopy), `Retired PageHero copy remains: ${retiredCopy}`);
}

check(
  contactPageSource.includes('title="Contact Details"'),
  "The contact page should use one concise details heading",
);
check(
  galleryPageSource.includes('title="Treatment Moments"'),
  "The gallery page should use one concise content heading",
);
check(
  !promotionsPageSource.includes("introSection"),
  "The repeated promotions introduction must not return",
);

for (const declaration of [
  "--color-purple-950: #2b2028;",
  "--color-purple-800: #4a2246;",
  "--color-purple-600: #6a2467;",
  "--color-purple-500: #7c2a90;",
  "--color-purple-400: #90278d;",
  "--color-gold-700: #7a590d;",
  "--color-gold-500: #d5b350;",
  "--color-gold-400: #e1c65f;",
  "--color-cream: #f3ebd4;",
  "--color-ivory: #f9f4ea;",
]) {
  check(
    globalStylesSource.includes(declaration),
    `Official-logo-derived Siriranee palette is missing: ${declaration}`,
  );
}

for (const retiredColor of [
  "#150224",
  "#1a0630",
  "#240a3c",
  "#341150",
  "#3d125a",
  "#46116d",
  "#521a82",
  "#eaae3d",
  "#f2c56e",
]) {
  check(
    !globalStylesSource.toLowerCase().includes(retiredColor),
    `Retired pre-logo palette token remains in globals.css: ${retiredColor}`,
  );
}

for (const [relativePath, source] of customerBookingSources) {
  check(
    !/[?&]therapist=/.test(source),
    `Customer booking URL still selects a therapist in ${relativePath}`,
  );
  check(
    !/\btherapistSlug\b/.test(source),
    `Customer booking state still contains a therapist slug in ${relativePath}`,
  );
  check(
    !/name=["']therapist["']/.test(source),
    `Customer booking UI still contains a therapist control in ${relativePath}`,
  );
  check(
    !/therapist[ -]preference/i.test(source),
    `Customer booking copy still asks for a therapist preference in ${relativePath}`,
  );
}

for (const relativePath of bookNowSources) {
  const source = await read(relativePath);
  check(
    source.includes("Book Now"),
    `Booking call to action must say Book Now in ${relativePath}`,
  );
  for (const retiredLabel of retiredBookingLabels) {
    check(
      !source.toLocaleLowerCase("en-IE").includes(
        retiredLabel.toLocaleLowerCase("en-IE"),
      ),
      `Retired booking label found in ${relativePath}: ${retiredLabel}`,
    );
  }
}

const serviceAreas = extractConstArray(siteSource, "serviceAreas");
check(
  sameArray(serviceAreas, expectedServiceAreas),
  `Service areas must be exactly: ${expectedServiceAreas.join(", ")}`,
);

const declaredSlugs = extractConstArray(servicesSource, "serviceSlugs");
const serviceMatches = [...servicesSource.matchAll(/^\s{4}slug: "([^"]+)",$/gm)];
const implementedSlugs = serviceMatches.map((match) => match[1]);
const expectedSlugs = Object.keys(expectedServices);
check(serviceMatches.length === 5, `Expected 5 services; found ${serviceMatches.length}`);
check(
  sameArray([...declaredSlugs].sort(), [...expectedSlugs].sort()),
  "The declared service slug set does not match the confirmed five services",
);
check(
  sameArray([...implementedSlugs].sort(), [...expectedSlugs].sort()),
  "The implemented service set does not match the confirmed five services",
);

for (const [index, match] of serviceMatches.entries()) {
  const slug = match[1];
  const expected = expectedServices[slug];
  if (!expected) continue;
  const nextIndex = serviceMatches[index + 1]?.index ?? servicesSource.indexOf("\n];", match.index);
  const block = servicesSource.slice(match.index, nextIndex);
  const name = block.match(/^\s{4}name: "([^"]+)",$/m)?.[1];
  const pricingBody = block.match(/^\s{4}pricing: \[([\s\S]*?)^\s{4}\],$/m)?.[1] ?? "";
  const pricing = [...pricingBody.matchAll(/durationMinutes:\s*(\d+),\s*priceEur:\s*(\d+)/g)]
    .map((price) => [Number(price[1]), Number(price[2])]);
  check(name === expected.name, `${slug} must be named ${expected.name}`);
  check(
    sameArray(pricing, expected.pricing),
    `${expected.name} pricing must be ${JSON.stringify(expected.pricing)}`,
  );
}

check(
  schemaSource.includes("description: siteDescription(site)"),
  "DaySpa schema must include the configured description",
);
check(
  schemaSource.includes("currenciesAccepted: site.currency"),
  "DaySpa schema must declare the configured EUR currency",
);
check(
  schemaSource.includes("buildServicePriceRange") &&
    schemaSource.includes("...(priceRange ? { priceRange } : {})") &&
    !schemaSource.includes('priceRange: "€40–€95"'),
  "DaySpa priceRange must be derived from the published services",
);
check(
  homePageSource.includes("buildDaySpaJsonLd(site, services)"),
  "The homepage must pass its published service list to the DaySpa schema",
);
check(
  schemaSource.includes("...(sameAs.length > 0 ? { sameAs } : {})"),
  "DaySpa schema must omit sameAs when no verified profiles exist",
);
check(
  schemaSource.includes("...(site.address.postalCode"),
  "Postal code must be conditionally omitted from DaySpa schema",
);
check(!/\bgeo\s*:/.test(schemaSource), "Do not publish geo coordinates before confirmation");
check(
  schemaSource.includes("...(site.openingHoursConfirmed"),
  "Opening-hours schema must be conditional on owner confirmation",
);
check(
  !contactPageSource.includes("loadImmediately") &&
    !mapEmbedSource.includes("loadImmediately") &&
    mapEmbedSource.includes("useState(false)"),
  "Google Maps must remain click-to-load until the visitor opts in",
);
check(
  !sitemapSource.includes('{ path: "/therapists"') &&
    sitemapSource.includes("getPublicPromotions") &&
    sitemapSource.includes("promotions.length > 0"),
  "Sitemap must exclude the team page and include promotions only when published",
);
check(
  robotsSource.includes('process.env.VERCEL_ENV === "preview"') &&
    robotsSource.includes('disallow: "/"'),
  "Vercel preview deployments must block search indexing",
);
const publicMarketingCopy = [
  homePageSource,
  aboutPageSource,
  therapistsPageSource,
  openGraphImageSource,
  defaultContentSource,
].join("\n");
for (const unsupportedClaim of [
  /\bauthentic Thai\b/i,
  /\bspecialist treatments?\b/i,
  /\bconfirmed team\b/i,
]) {
  check(
    !unsupportedClaim.test(publicMarketingCopy),
    `Public marketing copy contains an unconfirmed claim: ${unsupportedClaim}`,
  );
}
check(
  publicAdapterSource.includes("getPublishedCmsContent") &&
    publicAdapterSource.includes('record.status !== "published"'),
  "Public pages must resolve services from the immutable published CMS snapshot",
);
for (const forbiddenField of [
  "therapist",
  "therapistId",
  "staffId",
  "calendarId",
  "price",
  "priceCents",
]) {
  check(
    publicBookingSource.includes(`"${forbiddenField}"`),
    `Public booking must reject privileged field: ${forbiddenField}`,
  );
}
check(
  /assignedStaffId:\s*""/.test(publicBookingSource),
  "Public booking must leave internal staff assignment empty",
);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

const styleFiles = (await collectSourceFiles(join(repoRoot, "src"))).filter(
  (path) => extname(path) === ".css",
);

check(
  /html\s*\{[^}]*font-size:\s*var\(--fs-root\);/s.test(globalStylesSource),
  "The document root must use the centralized responsive font-size token",
);

for (const declaration of [
  "--fs-root: 1rem;",
  "--fs-2xs: 1rem;",
  "--fs-xs: 1rem;",
  "--fs-sm: 1rem;",
  "--fs-base: 1rem;",
  "--fs-md: 1.1rem;",
  "--fs-lg: 1.25rem;",
  "--fs-xl: 1.4rem;",
  "--fs-2xl: 1.6rem;",
  "--fs-3xl: 1.85rem;",
  "--fs-4xl: 2.1rem;",
  "--fs-5xl: 2.3rem;",
]) {
  check(
    globalStylesSource.includes(declaration),
    `Central typography token is missing from globals.css: ${declaration}`,
  );
}

for (const breakpoint of [
  ["768px", "1.025rem", "2.4rem"],
  ["1024px", "1.05rem", "2.5rem"],
  ["1280px", "1.075rem", "2.6rem"],
  ["1536px", "1.1rem", "2.6rem"],
  ["1920px", "1.125rem", "2.6rem"],
  ["2560px", "1.15rem", "2.6rem"],
  ["3840px", "1.2rem", "2.6rem"],
  ["5120px", "1.3rem", "2.6rem"],
  ["7680px", "1.4rem", "2.6rem"],
]) {
  const responsiveBlock = new RegExp(
    `@media \\(min-width: ${breakpoint[0]}\\) \\{[\\s\\S]*?--fs-base: ${breakpoint[1]};[\\s\\S]*?--fs-5xl: ${breakpoint[2]};[\\s\\S]*?\\n  \\}`,
  );
  check(
    responsiveBlock.test(globalStylesSource),
    `Responsive typography scale is missing for ${breakpoint[0]}`,
  );
}

for (const file of styleFiles) {
  const source = await readFile(file, "utf8");
  const relativePath = relative(repoRoot, file).replaceAll("\\", "/");
  const maxWidthDeclarations = [...source.matchAll(/^\s*max-width\s*:\s*([^;]+);/gm)];
  const hasAllowedBookingButtonWidth =
    relativePath === "src/components/booking/BookingPlanner.module.css" &&
    maxWidthDeclarations.length === 1 &&
    maxWidthDeclarations[0][1].trim() === "32rem" &&
    /@media \(min-width: 641px\)\s*\{[\s\S]*?\.primaryAction\s*\{[\s\S]*?max-width:\s*32rem;/.test(source);
  check(
    maxWidthDeclarations.length === 0 || hasAllowedBookingButtonWidth,
    `Unexpected element max-width property found in ${relative(repoRoot, file)}`,
  );
  for (const declaration of source.matchAll(/font-size:\s*([^;]+)/g)) {
    check(
      /^var\(--fs-(?:root|2xs|xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl)\)(?:\s*!important)?$/.test(
        declaration[1].trim(),
      ),
      `Font size must use a globals.css typography token in ${relative(repoRoot, file)}: ${declaration[0]}`,
    );
  }
}

const scanFiles = [
  ...await collectSourceFiles(join(repoRoot, "src")),
  ...await collectSourceFiles(join(repoRoot, "scripts")),
  join(repoRoot, "README.md"),
  join(repoRoot, "IMPLEMENTATION_STATUS.md"),
  join(repoRoot, "DESIGN_REFERENCES.md"),
  join(repoRoot, ".env.example"),
  join(repoRoot, "next.config.ts"),
].filter((path) => [".ts", ".tsx", ".mjs", ".md", ".example"].includes(extname(path)) || path.endsWith("next.config.ts"));

const forbiddenValues = [
  ["Siam", "Harmony"].join(" "),
  ["siam", "harmony"].join(""),
  ["year", "parnich"].join(""),
  ["No. 5", "The Loft"].join(" "),
  ["Strand", "Street"].join(" "),
  ["K36", "PX80"].join(" "),
  ["Malahide", "Village"].join(" "),
  ["3750", "3397"].join(""),
];

for (const file of scanFiles) {
  const source = await readFile(file, "utf8");
  const relativePath = relative(repoRoot, file).replaceAll("\\", "/");
  check(
    !/\bmaxWidth\s*:/.test(source),
    `Inline maxWidth property found in ${relativePath}`,
  );
  if (relativePath !== "src/app/opengraph-image.tsx") {
    check(
      !/\bfontSize\s*:/.test(source),
      `Inline fontSize property found in ${relativePath}`,
    );
  }
  for (const forbidden of forbiddenValues) {
    check(
      !source.toLocaleLowerCase("en-IE").includes(forbidden.toLocaleLowerCase("en-IE")),
      `Obsolete value found in ${relative(repoRoot, file)}: ${forbidden}`,
    );
  }
  check(
    !/owner\s*=\s*\d{5,}/i.test(source),
    `Hard-coded scheduler owner query found in ${relative(repoRoot, file)}`,
  );
}

if (failures.length > 0) {
  console.error(`Site content validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Site content validation passed: ${expectedName}, confirmed Howth address, 5 services, and 7 service areas.`,
  );
}
