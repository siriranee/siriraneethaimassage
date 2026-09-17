import { createHash } from "node:crypto";

import type {
  CmsContentState,
  CmsPublication,
  CmsServiceRecord,
  CmsTeamRecord,
} from "../src/domain/cms/types";

export const TREATMENT_MENU_MIGRATION_VERSION = 1 as const;
export const EXISTING_BACK_NECK_SLUG = "neck-shoulder-upper-back-massage";
export const HEAD_SPA_ID = "head-spa";
export const FOOT_REFLEXOLOGY_SPA_ID = "foot-reflexology-spa";

export const treatmentImageSources = [
  {
    key: "head-spa",
    path: "public/images/spa/head-spa.webp",
    fileName: "head-spa.webp",
  },
  {
    key: "back-neck-massage",
    path: "public/images/spa/back-neck-massage.webp",
    fileName: "back-neck-massage.webp",
  },
  {
    key: "foot-reflexology-spa",
    path: "public/images/spa/foot-reflexology-spa.webp",
    fileName: "foot-reflexology-spa.webp",
  },
] as const;

export const treatmentContentTemplate = {
  backNeck: {
    name: "Back & Neck Massage",
    shortDescription:
      "A focused massage for the back, neck and shoulders, tailored to the pressure that feels comfortable for you.",
    longDescription:
      "This focused treatment gives dedicated time to the back, neck and shoulder area using steady, unhurried massage techniques. Your therapist will check your preferred pressure and adapt the session for comfort, making it a practical choice when you want attention on the upper body without booking a full-body treatment.",
    imageAlt:
      "Therapist applying focused pressure to a client’s upper back and neck.",
    idealFor: [
      "Guests who prefer a focused upper-body treatment",
      "A shorter massage centred on the back, neck and shoulders",
      "Anyone who wants pressure tailored throughout the session",
    ],
    highlights: [
      "Focused back, neck and shoulder massage",
      "Pressure adapted to your comfort",
      "A practical 30-minute treatment",
    ],
    seoTitle: "Back & Neck Massage in Howth | Siriranee",
    seoDescription:
      "Book a 30-minute back and neck massage at Siriranee Thai Massage in Howth, with pressure adapted to your comfort.",
    durationMinutes: 30,
    priceCents: 4_000,
  },
  headSpa: {
    id: HEAD_SPA_ID,
    slug: HEAD_SPA_ID,
    name: "Head Spa",
    shortDescription:
      "A calming scalp-focused spa ritual with gentle cleansing, warm water and relaxing head massage.",
    longDescription:
      "Settle into a quiet head spa ritual designed for comfort and relaxation. The treatment combines gentle scalp cleansing, warm water and unhurried massage across the scalp, head, neck and shoulders. Please tell your therapist about any sensitivities before your appointment so the experience can be adapted for you.",
    imageAlt:
      "Therapist massaging a reclining client’s scalp during a head spa treatment.",
    idealFor: [
      "Guests looking for a calming scalp-focused ritual",
      "A relaxing reset for the head, neck and shoulders",
      "Anyone who enjoys gentle, unhurried spa care",
    ],
    highlights: [
      "Gentle scalp cleansing and massage",
      "Comforting warm-water ritual",
      "Head, neck and shoulder focus",
    ],
    seoTitle: "Head Spa in Howth | Siriranee Thai Massage",
    seoDescription:
      "Discover a calming 60-minute head spa in Howth with gentle scalp care, warm water and relaxing head, neck and shoulder massage.",
    durationMinutes: 60,
    priceCents: 6_500,
  },
  footSpa: {
    id: FOOT_REFLEXOLOGY_SPA_ID,
    slug: FOOT_REFLEXOLOGY_SPA_ID,
    name: "Foot & Reflexology Spa",
    shortDescription:
      "A soothing foot spa and reflexology-inspired massage, with pressure tailored to your comfort.",
    longDescription:
      "Take time out with a soothing foot spa followed by a reflexology-inspired massage for the feet and lower legs. The session uses measured pressure and flowing massage techniques, always adjusted to your comfort. It is a gentle choice when you want a grounded, restful treatment focused below the knee.",
    imageAlt:
      "Therapist using thumb pressure on a client’s foot during a reflexology treatment.",
    idealFor: [
      "Guests who prefer a treatment focused on feet and lower legs",
      "A quiet and grounding spa experience",
      "Anyone who wants pressure adjusted throughout the session",
    ],
    highlights: [
      "Soothing foot spa ritual",
      "Reflexology-inspired foot massage",
      "Comfort-led pressure and pacing",
    ],
    seoTitle: "Foot & Reflexology Spa in Howth | Siriranee",
    seoDescription:
      "Book a 60-minute foot and reflexology spa in Howth, combining a soothing foot ritual with comfort-led foot and lower-leg massage.",
    durationMinutes: 60,
    priceCents: 6_500,
  },
} as const;

