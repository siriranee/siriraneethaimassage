const baseUrl = new URL(
  process.env.RENDERED_SITE_BASE_URL || "http://localhost:3000",
);
const failures = [];
const publicTherapistNames = new Map();

const publicRoutes = [
  "/",
  "/about",
  "/book",
  "/book/status",
  "/contact",
  "/gallery",
  "/privacy",
  "/promotions",
  "/services",
  "/services/traditional-thai-massage",
  "/services/hot-oil-massage",
  "/services/foot-massage-back-neck-head",
  "/services/deep-tissue-massage",
  "/services/hot-stone-massage",
  "/visit",
];

const expectedAddress =
  "Floor 3, Harbour House, Harbour Road, Howth, Dublin, Ireland";
const expectedAreas = [
  "Howth",
  "Sutton",
  "Malahide",
  "Portmarnock",
  "Clontarf",
  "Raheny",
  "Dublin",
];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function decodeAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");
}

function capture(html, pattern) {
  return html.match(pattern)?.[1] ?? "";
}

function metaContent(html, attribute, value) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (
      new RegExp(`\\s${attribute}=["']${value}["']`, "i").test(match[0])
    ) {
      return decodeAttribute(
        capture(match[0], /\scontent=["']([^"']*)["']/i),
      );
    }
  }

  return "";
}

function visibleMarkup(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

function checkAppointmentHandoff(html, targetPath, context) {
  const link = [...visibleMarkup(html).matchAll(/href="([^"]+)"/gi)]
    .map((match) => new URL(decodeAttribute(match[1]), baseUrl))
    .find((url) => url.pathname === targetPath && url.searchParams.get("service") === "hot-oil-massage");
  check(Boolean(link), `${context} is missing its appointment handoff`);
  if (!link) return;
  check(link.searchParams.get("duration") === "90", `${context} lost the chosen duration`);
  if (targetPath === "/contact") {
    check(link.hash === "#appointment-request", `${context} lost the appointment section`);
    const selectedLabel = [...visibleMarkup(html).matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)]
      .map((match) => match[0])
      .find((label) => /<input\b(?=[^>]*name="therapistId")(?=[^>]*\schecked(?:=|\s|>))[^>]*>/i.test(label));
    const selectedName = selectedLabel ? decodeAttribute(capture(selectedLabel, /<strong[^>]*>([^<]+)<\/strong>/i)) : "";
    const therapistSlug = link.searchParams.get("therapist");
    check(
      selectedName
        ? publicTherapistNames.get(therapistSlug) === selectedName
        : !therapistSlug,
      `${context} did not preserve the selected available therapist`,
    );
  } else {
    const therapistSlug = link.searchParams.get("therapist");
    check(!therapistSlug || publicTherapistNames.has(therapistSlug), `${context} preserved an unavailable therapist`);
  }
}

