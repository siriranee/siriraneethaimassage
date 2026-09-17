import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("inherited loading boundaries cover every public and CMS page", async () => {
  const boundaries = [
    ["src/app/loading.tsx", "initial"],
    ["src/app/(site)/loading.tsx", "public"],
    ["src/app/cms/loading.tsx", "cms"],
    ["src/app/cms/(protected)/loading.tsx", "cms-content"],
  ] as const;

  for (const [path, variant] of boundaries) {
    await access(resolve(process.cwd(), path));
    assert.match(await source(path), new RegExp(`variant=["']${variant}["']`));
  }
});

test("loading UI is accessible, branded, responsive and motion-safe", async () => {
  const [component, styles] = await Promise.all([
    source("src/components/RouteLoading.tsx"),
    source("src/components/RouteLoading.module.css"),
  ]);

  assert.match(component, /role="status"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-busy="true"/);
  assert.match(component, /src="\/siriranee_logo\.svg"/);
  assert.match(component, /Loading page content\./);
  assert.match(component, /Loading CMS content\./);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation:\s*none/);
});

test("route transitions show feedback for links, redirects and browser history", async () => {
  const [instrumentation, indicator, indicatorStyles, rootLayout, cmsLayout] =
    await Promise.all([
      source("src/instrumentation-client.ts"),
      source("src/components/RouteTransitionIndicator.tsx"),
      source("src/components/RouteTransitionIndicator.module.css"),
      source("src/app/layout.tsx"),
      source("src/app/cms/(protected)/layout.tsx"),
    ]);

  assert.match(instrumentation, /export function onRouterTransitionStart/);
  assert.match(instrumentation, /navigationType: RouteTransitionNavigation/);
  assert.match(instrumentation, /startedAt: performance\.now\(\)/);
  assert.match(instrumentation, /ROUTE_TRANSITION_START_EVENT/);
  assert.match(instrumentation, /ROUTE_TRANSITION_ATTRIBUTE/);
  assert.match(indicator, /usePathname/);
  assert.match(indicator, /useSearchParams/);
  assert.match(indicator, /pageshow/);
  assert.match(indicator, /TRANSITION_WATCHDOG_MS/);
  assert.match(indicator, /MINIMUM_VISIBLE_MS/);
  assert.match(indicatorStyles, /html\[data-route-transition\]/);
  assert.match(indicatorStyles, /prefers-reduced-motion/);
  assert.match(rootLayout, /<RouteTransitionIndicator \/>/);
  assert.match(rootLayout, /<Suspense fallback=\{null\}>/);
  assert.match(cmsLayout, /<Suspense fallback=\{<RouteLoading variant="cms" \/>\}>/);
});