export type TreatmentImageKey = (typeof treatmentImageSources)[number]["key"];

export type TreatmentImageDigest = {
  readonly key: TreatmentImageKey;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
};

export type TreatmentImageUrls = Readonly<Record<TreatmentImageKey, string>>;

type TreatmentMigrationBaseline = {
  readonly contentRevision: number;
  readonly contentSha256: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly publicationSha256: string;
};

export type TreatmentMenuMigrationPlan = {
  readonly migrationVersion: typeof TREATMENT_MENU_MIGRATION_VERSION;
  readonly contentTemplateSha256: string;
  readonly baseline: TreatmentMigrationBaseline;
  readonly imageSources: readonly TreatmentImageDigest[];
  readonly actions: {
    readonly updateService: {
      readonly slug: typeof EXISTING_BACK_NECK_SLUG;
      readonly name: "Back & Neck Massage";
      readonly durationMinutes: 30;
      readonly priceCents: 4_000;
    };
    readonly addServices: readonly [
      {
        readonly id: typeof HEAD_SPA_ID;
        readonly slug: typeof HEAD_SPA_ID;
        readonly durationMinutes: 60;
        readonly priceCents: 6_500;
      },
      {
        readonly id: typeof FOOT_REFLEXOLOGY_SPA_ID;
        readonly slug: typeof FOOT_REFLEXOLOGY_SPA_ID;
        readonly durationMinutes: 60;
        readonly priceCents: 6_500;
      },
    ];
    readonly extendActiveTherapists: readonly {
      readonly id: string;
      readonly name: string;
    }[];
  };
};

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, nested]) => [key, canonicalise(nested)]),
  );
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalise(value));
}

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function contentStateHash(content: CmsContentState) {
  // Team records are identity-based and consumers display them alphabetically.
  // Immediate publication can move an edited record without changing state, so
  // compare this collection by ID while keeping service/menu order strict.
  const comparable = {
    ...content,
    team: [...content.team].sort((first, second) =>
      first.id.localeCompare(second.id),
    ),
  };
  return sha256(canonicalJson(comparable));
}

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IE");
}

function activeTherapists(content: CmsContentState) {
  const active = content.team.filter(
    (member) => member.operationalActive && !member.archived,
  );
  const expectedNames = ["mon (ubon)", "siriranee"];
  const actualNames = active.map((member) => normalizedName(member.name)).sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(
      "Expected exactly the active therapists Siriranee and Mon (Ubon); no changes were made.",
    );
  }
  return active;
}

function assertUniqueServiceIdentity(content: CmsContentState) {
  const ids = content.services.map((service) => service.id);
  const slugs = content.services.map((service) => service.slug);
  if (new Set(ids).size !== ids.length || new Set(slugs).size !== slugs.length) {
    throw new Error(
      "The current treatment menu contains duplicate IDs or slugs; no changes were made.",
    );
  }
}