function checkTherapistSelectionSafety(html, context) {
  const visible = visibleMarkup(html);
  check(
    !/name=["'](?:assignedStaffId|staffId|therapistEmail|notificationEmail)["']/i.test(
      visible,
    ),
    `${context} exposes a private or privileged therapist field`,
  );
  check(
    !/assignedStaffId|notificationEmail/i.test(visible),
    `${context} renders private therapist data`,
  );
  for (const control of visible.matchAll(
    /<input\b[^>]*name=["']therapistId["'][^>]*>/gi,
  )) {
    check(/\srequired(?:=|\s|>)/i.test(control[0]), `${context} has an optional therapist choice`);
  }
}

async function request(path, init = {}) {
  const url = new URL(path, baseUrl);
  try {
    const response = await fetch(url, init);
    return { response, body: await response.text(), url };
  } catch (error) {
    failures.push(`Request failed for ${url}: ${error}`);
    return null;
  }
}

const pages = new Map();

for (const route of publicRoutes) {
  const result = await request(route);
  if (!result) continue;
  check(result.response.status === 200, `${route} returned ${result.response.status}`);
  check(
    result.response.headers.get("content-type")?.includes("text/html"),
    `${route} did not return HTML`,
  );
  pages.set(route, result.body);
}

const titles = new Map();

for (const [route, html] of pages) {
  const title = decodeAttribute(capture(html, /<title>([^<]+)<\/title>/i));
  const description = decodeAttribute(
    capture(
      html,
      /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    ),
  );
  const canonical = decodeAttribute(
    capture(
      html,
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i,
    ),
  );
  const openGraphUrl = metaContent(html, "property", "og:url");
  const openGraphImage = metaContent(html, "property", "og:image");
  const twitterImage = metaContent(html, "name", "twitter:image");
  const h1Count = (html.match(/<h1(?:\s|>)/gi) || []).length;
  const mainCount = (html.match(/<main(?:\s|>)/gi) || []).length;
  const ids = [...html.matchAll(/\sid="([^"]+)"/gi)].map((match) => match[1]);
  const idSet = new Set(ids);

  check(ids.length === idSet.size, `${route} contains duplicate element IDs`);

  for (const match of html.matchAll(/\saria-(?:labelledby|describedby)="([^"]+)"/gi)) {
    for (const referencedId of match[1].split(/\s+/).filter(Boolean)) {
      check(
        idSet.has(referencedId),
        `${route} references missing accessibility ID: ${referencedId}`,
      );
    }
  }

  for (const match of html.matchAll(/<label[^>]+for="([^"]+)"/gi)) {
    check(idSet.has(match[1]), `${route} label references missing ID: ${match[1]}`);
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    check(/\salt="[^"]*"/i.test(match[0]), `${route} contains an image without alt`);
  }

  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    check(
      /\srel="[^"]*(?:noreferrer|noopener)[^"]*"/i.test(match[0]),
      `${route} contains an unsafe target=_blank link`,
    );
  }

  check(Boolean(title), `${route} is missing a title`);
  check(Boolean(description), `${route} is missing a description`);
  check(h1Count === 1, `${route} has ${h1Count} H1 elements`);
  check(mainCount === 1, `${route} has ${mainCount} main landmarks`);
  check(/<html[^>]+lang="en-IE"/i.test(html), `${route} is missing lang=en-IE`);
  check(
    /<main[^>]+id="main-content"/i.test(html),
    `${route} is missing the main-content landmark`,
  );
  check(/property="og:title"/i.test(html), `${route} is missing og:title`);
  check(/property="og:image"/i.test(html), `${route} is missing og:image`);
  check(Boolean(openGraphUrl), `${route} is missing og:url`);
  check(Boolean(twitterImage), `${route} is missing twitter:image`);

  if (canonical) {
    const canonicalUrl = new URL(canonical);
    check(
      canonicalUrl.pathname === route,
      `${route} canonical path is ${canonicalUrl.pathname}`,
    );
    check(!canonicalUrl.search, `${route} canonical contains a query string`);
    check(
      Boolean(openGraphUrl) &&
        new URL(openGraphUrl).toString() === canonicalUrl.toString(),
      `${route} og:url does not match its canonical URL`,
    );
    check(
      twitterImage === openGraphImage,
      `${route} Twitter and Open Graph images do not match`,
    );
  } else {
    failures.push(`${route} is missing a canonical link`);
  }

  if (titles.has(title)) {
    failures.push(`Duplicate title on ${route} and ${titles.get(title)}: ${title}`);
  } else {
    titles.set(title, route);
  }
}

for (const route of ["/", "/contact", "/visit"]) {
  check(
    pages.get(route)?.includes(expectedAddress),
    `${route} is missing the exact confirmed address`,
  );
}

const renderedSource = [...pages.values()].join("\n");
const homeMarkup = pages.get("/") ?? "";
const contactMarkup = pages.get("/contact") ?? "";

check(
  contactMarkup.includes("Load Google Maps"),
  "Contact page must offer a click-to-load Google Map",
);
check(
  !/<iframe\b[^>]+src="[^"]*(?:google|maps)/i.test(contactMarkup),
  "Contact page loaded the Google Map before visitor consent",
);

