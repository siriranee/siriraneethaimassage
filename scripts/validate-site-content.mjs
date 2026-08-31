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
const publicAdapterSource = await read("src/server/cms/public-adapter.ts");
const publicBookingSource = await read("src/server/booking/public-booking.ts");
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

for (const declaration of [
  "--color-purple-950: #150224;",
  "--color-purple-900: #1a0630;",
  "--color-purple-800: #240a3c;",
  "--color-purple-700: #341150;",
  "--color-purple-600: #3d125a;",
  "--color-purple-500: #46116d;",
  "--color-purple-400: #521a82;",
  "--color-gold-500: #eaae3d;",
  "--color-gold-400: #f2c56e;",
  "--color-ivory: #faf7f4;",
]) {
  check(
    globalStylesSource.includes(declaration),
    `AI-reference-derived Siriranee palette is missing: ${declaration}`,
  );
}

for (const retiredPurple of ["#51224e", "#6a2468", "#7c278a", "#872990", "#8d2a91", "#9b3aa2", "#ad5aaf"]) {
  check(
    !globalStylesSource.toLowerCase().includes(retiredPurple),
    `Retired dark purple token remains in globals.css: ${retiredPurple}`,
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
  check(
    !/^\s*max-width\s*:/m.test(source),
    `Element max-width property found in ${relative(repoRoot, file)}`,
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
