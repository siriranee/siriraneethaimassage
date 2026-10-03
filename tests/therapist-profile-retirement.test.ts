import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { CmsContentState } from "../src/domain/cms/types";
import { compareCmsTeamMembersByName } from "../src/domain/cms/team";

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

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function sourceSection(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source section end: ${end}`);
  return value.slice(startIndex, endIndex);
}

const retiredFields = [
  "biography",
  "specialties",
  "languages",
  "sortOrder",
] as const;

test("retired therapist fields are absent from models, APIs and CMS screens", async () => {
  const [
    cmsTypes,
    publicTypes,
    defaults,
    validation,
    contentService,
    publicAdapter,
    teamEditor,
    teamPage,
    teamStyles,
  ] = await Promise.all([
    source("src/domain/cms/types.ts"),
    source("src/domain/public-site.ts"),
    source("src/server/cms/default-content.ts"),
    source("src/server/cms/content-validation.ts"),
    source("src/server/cms/content-service.ts"),
    source("src/server/cms/public-adapter.ts"),
    source("src/components/cms/TeamEditorForm.tsx"),
    source("src/app/cms/(protected)/team/page.tsx"),
    source("src/app/cms/(protected)/team/page.module.css"),
  ]);

  const cmsTeamRecord = sourceSection(
    cmsTypes,
    "export type CmsTeamRecord",
    "export type CmsTherapistContact",
  );
  const publicTeamRecord = sourceSection(
    publicTypes,
    "export type PublicTeamMember",
    "export type PublicVoucher",
  );
  const defaultTeam = sourceSection(defaults, "const team:", "const vouchers:");
  const teamValidation = sourceSection(
    validation,
    "export function parseTeamUpdate",
    "export function parsePromotionUpdate",
  );
  const teamNormalizer = sourceSection(
    contentService,
    "function normaliseTeamRecords",
    "function normaliseCmsContent",
  );
  const publicTeamMapper = sourceSection(
    publicAdapter,
    "export const getPublicTeam",
    "export const getPublicPromotions",
  );

  for (const field of retiredFields) {
    const property = new RegExp(`\\b${field}\\s*:`);
    assert.doesNotMatch(cmsTeamRecord, property);
    assert.doesNotMatch(defaultTeam, property);
    assert.doesNotMatch(teamValidation, property);
    assert.doesNotMatch(teamNormalizer, property);
    assert.doesNotMatch(publicTeamMapper, property);
  }
  for (const field of retiredFields.slice(0, 3)) {
    assert.doesNotMatch(publicTeamRecord, new RegExp(`\\b${field}\\s*:`));
  }

  assert.doesNotMatch(
    teamEditor,
    /name="(?:biography|specialties|languages|sortOrder)"/,
  );
  assert.doesNotMatch(
    teamEditor,
    /Full biography|Specialties|Languages|Display order/,
  );
  assert.doesNotMatch(teamPage, /member\.specialties/);
  assert.doesNotMatch(teamStyles, /\.specialties/);
  assert.match(teamEditor, /name="shortBio"/);
  assert.match(teamEditor, /name="serviceIds"/);
});

test("legacy therapist data normalises without retired fields and preserves voucher order", async () => {
  const [{ normaliseCmsContent }, { createDefaultContentState }] =
    await Promise.all([
      import("@/server/cms/content-service"),
      import("@/server/cms/default-content"),
    ]);
  const defaults = createDefaultContentState();
  const legacyContent: CmsContentState = {
    ...defaults,
    schemaVersion: 8,
    team: defaults.team.map((member, index) => ({
      ...member,
      biography: `Legacy biography ${index}`,
      specialties: ["Legacy specialty"],
      languages: ["English"],
      sortOrder: index + 50,
    })) as unknown as CmsContentState["team"],
    vouchers: [
      {
        id: "voucher-order-regression",
        title: "Voucher order regression",
        imageUrl: "/images/gift-card.webp",
        imageAlt: "Siriranee gift voucher",
        status: "published",
        sortOrder: 37,
        version: 1,
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
  };

  const normalised = normaliseCmsContent(legacyContent);
  assert.equal(normalised.schemaVersion, 9);
  for (const member of normalised.team) {
    const stored = member as unknown as Record<string, unknown>;
    for (const field of retiredFields) {
      assert.equal(Object.hasOwn(stored, field), false, field);
    }
  }
  assert.deepEqual(
    normalised.team.map(({ shortBio }) => shortBio),
    defaults.team.map(({ shortBio }) => shortBio),
  );
  assert.equal(normalised.vouchers?.[0]?.sortOrder, 37);
});

test("CMS and public team listings retain the shared alphabetical order", async () => {
  const consumers = await Promise.all([
    source("src/server/cms/public-adapter.ts"),
    source("src/app/cms/(protected)/team/page.tsx"),
    source("src/app/cms/(protected)/bookings/page.tsx"),
    source("src/app/cms/(protected)/bookings/new/page.tsx"),
    source("src/app/cms/(protected)/bookings/[bookingId]/page.tsx"),
  ]);
  for (const consumer of consumers) {
    assert.match(consumer, /\.sort\(compareCmsTeamMembersByName\)/);
  }

  const therapists = [
    { id: "siriranee", name: "Siriranee" },
    { id: "mon", name: "Mon (Ubon)" },
  ];
  assert.deepEqual(
    [...therapists].sort(compareCmsTeamMembersByName).map(({ id }) => id),
    ["mon", "siriranee"],
  );
});

test("booking therapists keep oldest-added order through filtering and profile edits", async () => {
  const [{ buildPublicBookingPlannerData }, { createDefaultContentState }] =
    await Promise.all([
      import("@/server/booking/public-config"),
      import("@/server/cms/default-content"),
    ]);
  const defaults = createDefaultContentState();
  const serviceId = "test-massage";
  const member = {
    fullName: "Test therapist",
    publicRole: "Massage therapist",
    shortBio: "",
    imageUrl: "",
    imageAlt: "",
    serviceIds: [serviceId],
    publicProfile: true,
    operationalActive: true,
    version: 1,
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const content: CmsContentState = {
    ...defaults,
    services: [{
      id: serviceId,
      slug: serviceId,
      name: "Test massage",
      shortDescription: "Test treatment",
      longDescription: "Test treatment",
      imageUrl: "",
      imageAlt: "",
      hero: { imageUrl: "", altText: "" },
      galleryImages: [],
      prices: [{ id: "one-hour", durationMinutes: 60, priceCents: 6500, active: true }],
      idealFor: [],
      highlights: [],
      priceNote: "",
      seoTitle: "Test massage",
      seoDescription: "Test treatment",
      version: 1,
      createdAt: member.updatedAt,
      updatedAt: member.updatedAt,
    }],
    team: [
      { ...member, id: "archived", slug: "archived", name: "Archived", archived: true },
      { ...member, id: "mon", slug: "mon-ubon", name: "Mon (Ubon)" },
      { ...member, id: "new", slug: "new", name: "A new therapist" },
      { ...member, id: "siriranee", slug: "siriranee", name: "Siriranee", updatedAt: "2026-09-19T00:00:00.000Z" },
      { ...member, id: "newest", slug: "newest", name: "Another new therapist" },
      { ...member, id: "private", slug: "private", name: "Private", publicProfile: false },
      { ...member, id: "inactive", slug: "inactive", name: "Inactive", operationalActive: false },
      { ...member, id: "unavailable", slug: "unavailable", name: "Unavailable", serviceIds: [] },
    ],
  };
  const original = structuredClone(content);
  assert.deepEqual(
    buildPublicBookingPlannerData(content).therapists.map(({ name }) => name),
    ["Siriranee", "Mon (Ubon)", "A new therapist", "Another new therapist"],
  );
  assert.deepEqual(content, original, "The stored team order must not be mutated");
});

test("stored therapist field cleanup is review-gated, transactional and verified", async () => {
  const migration = await source("scripts/remove-retired-therapist-fields.ts");
  const readPlan = sourceSection(
    migration,
    "async function readPlan",
    "function migrationNeeded",
  );

  assert.match(migration, /--apply --expected-plan=<printed-hash>/);
  assert.doesNotMatch(readPlan, /Promise\.all/);
  assert.match(migration, /session\.withTransaction/);
  assert.match(migration, /plan\.planHash !== expectedPlan/);
  assert.match(migration, /migrationTargetSchemaVersion = 9/);
  assert.match(migration, /currentSourceSchemaVersions = new Set\(\[8,/);
  assert.match(migration, /unsetFields\("team"\)/);
  assert.match(migration, /unsetFields\("snapshot\.team"\)/);
  assert.match(migration, /therapistProfileSchemaVersion/);
  assert.match(migration, /assertMigrationComplete\(remaining, "In-transaction"\)/);
  assert.match(migration, /assertMigrationComplete\(committed, "Post-commit"\)/);
  assert.match(migration, /team\.fields-retired/);
  assert.match(migration, /expiresAtDate: getCmsAuditExpiryDate/);
});