const contactFabToggles = [
  ...homeMarkup.matchAll(/<button\b[^>]*data-contact-fab-toggle=(?:""|"true")[^>]*>/gi),
];
const contactFabMenus = [
  ...homeMarkup.matchAll(/<(?:nav|div)\b[^>]*data-contact-fab-menu=(?:""|"true")[^>]*>/gi),
];
check(contactFabToggles.length === 1, "Homepage must render exactly one contact FAB toggle");
check(contactFabMenus.length === 1, "Homepage must render exactly one contact FAB menu");
if (contactFabToggles[0] && contactFabMenus[0]) {
  const controlledId = decodeAttribute(
    capture(contactFabToggles[0][0], /\saria-controls="([^"]+)"/i),
  );
  check(Boolean(controlledId), "Contact FAB toggle is missing aria-controls");
  check(
    capture(contactFabMenus[0][0], /\sid="([^"]+)"/i) === controlledId,
    "Contact FAB toggle does not control its menu",
  );
  check(
    /\saria-hidden="true"/i.test(contactFabMenus[0][0]) &&
      /\sinert=""/i.test(contactFabMenus[0][0]),
    "Closed contact FAB menu must be hidden and inert",
  );
}

const heroSlideCount =
  (homeMarkup.match(/data-hero-slide-active=/g) ?? []).length;
check(
  heroSlideCount >= 1 && heroSlideCount <= 8,
  `Homepage hero rendered ${heroSlideCount} slides; expected 1 to 8`,
);
check(
  homeMarkup.includes('aria-roledescription="carousel"') ===
    (heroSlideCount > 1),
  "Homepage hero carousel semantics do not match its slide count",
);

if (homeMarkup.includes('id="voucher-section-title"')) {
  const headingIndex = homeMarkup.indexOf('id="voucher-section-title"');
  const sectionStart = homeMarkup.lastIndexOf("<section", headingIndex);
  const sectionEnd = homeMarkup.indexOf("</section>", headingIndex);
  const voucherMarkup = homeMarkup.slice(sectionStart, sectionEnd + 10);

  for (const voucherText of [
    "Give the gift of calm",
    "Popular gift occasions",
    "How it works",
    "Arrange a gift voucher",
    "Gift envelopes can be collected from Siriranee in Howth.",
    'aria-label="Gift vouchers"',
    'aria-roledescription="carousel"',
    "Drag horizontally, swipe, or use the left and right arrow keys",
  ]) {
    check(
      voucherMarkup.includes(voucherText),
      `Published voucher section is missing: ${voucherText}`,
    );
  }
  check(
    /<h3(?:\s|>)/i.test(voucherMarkup),
    "Published voucher section has no voucher title",
  );
  check(
    !/<button(?:\s|>)/i.test(voucherMarkup),
    "Published voucher slider contains navigation buttons",
  );
  check(
    !/\b(?:Malahide|instant(?:ly)?)\b/i.test(voucherMarkup),
    "Published voucher section contains reference-business or unsupported instant-delivery copy",
  );
}
check(
  !/>\s*Buy(?: now| voucher)?\s*</i.test(homeMarkup),
  "Homepage voucher section contains an online buying action",
);
const bookingMarkup = pages.get("/book") ?? "";
checkTherapistSelectionSafety(bookingMarkup, "Booking page");
checkTherapistSelectionSafety(pages.get("/contact") ?? "", "Contact page");
check(
  /name=["']therapistId["']/i.test(bookingMarkup) ||
    bookingMarkup.includes("No therapist is available for this treatment yet."),
  "Booking page neither offers a required therapist choice nor explains therapist unavailability",
);
const selectedTherapistLabel = [...visibleMarkup(bookingMarkup).matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)]
  .map((match) => match[0])
  .find((label) => /<input\b(?=[^>]*name="therapistId")(?=[^>]*\schecked(?:=|\s|>))[^>]*>/i.test(label));
const selectedTherapistName = selectedTherapistLabel
  ? decodeAttribute(capture(selectedTherapistLabel, /<strong[^>]*>([^<]+)<\/strong>/i)).trim()
  : "";
const defaultTherapistLink = [...visibleMarkup(bookingMarkup).matchAll(/href="([^"]+)"/gi)]
  .map((match) => new URL(decodeAttribute(match[1]), baseUrl))
  .find((url) => url.pathname === "/contact" && url.searchParams.has("therapist"));
