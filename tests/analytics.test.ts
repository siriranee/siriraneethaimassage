import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canTrackPage,
  googleMeasurementId,
  publicPageLocation,
  safePageReferrer,
  startGoogleAnalytics,
  stopGoogleAnalytics,
  trackBookingRequest,
  trackPublicPage,
} from "@/lib/analytics";

test("analytics excludes private routes and removes every query string", () => {
  assert.equal(canTrackPage("/"), true);
  assert.equal(canTrackPage("/book"), true);
  assert.equal(canTrackPage("/cms"), false);
  assert.equal(canTrackPage("/cms/bookings"), false);
  assert.equal(canTrackPage("/book/status?reference=private"), false);
  assert.equal(canTrackPage("/book/confirm?token=private"), false);
  assert.equal(
    publicPageLocation("https://siriranee.com", "/book?email=private@example.com#details"),
    "https://siriranee.com/book",
  );
  assert.equal(
    safePageReferrer("https://siriranee.com", "https://example.com/article?token=private"),
    "https://example.com/",
  );
  assert.equal(
    safePageReferrer("https://siriranee.com", "https://siriranee.com/book/status?reference=private"),
    "https://siriranee.com/",
  );
});

test("booking status shortcut unloads the analytics tag before opening the private page", async () => {
  const page = await readFile(new URL("../src/app/(site)/book/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<a className=\{styles\.statusAction\} href="\/book\/status">/);
});

test("analytics consent and setup describe the immediate-confirmation booking flow", async () => {
  const consent = await readFile(new URL("../src/components/analytics/AnalyticsConsent.tsx", import.meta.url), "utf8");
  const setup = await readFile(new URL("../ANALYTICS_SETUP.md", import.meta.url), "utf8");
  assert.match(consent, /confirmed website bookings/);
  assert.match(setup, /new website booking is saved and confirmed/);
  assert.match(setup, /not a completed treatment or payment/);
  assert.doesNotMatch(setup, /booking request is pending/);
});

test("consented analytics sends canonical page views and one PII-free lead per booking", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const browser = {
    location: {
      origin: "https://siriranee.com",
      pathname: "/book",
      hostname: "siriranee.com",
    },
    dataLayer: [] as unknown[][],
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { title: "Book a massage", referrer: "https://example.com/search?private=yes", cookie: "" },
  });

  try {
    startGoogleAnalytics();
    trackPublicPage("/book?service=private");
    trackPublicPage("/book");
    trackPublicPage("/book/confirm?token=private");
    trackBookingRequest("SRN-PRIVATE-REFERENCE", "traditional-thai", 60);
    trackBookingRequest("SRN-PRIVATE-REFERENCE", "traditional-thai", 60);

    const events = browser.dataLayer.filter((item) => item[0] === "event");
    assert.deepEqual(events.map((item) => item[1]), ["page_view", "generate_lead"]);
    assert.equal(browser.dataLayer[0][0], "consent");
    assert.equal(browser.dataLayer[2][0], "config");
    assert.equal(browser.dataLayer[2][1], googleMeasurementId);
    assert.equal((browser.dataLayer[2][2] as { send_page_view: boolean }).send_page_view, false);
    assert.deepEqual(events[0][2], {
      send_to: googleMeasurementId,
      page_location: "https://siriranee.com/book",
      page_referrer: "https://example.com/",
      page_title: "Book a massage",
    });
    assert.deepEqual(events[1][2], {
      send_to: googleMeasurementId,
      lead_source: "website_booking",
      service_slug: "traditional-thai",
      duration_minutes: 60,
    });
    assert.doesNotMatch(JSON.stringify(browser.dataLayer), /SRN-PRIVATE-REFERENCE|private@example.com|token=private/);

    stopGoogleAnalytics();
    trackBookingRequest("SRN-ANOTHER-REFERENCE", "traditional-thai", 60);
    assert.equal(browser.dataLayer.filter((item) => item[1] === "generate_lead").length, 1);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
