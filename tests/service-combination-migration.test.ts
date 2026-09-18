import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type {
  CmsContentState,
  CmsPublication,
  CmsServiceRecord,
} from "../src/domain/cms/types";
import {
  assertMergedTreatmentContent,
  buildMergedTreatmentContent,
  createServiceMergePlan,
  FOOT_REFLEXOLOGY_SPA_ID,
  HEAD_SPA_ID,
  MERGED_SERVICE_ID,
  MERGED_SERVICE_NAME,
  MERGED_SERVICE_SLUG,
  serviceMergePlanHash,
  type ServiceMergeBooking,
} from "../scripts/merge-foot-back-neck-head-lib";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? {
          shortCircuit: true,
          url: pathToFileURL(
            `${process.cwd()}/tests/support/server-only-stub.mjs`,
          ).href,
        }
      : nextResolve(specifier, context);
  },
});

const timestamp = "2026-09-18T00:00:00.000Z";

function service(
  id: string,
  name: string,
  durationMinutes: number,
  priceCents: number,
): CmsServiceRecord {
  return {
    id,
    slug: id,
    name,
    shortDescription: `${name} short description for migration testing.`,
    longDescription: `${name} long description for migration testing and safe preservation.`,
    imageUrl: `https://res.cloudinary.com/test/image/upload/v1/siriranee/cms/assets/${id}.webp`,
    imageAlt: `${name} treatment image`,
    hero: {
      imageUrl: `https://res.cloudinary.com/test/image/upload/v1/siriranee/cms/assets/${id}-hero.webp`,
      altText: `${name} hero image`,
    },
    galleryImages:
      id === MERGED_SERVICE_ID
        ? [1, 2, 3].map((index) => ({
            id: `back-gallery-${index}`,
            imageUrl: `https://res.cloudinary.com/test/image/upload/v1/siriranee/cms/assets/back-gallery-${index}.webp`,
            altText: `Back and neck gallery image ${index}`,
            caption: index === 3 ? "A focused 30-minute treatment." : "Focused treatment.",
          }))
        : [],
    prices: [
      {
        id: `${id}-${durationMinutes}`,
        durationMinutes,
        priceCents,
        active: true,
      },
    ],
    idealFor: ["Migration test"],
    highlights: ["Migration test"],
    priceNote: "",
    seoTitle: `${name} | Siriranee`,
    seoDescription: `${name} in Howth.`,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function fixture() {
  const { createDefaultContentState } = await import(
    "@/server/cms/default-content"
  );
  const defaults = createDefaultContentState();
  const content: CmsContentState = {
    ...defaults,
    schemaVersion: 9,
    revision: 22,
    services: [
      service("traditional-thai-massage", "Traditional Thai Massage", 60, 6_500),
      service(MERGED_SERVICE_ID, "Back & Neck Massage", 30, 4_000),
      service(HEAD_SPA_ID, "Head Spa", 60, 6_500),
      service(FOOT_REFLEXOLOGY_SPA_ID, "Foot & Reflexology Spa", 60, 6_500),
    ],
    team: defaults.team.slice(0, 2).map((member, index) => ({
      ...member,
      id: `therapist-${index + 1}`,
      slug: `therapist-${index + 1}`,
      serviceIds: [
        "traditional-thai-massage",
        MERGED_SERVICE_ID,
        HEAD_SPA_ID,
        FOOT_REFLEXOLOGY_SPA_ID,
      ],
    })),
    vouchers: [
      {
        id: "voucher-order",
        title: "Voucher",
        imageUrl: "/images/voucher.webp",
        imageAlt: "Voucher",
        status: "published",
        sortOrder: 41,
        version: 1,
        updatedAt: timestamp,
      },
    ],
  };
  const publication: CmsPublication = {
    id: "publication-22",
    revision: content.revision,
    publishedAt: timestamp,
    publishedBy: "administrator",
    snapshot: structuredClone(content),
  };
  const bookings: ServiceMergeBooking[] = [
    {
      id: "existing-back-neck-booking",
      serviceId: MERGED_SERVICE_ID,
      serviceName: "Back & Neck Massage",
      durationMinutes: 30,
      priceCents: 4_000,
      status: "confirmed",
      version: 2,
      localDate: "2026-09-19",
      startsAt: "2026-09-19T10:00:00.000Z",
      endsAt: "2026-09-19T10:30:00.000Z",
    },
  ];
  return { content, publication, bookings };
}

test("three treatments merge into one 60-minute €65 service without changing bookings", async () => {
  const { content, publication, bookings } = await fixture();
  const bookingsBefore = structuredClone(bookings);
  const plan = createServiceMergePlan(
    "siriranee-test",
    content,
    publication,
    bookings,
  );
  assert.equal(plan.migrationNeeded, true);
  assert.equal(plan.actions.servicesBefore, 4);
  assert.equal(plan.actions.servicesAfter, 2);
  assert.equal(plan.actions.bookingsPreserved, 1);
  assert.equal(plan.actions.activeRemovedServiceBookings, 0);
  assert.match(serviceMergePlanHash(plan), /^[a-f0-9]{64}$/);

  const next = buildMergedTreatmentContent(content, {
    now: "2026-09-18T01:00:00.000Z",
    actorId: "system:test",
  });
  assertMergedTreatmentContent(next, plan.actions.affectedTherapistIds);
  assert.equal(next.revision, 23);
  assert.equal(next.services.length, 2);
  const combined = next.services.find(({ id }) => id === MERGED_SERVICE_ID);
  assert.ok(combined);
  assert.equal(combined.slug, MERGED_SERVICE_SLUG);
  assert.equal(combined.name, MERGED_SERVICE_NAME);
  assert.deepEqual(combined.prices, [
    {
      id: "foot-massage-back-neck-head-60",
      durationMinutes: 60,
      priceCents: 6_500,
      active: true,
    },
  ]);
  assert.match(combined.imageUrl, /foot-reflexology-spa\.webp$/);
  assert.match(combined.hero.imageUrl, /head-spa\.webp$/);
  assert.equal(combined.galleryImages.length, 3);
  assert.equal(next.vouchers?.[0]?.sortOrder, 41);
  assert.deepEqual(bookings, bookingsBefore);
  assert.ok(
    next.team.every(
      (member) =>
        member.serviceIds.includes(MERGED_SERVICE_ID) &&
        !member.serviceIds.includes(HEAD_SPA_ID) &&
        !member.serviceIds.includes(FOOT_REFLEXOLOGY_SPA_ID),
    ),
  );

  const mergedPublication = {
    ...publication,
    revision: next.revision,
    snapshot: structuredClone(next),
  };
  const verified = createServiceMergePlan(
    "siriranee-test",
    next,
    mergedPublication,
    bookings,
  );
  assert.equal(verified.migrationNeeded, false);
});

test("merge fails closed when a removed treatment still has an active booking", async () => {
  const { content, publication, bookings } = await fixture();
  const blocked: ServiceMergeBooking = {
    ...bookings[0],
    id: "head-spa-booking",
    serviceId: HEAD_SPA_ID,
    serviceName: "Head Spa",
    durationMinutes: 60,
    priceCents: 6_500,
    status: "pending",
  };
  assert.throws(
    () =>
      createServiceMergePlan(
        "siriranee-test",
        content,
        publication,
        [...bookings, blocked],
      ),
    /Review those appointments before merging/,
  );
});

test("redirects and public copy use the combined treatment", async () => {
  const [nextConfig, home, promotions, site, pageCopy, rendered] =
    await Promise.all([
      readFile(resolve(process.cwd(), "next.config.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/app/(site)/page.tsx"), "utf8"),
      readFile(
        resolve(process.cwd(), "src/app/(site)/promotions/page.tsx"),
        "utf8",
      ),
      readFile(resolve(process.cwd(), "src/content/site.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/content/page-copy.ts"), "utf8"),
      readFile(
        resolve(process.cwd(), "scripts/validate-rendered-site.mjs"),
        "utf8",
      ),
    ]);
  for (const source of [
    "neck-shoulder-upper-back-massage",
    "head-spa",
    "foot-reflexology-spa",
    "back-neck-massage",
    "head-massage",
    "foot-massage-reflexology",
  ]) {
    assert.match(nextConfig, new RegExp(`/services/${source}`));
  }
  assert.match(nextConfig, new RegExp(`/services/${MERGED_SERVICE_SLUG}`));
  assert.match(rendered, new RegExp(`/services/${MERGED_SERVICE_SLUG}`));
  for (const copy of [home, promotions, site, pageCopy]) {
    assert.match(copy, /foot\s+massage\s+including\s+back,\s+neck\s+and\s+head/i);
  }
});