const defaultTherapistSlug = defaultTherapistLink?.searchParams.get("therapist") ?? "";
if (defaultTherapistSlug && selectedTherapistName) {
  publicTherapistNames.set(defaultTherapistSlug, selectedTherapistName);
}
const bookingStatusMarkup = pages.get("/book/status") ?? "";
check(
  /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/i.test(
    bookingStatusMarkup,
  ),
  "Booking status page must be noindex, nofollow",
);
check(
  !/(?:href|action)="[^"]*(?:\?|&amp;|&)(?:assignedStaffId|staffId|notificationEmail)=/i.test(
    renderedSource,
  ),
  "Rendered site contains a link with private therapist data",
);
for (const obsolete of [
  ["Siam", "Harmony"].join(" "),
  ["No. 5", "The Loft"].join(" "),
  ["Strand", "Street"].join(" "),
  ["K36", "PX80"].join(" "),
  ["Malahide", "Village"].join(" "),
  ["3750", "3397"].join(""),
]) {
  check(!renderedSource.includes(obsolete), `Rendered HTML contains obsolete value: ${obsolete}`);
}

const homeSchemas = [
  ...(pages.get("/")?.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  ) ?? []),
].map((match) => {
  try {
    return JSON.parse(match[1]);
  } catch {
    failures.push("Homepage contains invalid JSON-LD");
    return null;
  }
});

const daySpa = homeSchemas
  .flatMap((value) => (Array.isArray(value) ? value : [value]))
  .find((value) => value?.["@type"] === "DaySpa");

check(Boolean(daySpa), "Homepage is missing DaySpa JSON-LD");
if (daySpa) {
  check(daySpa.name === "Siriranee Thai Massage", "DaySpa name is incorrect");
  check(daySpa.alternateName === "Siriranee", "DaySpa alternateName is incorrect");
  check(
    daySpa.address?.streetAddress === "Floor 3, Harbour House, Harbour Road",
    "DaySpa street address is incorrect",
  );
  check(daySpa.address?.addressLocality === "Howth", "DaySpa locality is incorrect");
  check(!("postalCode" in daySpa.address), "Unconfirmed Eircode appears in DaySpa schema");
  check(!("geo" in daySpa), "Unconfirmed coordinates appear in DaySpa schema");
  const openingHours = daySpa.openingHoursSpecification;
  const homepageMarkup = pages.get("/") ?? "";
  if (openingHours === undefined) {
    check(
      homepageMarkup.includes("Opening hours are being confirmed"),
      "Unconfirmed DaySpa hours are not explained on the page",
    );
  } else {
    check(
      Array.isArray(openingHours) && openingHours.length > 0 && openingHours.length <= 7,
      "Confirmed DaySpa hours must contain one to seven entries",
    );
    check(
      homepageMarkup.includes("Current published schedule"),
      "Confirmed DaySpa hours are not identified as the published schedule",
    );
    const days = [];
    for (const entry of Array.isArray(openingHours) ? openingHours : []) {
      const day = entry?.dayOfWeek;
      days.push(day);
      check(
        entry?.["@type"] === "OpeningHoursSpecification" &&
          typeof day === "string" &&
          /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(day) &&
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry?.opens ?? "") &&
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry?.closes ?? "") &&
          entry.opens < entry.closes,
        "DaySpa contains an invalid confirmed opening-hours entry",
      );
    }
    check(new Set(days).size === days.length, "DaySpa repeats an opening-hours day");
  }
  check(
    JSON.stringify(daySpa.areaServed?.map((area) => area.name)) ===
      JSON.stringify(expectedAreas),
    "DaySpa service areas are incorrect",
  );
  check(daySpa.currenciesAccepted === "EUR", "DaySpa currency is incorrect");
  check(
    daySpa.priceRange === "€40–€95",
    "DaySpa price range does not match the published service prices",
  );
}

