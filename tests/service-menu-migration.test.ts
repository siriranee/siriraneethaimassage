import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type {
  CmsContentState,
  CmsPublication,
  CmsServiceRecord,
  CmsTeamRecord,
} from "../src/domain/cms/types";
import {
  assertMigratedTreatmentContent,
  assertTreatmentMigrationSourceState,
  buildMigratedTreatmentContent,
  createTreatmentMenuMigrationPlan,
  FOOT_REFLEXOLOGY_SPA_ID,
  HEAD_SPA_ID,
  treatmentContentTemplate,
  treatmentImageSources,
  treatmentMenuPlanHash,
} from "../scripts/migrate-treatment-menu-lib";

const now = "2026-09-17T08:00:00.000Z";
const imageUrls = {
  "head-spa":
    "https://res.cloudinary.com/demo/image/upload/v100/siriranee/cms/assets/head.webp",
  "back-neck-massage":
    "https://res.cloudinary.com/demo/image/upload/v100/siriranee/cms/assets/back.webp",
  "foot-reflexology-spa":
    "https://res.cloudinary.com/demo/image/upload/v100/siriranee/cms/assets/foot.webp",
} as const;

function service(
  id: string,
  slug: string,
  overrides: Partial<CmsServiceRecord> = {},
): CmsServiceRecord {
  return {
    id,
    slug,
    name: slug === "neck-shoulder-upper-back-massage"
      ? "Neck, Shoulder & Upper Back Massage"
      : "Existing treatment",
    shortDescription: "An existing treatment description that stays unchanged.",
    longDescription:
      "An existing, carefully written treatment description that must remain unchanged by this focused migration.",
    imageUrl: "/images/existing.webp",
    imageAlt: "Existing treatment image description",
    hero: {
      imageUrl: "/images/existing-hero.webp",
      altText: "Existing treatment hero image description",
    },
    galleryImages: [
      {
        id: "existing-gallery",
        imageUrl: "/images/existing-gallery.webp",
        altText: "Existing treatment gallery image",
        caption: "Existing treatment room",
      },
    ],
    prices: [
      {
        id: `${id}-30`,
        durationMinutes: 30,
        priceCents: 4_000,
        active: true,
      },
    ],
    idealFor: ["Existing audience"],
    highlights: ["Existing highlight"],
    priceNote: "Existing price note",
    seoTitle: "Existing Treatment in Howth | Siriranee",
    seoDescription:
      "Existing treatment description for search results at Siriranee Thai Massage in Howth.",
    version: 3,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function therapist(
  id: string,
  name: string,
  overrides: Partial<CmsTeamRecord> = {},
): CmsTeamRecord {
  return {
    id,
    slug: id,
    name,
    fullName: name,
    publicRole: "Massage therapist",
    shortBio: "Existing introduction",
    imageUrl: "",
    imageAlt: "",
    serviceIds: ["existing", "back-neck-id"],
    publicProfile: true,
    operationalActive: true,
    archived: false,
    version: 2,
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function fixture() {
  const content = {
    id: "siriranee-content",
    schemaVersion: 8,
    revision: 18,
    services: [
      service("existing", "existing-treatment", {
        prices: [
          {
            id: "existing-60",
            durationMinutes: 60,
            priceCents: 6_500,
            active: true,
          },
        ],
      }),
      service("back-neck-id", "neck-shoulder-upper-back-massage"),
    ],
    site: { name: "Siriranee", weeklyHours: [] },
    bookingSettings: { timezone: "Europe/Dublin" },
    team: [
      therapist("siriranee-id", "Siriranee"),
      therapist("ubon", "Mon (Ubon)"),
      therapist("archived", "Former therapist", {
        operationalActive: false,
        archived: true,
        publicProfile: false,
        serviceIds: [],
      }),
    ],
    promotions: [],
    vouchers: [],
    updatedAt: "2026-09-16T00:00:00.000Z",
    updatedBy: "admin-id",
  } as unknown as CmsContentState;
  const publication: CmsPublication = {
    id: "publication-18",
    revision: content.revision,
    publishedAt: "2026-09-16T00:00:01.000Z",
    publishedBy: "admin-id",
    snapshot: structuredClone(content),
  };
  return { content, publication };
}

const imageDigests = treatmentImageSources.map((source, index) => ({
  key: source.key,
  path: source.path,
  bytes: 1_000 + index,
  sha256: String(index + 1).repeat(64),
}));

test("review plan binds exact source state, image bytes and desired content template", () => {
  const { content, publication } = fixture();
  const publicationWithReorderedTeam: CmsPublication = {
    ...publication,
    snapshot: {
      ...publication.snapshot,
      team: [...publication.snapshot.team].reverse(),
    },
  };
  const first = createTreatmentMenuMigrationPlan(
    content,
    publicationWithReorderedTeam,
    imageDigests,
  );
  const second = createTreatmentMenuMigrationPlan(
    structuredClone(content),
    structuredClone(publicationWithReorderedTeam),
    structuredClone(imageDigests),
  );
  assert.equal(treatmentMenuPlanHash(first), treatmentMenuPlanHash(second));
  assert.match(first.contentTemplateSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.actions.extendActiveTherapists.length, 2);

  const changedImage = imageDigests.map((image, index) =>
    index === 0 ? { ...image, sha256: "f".repeat(64) } : image,
  );
  const changed = createTreatmentMenuMigrationPlan(
    content,
    publicationWithReorderedTeam,
    changedImage,
  );
  assert.notEqual(treatmentMenuPlanHash(first), treatmentMenuPlanHash(changed));
});

test("migration updates the existing treatment in place and appends two bookable services", () => {
  const { content } = fixture();
  const existingUntouched = content.services[0];
  const existingBackNeck = content.services[1];
  const archivedTherapist = content.team[2];
  const next = buildMigratedTreatmentContent(content, imageUrls, {
    now,
    actorId: "admin-id",
  });

  assert.equal(next.revision, 19);
  assert.equal(next.services.length, 4);
  assert.equal(next.services[0], existingUntouched);
  assert.equal(next.team[2], archivedTherapist);

  const backNeck = next.services.find(
    (item) => item.slug === "neck-shoulder-upper-back-massage",
  )!;
  assert.equal(backNeck.id, existingBackNeck.id);
  assert.equal(backNeck.slug, existingBackNeck.slug);
  assert.equal(backNeck.name, "Back & Neck Massage");
  assert.deepEqual(backNeck.prices, existingBackNeck.prices);
  assert.deepEqual(backNeck.galleryImages, existingBackNeck.galleryImages);
  assert.equal(backNeck.priceNote, existingBackNeck.priceNote);
  assert.equal(backNeck.imageAlt, treatmentContentTemplate.backNeck.imageAlt);
  assert.equal(backNeck.hero.altText, treatmentContentTemplate.backNeck.imageAlt);

  const headSpa = next.services.find((item) => item.id === HEAD_SPA_ID)!;
  const footSpa = next.services.find(
    (item) => item.id === FOOT_REFLEXOLOGY_SPA_ID,
  )!;
  assert.deepEqual(
    headSpa.prices.map(({ durationMinutes, priceCents, active }) => ({
      durationMinutes,
      priceCents,
      active,
    })),
    [{ durationMinutes: 60, priceCents: 6_500, active: true }],
  );
  assert.deepEqual(
    footSpa.prices.map(({ durationMinutes, priceCents, active }) => ({
      durationMinutes,
      priceCents,
      active,
    })),
    [{ durationMinutes: 60, priceCents: 6_500, active: true }],
  );
  assert.deepEqual(headSpa.galleryImages, []);
  assert.deepEqual(footSpa.galleryImages, []);
  assert.equal(headSpa.imageAlt, treatmentContentTemplate.headSpa.imageAlt);
  assert.equal(footSpa.imageAlt, treatmentContentTemplate.footSpa.imageAlt);

  for (const member of next.team.slice(0, 2)) {
    assert.deepEqual(member.serviceIds.slice(0, 2), ["existing", "back-neck-id"]);
    assert.equal(member.serviceIds.at(-2), HEAD_SPA_ID);
    assert.equal(member.serviceIds.at(-1), FOOT_REFLEXOLOGY_SPA_ID);
  }
  assert.doesNotThrow(() => assertMigratedTreatmentContent(next, imageUrls));
});

test("migration fails closed for editorial drift, collisions or a third active therapist", () => {
  const { content, publication } = fixture();
  assert.throws(
    () =>
      assertTreatmentMigrationSourceState(
        { ...content, updatedBy: "someone-else" },
        publication,
      ),
    /do not match exactly/,
  );
  assert.throws(
    () =>
      buildMigratedTreatmentContent(
        {
          ...content,
          services: [
            ...content.services,
            service(HEAD_SPA_ID, "another-head-spa"),
          ],
        },
        imageUrls,
        { now, actorId: "admin-id" },
      ),
    /already exists/,
  );
  assert.throws(
    () =>
      buildMigratedTreatmentContent(
        {
          ...content,
          team: [...content.team, therapist("third", "Third therapist")],
        },
        imageUrls,
        { now, actorId: "admin-id" },
      ),
    /exactly the active therapists/,
  );
});

test("CLI uses the staged media workflow and one content-publication transaction", async () => {
  const source = await readFile(
    resolve(process.cwd(), "scripts/migrate-treatment-menu.ts"),
    "utf8",
  );
  assert.match(source, /createSignedCmsMediaUpload/);
  assert.match(source, /completeCmsMediaUpload/);
  assert.match(source, /commitCmsMediaForContentMutation/);
  assert.match(source, /rollbackCmsMediaSubmission/);
  assert.match(source, /cleanupCmsMediaUpload/);
  assert.match(source, /transactionSession\.withTransaction/);
  const transaction = source.slice(
    source.indexOf("transactionSession.withTransaction"),
    source.indexOf("await transactionSession.endSession"),
  );
  assert.match(transaction, /commitCmsMediaForContentMutation/);
  assert.match(transaction, /transaction\.saveContent/);
  assert.match(transaction, /transaction\.savePublication/);
  assert.match(transaction, /appendCmsAudit/);
  assert.doesNotMatch(transaction, /Promise\.all/);
  assert.doesNotMatch(source, /cmsBookings|saveBooking|deleteBooking/);
  assert.match(source, /bookingsChanged:\s*0/);
  assert.match(source, /emailsSent:\s*0/);
  assert.match(source, /cmsMeta/);
});
