export const googleMeasurementId = "G-8QX4CPDY6T";
export const analyticsConsentKey = "siriranee-analytics-consent-v1";
export const analyticsPreferencesEvent = "siriranee:analytics-preferences";

type GoogleTagWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

const recordedBookings = new Set<string>();
let started = false;
let lastPageLocation = "";

export function canTrackPage(pathname: string) {
  const path = new URL(pathname, "https://siriranee.com").pathname;
  return (
    pathname.startsWith("/") &&
    !/^\/cms(?:\/|$)/.test(path) &&
    !/^\/book\/(?:status|confirm)(?:\/|$)/.test(path)
  );
}

export function publicPageLocation(origin: string, pathname: string) {
  const url = new URL(pathname, origin);
  return url.origin + url.pathname;
}

export function safePageReferrer(origin: string, referrer: string) {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.origin !== origin) return url.origin + "/";
    return canTrackPage(url.pathname) ? url.origin + url.pathname : url.origin + "/";
  } catch {
    return undefined;
  }
}

function clearAnalyticsCookies() {
  try {
    const names = (document.cookie ?? "")
      .split(";")
      .map((cookie) => cookie.trim().split("=")[0])
      .filter((name) => /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name));
    const domains = [""];
    if (/^(?:[a-z0-9-]+\.)*siriranee\.com$/i.test(window.location.hostname)) {
      domains.push("; Domain=siriranee.com", "; Domain=.siriranee.com");
    }

    for (const name of names) {
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax`;
      }
    }
  } catch {
    // Restrictive browser settings may block cookie access.
  }
}

export function startGoogleAnalytics() {
  if (typeof window === "undefined" || started) return;

  try {
    const browser = window as GoogleTagWindow;
    browser.dataLayer ??= [];
    browser.gtag ??= (...args: unknown[]) => {
      browser.dataLayer?.push(args);
    };

    browser.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    browser.gtag("js", new Date());
    browser.gtag("config", googleMeasurementId, {
      send_page_view: false,
      page_location: publicPageLocation(window.location.origin, window.location.pathname),
    });
    started = true;
  } catch {
    // Analytics is optional and must not affect site functionality.
  }
}

export function trackPublicPage(pathname: string) {
  if (typeof window === "undefined" || !started || !canTrackPage(pathname)) return;

  const location = publicPageLocation(window.location.origin, pathname);
  if (location === lastPageLocation) return;

  const browser = window as GoogleTagWindow;
  const referrer = lastPageLocation || safePageReferrer(window.location.origin, document.referrer);
  try {
    browser.gtag?.("event", "page_view", {
      send_to: googleMeasurementId,
      page_location: location,
      ...(referrer ? { page_referrer: referrer } : {}),
      page_title: document.title,
    });
    lastPageLocation = location;
  } catch {
    // Navigation must remain usable even if the analytics library fails.
  }
}

export function trackBookingRequest(
  reference: string,
  serviceSlug: string,
  durationMinutes: number,
) {
  if (
    typeof window === "undefined" ||
    !started ||
    !reference ||
    recordedBookings.has(reference)
  ) return;

  const browser = window as GoogleTagWindow;
  if (!browser.gtag) return;

  try {
    browser.gtag("event", "generate_lead", {
      send_to: googleMeasurementId,
      lead_source: "website_booking",
      service_slug: serviceSlug,
      duration_minutes: durationMinutes,
    });
    recordedBookings.add(reference);
  } catch {
    // Analytics must never interrupt a successfully saved booking request.
  }
}

export function stopGoogleAnalytics() {
  if (typeof window === "undefined") return;
  if (started) {
    try {
      (window as GoogleTagWindow).gtag?.("consent", "update", {
        analytics_storage: "denied",
      });
    } catch {
      // Continue withdrawing consent even if the analytics library fails.
    }
  }
  clearAnalyticsCookies();
  started = false;
  lastPageLocation = "";
}