const validContact = await request(
  "/contact?service=hot-oil-massage&duration=90",
);
if (validContact) {
  for (const expected of [
    'id="appointment-request"',
    "Continue your request with Siriranee",
    "Hot Oil Massage",
    "1 hr 30 min",
    "€95",
    "have not been submitted",
    "/book?service=hot-oil-massage&amp;duration=90",
  ]) {
    check(
      validContact.body.includes(expected),
      `Valid contact handoff is missing: ${expected}`,
    );
  }
  checkTherapistSelectionSafety(validContact.body, "Valid contact handoff");
  const canonical = decodeAttribute(
    capture(
      validContact.body,
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i,
    ),
  );
  check(new URL(canonical).pathname === "/contact", "Contact query canonical is incorrect");
}

const handoffTherapistSlug = defaultTherapistSlug || "unavailable-therapist";
const legacyContact = await request(
  `/contact?service=hot-oil-massage&duration=90&therapist=${encodeURIComponent(handoffTherapistSlug)}`,
);
if (legacyContact) {
  for (const expected of [
    'id="appointment-request"',
    "Hot Oil Massage",
    "1 hr 30 min",
    "€95",
  ]) {
    check(
      legacyContact.body.includes(expected),
      `Legacy contact URL did not preserve service and duration: ${expected}`,
    );
  }
  checkAppointmentHandoff(legacyContact.body, "/book", "Therapist contact URL");
  checkTherapistSelectionSafety(legacyContact.body, "Therapist contact URL");
}

const invalidMarker = "NOT_ALLOWED_ABC";
const invalidContact = await request(
  `/contact?service=${invalidMarker}&duration=999`,
);
if (invalidContact) {
  check(
    !invalidContact.body.includes('id="appointment-request"'),
    "Invalid contact values produced an appointment summary",
  );
  check(
    !visibleMarkup(invalidContact.body).includes(invalidMarker),
    "Invalid contact values were echoed into visible markup",
  );
}

const validBook = await request(
  "/book?service=hot-oil-massage&duration=90",
);
if (validBook) {
  check(
    /name="service" checked="" value="hot-oil-massage"/.test(validBook.body),
    "Booking service query was not preselected",
  );
  check(
    /name="duration" checked="" value="90"/.test(validBook.body),
    "Booking duration query was not preselected",
  );
  checkAppointmentHandoff(validBook.body, "/contact", "Booking contact handoff");
  checkTherapistSelectionSafety(validBook.body, "Valid booking URL");
  for (const privateField of [
    "customerName",
    "phone",
    "email",
    "notes",
    "privacyAccepted",
  ]) {
    check(
      !new RegExp(`name=["']${privateField}["']`, "i").test(validBook.body),
      `Disabled booking page rendered private field: ${privateField}`,
    );
  }
}

const legacyBook = await request(
  `/book?service=hot-oil-massage&duration=90&therapist=${encodeURIComponent(handoffTherapistSlug)}`,
);
if (legacyBook) {
  check(
    /name="service" checked="" value="hot-oil-massage"/.test(legacyBook.body),
    "Legacy booking URL did not preserve the service",
  );
  check(
    /name="duration" checked="" value="90"/.test(legacyBook.body),
    "Legacy booking URL did not preserve the duration",
  );
  checkAppointmentHandoff(legacyBook.body, "/contact", "Therapist booking URL");
  checkTherapistSelectionSafety(legacyBook.body, "Therapist booking URL");
}

const invalidBook = await request(
  `/book?service=${invalidMarker}&duration=90evil`,
);
if (invalidBook) {
  check(
    !visibleMarkup(invalidBook.body).includes(invalidMarker),
    "Invalid booking service was echoed into visible markup",
  );
  check(
    !/name="duration" checked="" value="90"/.test(invalidBook.body),
    "Malformed booking duration was accepted",
  );
  checkTherapistSelectionSafety(invalidBook.body, "Invalid booking URL");
}

const internalTargets = new Set();
const imageTargets = new Set();