function existingBackNeckService(content: CmsContentState) {
  const matches = content.services.filter(
    (service) => service.slug === EXISTING_BACK_NECK_SLUG,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${EXISTING_BACK_NECK_SLUG} treatment; no changes were made.`,
    );
  }
  const service = matches[0];
  if (
    service.prices.length !== 1 ||
    service.prices[0].durationMinutes !== 30 ||
    service.prices[0].priceCents !== 4_000 ||
    !service.prices[0].active
  ) {
    throw new Error(
      "The existing back-and-neck treatment is no longer the reviewed 30-minute, EUR 40 option; no changes were made.",
    );
  }
  return service;
}

function assertNewServiceSlotsAvailable(content: CmsContentState) {
  const targetIds = new Set([HEAD_SPA_ID, FOOT_REFLEXOLOGY_SPA_ID]);
  const targetSlugs = new Set([HEAD_SPA_ID, FOOT_REFLEXOLOGY_SPA_ID]);
  const collision = content.services.find(
    (service) => targetIds.has(service.id) || targetSlugs.has(service.slug),
  );
  if (collision) {
    throw new Error(
      `Treatment ID or slug ${collision.id}/${collision.slug} already exists; no duplicate was created.`,
    );
  }
}

export function assertMatchingCurrentPublication(
  content: CmsContentState,
  publication: CmsPublication | null,
) {
  if (!publication) {
    throw new Error(
      "An existing current CMS publication is required before treatment migration.",
    );
  }
  if (
    publication.revision !== content.revision ||
    publication.snapshot.revision !== content.revision ||
    contentStateHash(publication.snapshot) !== contentStateHash(content)
  ) {
    throw new Error(
      "The editable content and current publication do not match exactly; publish or reconcile them before this migration.",
    );
  }
}

export function assertTreatmentMigrationSourceState(
  content: CmsContentState,
  publication: CmsPublication | null,
) {
  assertMatchingCurrentPublication(content, publication);
  assertUniqueServiceIdentity(content);
  existingBackNeckService(content);
  assertNewServiceSlotsAvailable(content);
  return activeTherapists(content);
}

export function createTreatmentMenuMigrationPlan(
  content: CmsContentState,
  publication: CmsPublication,
  imageSources: readonly TreatmentImageDigest[],
): TreatmentMenuMigrationPlan {
  const therapists = assertTreatmentMigrationSourceState(content, publication);
  if (
    imageSources.length !== treatmentImageSources.length ||
    imageSources.some(
      (image, index) =>
        image.key !== treatmentImageSources[index].key ||
        image.path !== treatmentImageSources[index].path ||
        !Number.isSafeInteger(image.bytes) ||
        image.bytes < 1 ||
        !/^[a-f0-9]{64}$/.test(image.sha256),
    )
  ) {
    throw new Error("The generated treatment image manifest is incomplete or invalid.");
  }

  return {
    migrationVersion: TREATMENT_MENU_MIGRATION_VERSION,
    contentTemplateSha256: sha256(canonicalJson(treatmentContentTemplate)),
    baseline: {
      contentRevision: content.revision,
      contentSha256: contentStateHash(content),
      publicationId: publication.id,
      publicationRevision: publication.revision,
      publicationSha256: contentStateHash(publication.snapshot),
    },
    imageSources: imageSources.map((image) => ({ ...image })),
    actions: {
      updateService: {
        slug: EXISTING_BACK_NECK_SLUG,
        name: "Back & Neck Massage",
        durationMinutes: 30,
        priceCents: 4_000,
      },
      addServices: [
        {
          id: HEAD_SPA_ID,
          slug: HEAD_SPA_ID,
          durationMinutes: 60,
          priceCents: 6_500,
        },
        {
          id: FOOT_REFLEXOLOGY_SPA_ID,
          slug: FOOT_REFLEXOLOGY_SPA_ID,
          durationMinutes: 60,
          priceCents: 6_500,
        },
      ],
      extendActiveTherapists: therapists
        .map(({ id, name }) => ({ id, name }))
        .sort((first, second) => first.id.localeCompare(second.id)),
    },
  };
}

export function treatmentMenuPlanHash(plan: TreatmentMenuMigrationPlan) {
  return sha256(canonicalJson(plan));
}

export function assertTreatmentPlanStillMatches(
  plan: TreatmentMenuMigrationPlan,
  content: CmsContentState,
  publication: CmsPublication | null,
) {
  assertTreatmentMigrationSourceState(content, publication);
  if (
    !publication ||
    content.revision !== plan.baseline.contentRevision ||
    contentStateHash(content) !== plan.baseline.contentSha256 ||
    publication.id !== plan.baseline.publicationId ||
    publication.revision !== plan.baseline.publicationRevision ||
    contentStateHash(publication.snapshot) !== plan.baseline.publicationSha256
  ) {
    throw new Error(
      "The treatment migration plan changed after review; no content was changed.",
    );
  }
}

function assertImageUrls(imageUrls: TreatmentImageUrls) {
  for (const source of treatmentImageSources) {
    let parsed: URL;
    try {
      parsed = new URL(imageUrls[source.key]);
    } catch {
      throw new Error(`A verified HTTPS image URL is required for ${source.key}.`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error(`A verified HTTPS image URL is required for ${source.key}.`);
    }
  }
}

function updateBackNeckService(
  service: CmsServiceRecord,
  imageUrl: string,
  now: string,
): CmsServiceRecord {
  const template = treatmentContentTemplate.backNeck;
  return {
    ...service,
    name: template.name,
    shortDescription: template.shortDescription,
    longDescription: template.longDescription,
    imageUrl,
    imageAlt: template.imageAlt,
    hero: {
      imageUrl,
      altText: template.imageAlt,
    },
    idealFor: template.idealFor,
    highlights: template.highlights,
    seoTitle: template.seoTitle,
    seoDescription: template.seoDescription,
    version: service.version + 1,
    updatedAt: now,
  };
}

function newServiceRecords(
  imageUrls: TreatmentImageUrls,
  now: string,
): readonly [CmsServiceRecord, CmsServiceRecord] {
  const headSpa = treatmentContentTemplate.headSpa;
  const footSpa = treatmentContentTemplate.footSpa;
  return [
    {
      id: headSpa.id,
      slug: headSpa.slug,
      name: headSpa.name,
      shortDescription: headSpa.shortDescription,
      longDescription: headSpa.longDescription,
      imageUrl: imageUrls["head-spa"],
      imageAlt: headSpa.imageAlt,
      hero: {
        imageUrl: imageUrls["head-spa"],
        altText: headSpa.imageAlt,
      },
      galleryImages: [],
      prices: [
        {
          id: "head-spa-60",
          durationMinutes: headSpa.durationMinutes,
          priceCents: headSpa.priceCents,
          active: true,
        },
      ],
      idealFor: headSpa.idealFor,
      highlights: headSpa.highlights,
      priceNote: "",
      seoTitle: headSpa.seoTitle,
      seoDescription: headSpa.seoDescription,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: footSpa.id,
      slug: footSpa.slug,
      name: footSpa.name,
      shortDescription: footSpa.shortDescription,
      longDescription: footSpa.longDescription,
      imageUrl: imageUrls["foot-reflexology-spa"],
      imageAlt: footSpa.imageAlt,
      hero: {
        imageUrl: imageUrls["foot-reflexology-spa"],
        altText: footSpa.imageAlt,
      },
      galleryImages: [],
      prices: [
        {
          id: "foot-reflexology-spa-60",
          durationMinutes: footSpa.durationMinutes,
          priceCents: footSpa.priceCents,
          active: true,
        },
      ],
      idealFor: footSpa.idealFor,
      highlights: footSpa.highlights,
      priceNote: "",
      seoTitle: footSpa.seoTitle,
      seoDescription: footSpa.seoDescription,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function extendTherapistServices(member: CmsTeamRecord, now: string) {
  if (!member.operationalActive || member.archived) return member;
  return {
    ...member,
    serviceIds: [
      ...member.serviceIds,
      ...[HEAD_SPA_ID, FOOT_REFLEXOLOGY_SPA_ID].filter(
        (id) => !member.serviceIds.includes(id),
      ),
    ],
    version: member.version + 1,
    updatedAt: now,
  } satisfies CmsTeamRecord;
}

export function buildMigratedTreatmentContent(
  current: CmsContentState,
  imageUrls: TreatmentImageUrls,
  input: { readonly now: string; readonly actorId: string },
): CmsContentState {
  assertUniqueServiceIdentity(current);
  const backNeck = existingBackNeckService(current);
  assertNewServiceSlotsAvailable(current);
  activeTherapists(current);
  assertImageUrls(imageUrls);

  if (!Number.isFinite(Date.parse(input.now)) || !input.actorId.trim()) {
    throw new Error("A valid migration timestamp and actor are required.");
  }

  const added = newServiceRecords(imageUrls, input.now);
  return {
    ...current,
    revision: current.revision + 1,
    services: [
      ...current.services.map((service) =>
        service.id === backNeck.id
          ? updateBackNeckService(
              service,
              imageUrls["back-neck-massage"],
              input.now,
            )
          : service,
      ),
      ...added,
    ],
    team: current.team.map((member) =>
      extendTherapistServices(member, input.now),
    ),
    updatedAt: input.now,
    updatedBy: input.actorId,
  };
}

export function assertMigratedTreatmentContent(
  content: CmsContentState,
  imageUrls: TreatmentImageUrls,
) {
  assertUniqueServiceIdentity(content);
  const byId = new Map(content.services.map((service) => [service.id, service]));
  const backNeck = content.services.find(
    (service) => service.slug === EXISTING_BACK_NECK_SLUG,
  );
  const headSpa = byId.get(HEAD_SPA_ID);
  const footSpa = byId.get(FOOT_REFLEXOLOGY_SPA_ID);
  if (
    !backNeck ||
    backNeck.name !== "Back & Neck Massage" ||
    backNeck.imageUrl !== imageUrls["back-neck-massage"] ||
    backNeck.hero.imageUrl !== imageUrls["back-neck-massage"] ||
    !headSpa ||
    headSpa.slug !== HEAD_SPA_ID ||
    headSpa.imageUrl !== imageUrls["head-spa"] ||
    headSpa.hero.imageUrl !== imageUrls["head-spa"] ||
    headSpa.galleryImages.length !== 0 ||
    !footSpa ||
    footSpa.slug !== FOOT_REFLEXOLOGY_SPA_ID ||
    footSpa.imageUrl !== imageUrls["foot-reflexology-spa"] ||
    footSpa.hero.imageUrl !== imageUrls["foot-reflexology-spa"] ||
    footSpa.galleryImages.length !== 0
  ) {
    throw new Error("Treatment records failed post-migration verification.");
  }

  for (const service of [backNeck, headSpa, footSpa]) {
    const expectedDuration = service === backNeck ? 30 : 60;
    const expectedPrice = service === backNeck ? 4_000 : 6_500;
    if (
      service.prices.length !== 1 ||
      service.prices[0].durationMinutes !== expectedDuration ||
      service.prices[0].priceCents !== expectedPrice ||
      !service.prices[0].active
    ) {
      throw new Error("Treatment pricing failed post-migration verification.");
    }
  }

  for (const therapist of activeTherapists(content)) {
    if (
      !therapist.serviceIds.includes(HEAD_SPA_ID) ||
      !therapist.serviceIds.includes(FOOT_REFLEXOLOGY_SPA_ID)
    ) {
      throw new Error(
        `Active therapist ${therapist.name} is missing a new treatment assignment.`,
      );
    }
  }
}
