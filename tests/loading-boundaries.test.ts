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