for (const [route, html] of pages) {
  for (const match of html.matchAll(/<a[^>]+href="([^"]+)"/gi)) {
    const href = decodeAttribute(match[1]);
    if (/^(?:mailto:|tel:|https?:\/\/|#)/i.test(href)) continue;
    const target = new URL(href, new URL(route, baseUrl));
    if (target.origin === baseUrl.origin) {
      target.hash = "";
      internalTargets.add(target.pathname + target.search);
    }
  }

  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
    const src = decodeAttribute(match[1]);
    const target = new URL(src, baseUrl);
    if (target.origin === baseUrl.origin) {
      imageTargets.add(target.pathname + target.search);
    }
  }
}

for (const target of internalTargets) {
  const result = await request(target);
  if (result) {
    check(
      result.response.status < 400,
      `Internal link ${target} returned ${result.response.status}`,
    );
  }
}

for (const target of imageTargets) {
  const result = await request(target);
  if (result) {
    check(
      result.response.status === 200,
      `Rendered image ${target} returned ${result.response.status}`,
    );
    check(
      result.response.headers.get("content-type")?.startsWith("image/"),
      `Rendered image ${target} did not return an image`,
    );
  }
}

const homeCanonical = decodeAttribute(
  capture(
    pages.get("/") ?? "",
    /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i,
  ),
);
const canonicalOrigin = new URL(homeCanonical).origin;

const sitemap = await request("/sitemap.xml");
if (sitemap) {
  check(sitemap.response.status === 200, "Sitemap did not return 200");
  check(
    sitemap.body.includes(`<loc>${canonicalOrigin}/visit</loc>`),
    "Sitemap is missing /visit",
  );
  check(!sitemap.body.includes("admin-preview"), "Sitemap contains admin-preview");
  check(!sitemap.body.includes("/cms"), "Sitemap contains a CMS route");
  check(!sitemap.body.includes("/api/"), "Sitemap contains an API route");
  check(!sitemap.body.includes("/book/status"), "Sitemap contains booking status");
  check(
    !sitemap.body.includes("/therapists"),
    "Sitemap contains the removed therapist pages",
  );
  check(
    sitemap.body.includes(`<loc>${canonicalOrigin}/promotions</loc>`),
    "Sitemap is missing the evergreen /promotions gift page",
  );
  for (const route of publicRoutes.filter(
    (route) =>
      route !== "/book/status" &&
      route !== "/promotions",
  )) {
    check(
      sitemap.body.includes(
        `<loc>${canonicalOrigin}${route === "/" ? "/" : route}</loc>`,
      ),
      `Sitemap is missing ${route}`,
    );
  }
}

const robots = await request("/robots.txt");
if (robots) {
  check(robots.response.status === 200, "robots.txt did not return 200");
  check(robots.body.includes("Disallow: /admin-preview"), "robots.txt does not block admin-preview");
  check(robots.body.includes("Disallow: /cms"), "robots.txt does not block CMS routes");
  check(robots.body.includes("Disallow: /api/"), "robots.txt does not block API routes");
  check(robots.body.includes("Sitemap:"), "robots.txt is missing its sitemap");
}

const admin = await request("/admin-preview", { redirect: "manual" });
if (admin) {
  check(
    [307, 308].includes(admin.response.status),
    `Admin preview redirect returned ${admin.response.status}`,
  );
  const location = admin.response.headers.get("location") || "";
  check(
    new URL(location, baseUrl).pathname === "/cms",
    `Admin preview redirects to ${location}`,
  );
}

for (const cmsPath of ["/cms", "/cms/login"]) {
  const cms = await request(cmsPath, { redirect: "manual" });
  if (!cms) continue;
  const robotsHeader = cms.response.headers.get("x-robots-tag") || "";
  const cacheControl = cms.response.headers.get("cache-control") || "";
  check(
    /noindex/i.test(robotsHeader) && /nofollow/i.test(robotsHeader),
    `${cmsPath} is missing the noindex, nofollow response header`,
  );
  check(
    /no-store/i.test(cacheControl),
    `${cmsPath} is missing Cache-Control: no-store`,
  );
}

const availability = await request(
  "/api/public/availability?serviceId=hot-oil-massage&durationMinutes=60&localDate=2026-09-01",
);
if (availability) {
  check(
    /no-store/i.test(availability.response.headers.get("cache-control") || ""),
    "Public availability response is cacheable",
  );
  try {
    const payload = JSON.parse(availability.body);
    check(
      ["disabled", "planning", "live"].includes(payload.status),
      `Public availability returned invalid mode: ${payload.status}`,
    );
  } catch {
    failures.push("Public availability did not return valid JSON");
  }
}

const availabilityCalendar = await request(
  "/api/public/availability/calendar?serviceId=hot-oil-massage&durationMinutes=60&month=2026-09",
);
if (availabilityCalendar) {
  check(
    /no-store/i.test(
      availabilityCalendar.response.headers.get("cache-control") || "",
    ),
    "Public availability calendar response is cacheable",
  );
  try {
    const payload = JSON.parse(availabilityCalendar.body);
    check(
      ["disabled", "planning", "live"].includes(payload.status),
      `Public availability calendar returned invalid mode: ${payload.status}`,
    );
    check(
      Array.isArray(payload.days),
      "Public availability calendar did not return a days array",
    );
  } catch {
    failures.push("Public availability calendar did not return valid JSON");
  }
}

const rejectedBooking = await request("/api/public/bookings", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://invalid.example",
  },
  body: "{}",
});
if (rejectedBooking) {
  check(
    rejectedBooking.response.status === 403,
    `Cross-origin booking request returned ${rejectedBooking.response.status}`,
  );
  check(
    /no-store/i.test(rejectedBooking.response.headers.get("cache-control") || ""),
    "Public booking error response is cacheable",
  );
}

const rejectedBookingStatus = await request("/api/public/bookings/status", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://invalid.example",
  },
  body: "{}",
});
if (rejectedBookingStatus) {
  check(
    rejectedBookingStatus.response.status === 403,
    `Cross-origin booking status request returned ${rejectedBookingStatus.response.status}`,
  );
  check(
    /no-store/i.test(
      rejectedBookingStatus.response.headers.get("cache-control") || "",
    ),
    "Public booking status error response is cacheable",
  );
}

const homeResponse = await fetch(baseUrl);
check(
  homeResponse.headers.get("x-content-type-options") === "nosniff",
  "Missing X-Content-Type-Options header",
);
check(
  homeResponse.headers.get("x-frame-options") === "SAMEORIGIN",
  "Missing X-Frame-Options header",
);
check(
  homeResponse.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
  "Missing Referrer-Policy header",
);
check(!homeResponse.headers.has("x-powered-by"), "X-Powered-By header is exposed");

for (const [source, destination] of [
  ["/services/back-neck-shoulder-massage", "/services/foot-massage-back-neck-head"],
  ["/services/back-neck-massage", "/services/foot-massage-back-neck-head"],
  ["/services/neck-shoulder-upper-back-massage", "/services/foot-massage-back-neck-head"],
  ["/services/head-massage", "/services/foot-massage-back-neck-head"],
  ["/services/head-spa", "/services/foot-massage-back-neck-head"],
  ["/services/foot-massage-reflexology", "/services/foot-massage-back-neck-head"],
  ["/services/foot-reflexology-spa", "/services/foot-massage-back-neck-head"],
  ["/masseuses", "/book"],
]) {
  const result = await request(source, { redirect: "manual" });
  if (result) {
    check(
      [307, 308].includes(result.response.status),
      `${source} redirect returned ${result.response.status}`,
    );
    const location = result.response.headers.get("location") || "";
    check(
      new URL(location, baseUrl).pathname === destination,
      `${source} redirects to ${location}`,
    );
  }
}

for (const removedPath of ["/therapists", "/therapists/siriranee"]) {
  const result = await request(removedPath, { redirect: "manual" });
  if (result) {
    check(result.response.status === 404, `${removedPath} should return 404 after removal`);
  }
}

if (failures.length) {
  console.error(`Rendered-site validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Rendered-site validation passed: ${publicRoutes.length} routes, ${internalTargets.size} internal links, ${imageTargets.size} rendered images, metadata, schema, booking handoff, public API cache policy, CMS indexing controls, sitemap, robots, redirects and headers.`,
  );
}
