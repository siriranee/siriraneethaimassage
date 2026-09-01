import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CmsBookingSettings,
  CmsContentState,
  CmsGalleryRecord,
  CmsPageId,
  CmsPageRecord,
  CmsPublication,
  CmsPromotionRecord,
  CmsServiceRecord,
  CmsSiteSettings,
  CmsTeamRecord,
  CmsUser,
  CmsVoucherRecord,
} from "@/domain/cms/types";
import { migrateLegacyHomeHeroSlides } from "@/content/home-hero";
import { isApprovedPublicImageUrl } from "@/lib/media/cloudinary-delivery";
import {
  CmsPageHeroValidationError,
  normaliseStoredPageHeroSlides,
  parseCmsPageHeroSlides,
} from "@/domain/cms/page-hero";
import {
  CMS_CONTENT_SCHEMA_VERSION,
  CmsServiceGalleryValidationError,
  normaliseStoredServiceGalleryImages,
  parseCmsServiceGalleryImages,
} from "@/domain/cms/service-gallery";
import { appendCmsAudit } from "@/server/cms/audit";
import { getCmsMode } from "@/server/cms/config";
import {
  createDefaultContentState,
  createSafePublicContentState,
} from "@/server/cms/default-content";
import {
  CmsValidationError,
  parseBookingSettingsUpdate,
  parseGalleryCreate,
  parseGalleryUpdate,
  parsePageUpdate,
  parsePromotionCreate,
  parsePromotionUpdate,
  parseServiceCreate,
  parseServiceUpdate,
  parseSiteSettingsUpdate,
  parseTeamCreate,
  parseTeamUpdate,
  parseVoucherCreate,
  parseVoucherUpdate,
} from "@/server/cms/content-validation";
import { CmsConflictError, getCmsRepository } from "@/server/cms/repositories";
import type { CmsMediaSubmission } from "@/server/media/submission";
import {
  assertCmsContentMediaReferencesApproved,
  commitCmsMediaForContentMutation,
} from "@/server/media/submission";

type MutationContext = {
  readonly actor: CmsUser;
  readonly requestId?: string;
  readonly mediaSubmission?: CmsMediaSubmission | null;
};

async function mutateContent(
  context: MutationContext,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  update: (current: CmsContentState) => CmsContentState,
) {
  const repository = getCmsRepository();

  return repository.transaction(async (transaction) => {
    const storedCurrent = await transaction.getContent();
    const current = normaliseCmsContent(storedCurrent);
    const next = update(current);

    await commitCmsMediaForContentMutation(transaction, {
      current,
      next,
      submission: context.mediaSubmission,
      actor: context.actor,
      requestId: context.requestId,
    });
    await transaction.saveContent(next, storedCurrent.revision);
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action,
      entityType,
      entityId,
      summary,
      requestId: context.requestId,
    });

    return next;
  });
}

export async function getCmsContent() {
  return normaliseCmsContent(await getCmsRepository().getContent());
}

function normaliseCmsContent(content: CmsContentState): CmsContentState {
  const defaults = createDefaultContentState();
  const storedSchemaVersion = Number.isInteger(content.schemaVersion)
    ? content.schemaVersion
    : 0;
  const migrateConfirmedPhone =
    storedSchemaVersion < 4 &&
    !content.site.phoneDisplay.trim() &&
    !content.site.phoneE164.trim();
  const migrateConfirmedWhatsapp =
    storedSchemaVersion < 4 && !content.site.whatsappNumber.trim();
  const defaultServicesBySlug = new Map(
    defaults.services.map((service) => [service.slug, service] as const),
  );
  const mode = getCmsMode();
  const fallbackVouchers = mode === "mock" ? defaults.vouchers : [];
  const defaultPages = defaults.pages ?? [];
  const storedPages = content.pages ?? [];
  const pages = defaultPages.map((defaultPage) => {
    const storedPage = storedPages.find((page) => page.id === defaultPage.id);
    const page =
      storedPage && storedPage.version >= defaultPage.version
        ? storedPage
        : defaultPage;

    if (page.id !== "home") return page;

    return {
      ...page,
      heroSlides: migrateLegacyHomeHeroSlides(
        normaliseStoredPageHeroSlides(
          storedPage?.heroSlides,
          defaultPage.heroSlides ?? [],
        ),
      ),
    };
  });
  const services = content.services.map((service) => {
    const storedGallery = (
      service as CmsServiceRecord & { readonly galleryImages?: unknown }
    ).galleryImages;
    const fallbackGallery =
      defaultServicesBySlug.get(service.slug)?.galleryImages ?? [];

    return {
      ...service,
      galleryImages: normaliseStoredServiceGalleryImages(
        storedGallery,
        fallbackGallery,
      ),
    };
  });

  return {
    ...content,
    schemaVersion: CMS_CONTENT_SCHEMA_VERSION,
    services,
    site: {
      ...content.site,
      phoneDisplay: migrateConfirmedPhone
        ? defaults.site.phoneDisplay
        : content.site.phoneDisplay,
      phoneE164: migrateConfirmedPhone
        ? defaults.site.phoneE164
        : content.site.phoneE164,
      phoneConfirmed: migrateConfirmedPhone
        ? defaults.site.phoneConfirmed
        : content.site.phoneConfirmed === true,
      whatsappNumber: migrateConfirmedWhatsapp
        ? defaults.site.whatsappNumber
        : content.site.whatsappNumber,
    },
    pages,
    vouchers: content.vouchers ?? fallbackVouchers,
  };
}

export class CmsPublicContentUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Published website content is temporarily unavailable.", { cause });
    this.name = "CmsPublicContentUnavailableError";
  }
}

export async function getPublishedCmsContent() {
  const mode = getCmsMode();
  if (mode === "disabled") return createSafePublicContentState();

  try {
    const publication = await getCmsRepository().getPublishedContent();
    if (publication) return normaliseCmsContent(publication.snapshot);

    return mode === "mock"
      ? createDefaultContentState()
      : createSafePublicContentState();
  } catch (error) {
    if (mode === "mock") return createDefaultContentState();
    throw new CmsPublicContentUnavailableError(error);
  }
}

function contentChanged(first: unknown, second: unknown) {
  return JSON.stringify(first) !== JSON.stringify(second);
}

export function inspectCmsPublishReadiness(content: CmsContentState) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const publishedServices = content.services.filter((service) => service.status === "published");
  const slugs = content.services.map((service) => service.slug.toLowerCase());

  if (!publishedServices.length) errors.push("Publish at least one treatment.");
  if (new Set(slugs).size !== slugs.length) errors.push("Treatment URL slugs must be unique.");
  if (publishedServices.some((service) => !service.prices.some((price) => price.active))) {
    errors.push("Every published treatment needs an active duration and price.");
  }
  if (publishedServices.some((service) => !service.imageAlt.trim())) {
    errors.push("Every published treatment needs descriptive image alternative text.");
  }
  for (const service of publishedServices) {
    try {
      parseCmsServiceGalleryImages(service.galleryImages);
    } catch (error) {
      errors.push(
        error instanceof CmsServiceGalleryValidationError
          ? `${service.name}: ${error.message}`
          : `${service.name}: the treatment gallery is invalid.`,
      );
    }
  }
  const homePage = content.pages?.find((page) => page.id === "home");
  try {
    parseCmsPageHeroSlides(homePage?.heroSlides);
  } catch (error) {
    errors.push(
      error instanceof CmsPageHeroValidationError
        ? error.message
        : "The home hero slides are invalid.",
    );
  }
  if (
    homePage?.heroSlides?.some(
      (slide) =>
        slide.imageUrl.startsWith("https://") &&
        !isApprovedPublicImageUrl(slide.imageUrl),
    )
  ) {
    warnings.push(
      "Remote home hero images remain hidden until a media provider is approved.",
    );
  }
  if (
    publishedServices.some((service) =>
      [service.imageUrl, ...service.galleryImages.map((image) => image.imageUrl)]
        .some(
          (imageUrl) =>
            imageUrl.startsWith("https://") &&
            !isApprovedPublicImageUrl(imageUrl),
        ),
    )
  ) {
    warnings.push(
      "Unapproved remote treatment images remain hidden.",
    );
  }
  if (!content.site.openingHoursConfirmed) {
    warnings.push("Opening hours are still marked as provisional.");
  }
  if (!content.site.phoneConfirmed) {
    warnings.push("The public phone number is hidden until the owner confirms it.");
  }
  if (!content.bookingSettings.rulesConfirmed) {
    warnings.push("Booking capacity, notice and buffer rules still need owner confirmation.");
  }
  if (!content.site.email) warnings.push("No public email address is configured.");
  if (!content.site.whatsappNumber) warnings.push("WhatsApp is not configured.");
  if (
    content.gallery.some(
      (item) =>
        item.published &&
        item.imageUrl.startsWith("https://") &&
        !isApprovedPublicImageUrl(item.imageUrl),
    )
  ) {
    warnings.push("Remote gallery images remain hidden until a media provider is approved.");
  }
  if (!content.team.some((member) => member.publicProfile)) {
    warnings.push("No team profile is selected for public display.");
  }

  return { errors, warnings } as const;
}

export async function getCmsPublicationPreview() {
  const repository = getCmsRepository();
  const [draft, publishedRecord, history] = await Promise.all([
    repository.getContent().then(normaliseCmsContent),
    repository.getPublishedContent(),
    repository.listPublications(20),
  ]);
  const published = publishedRecord
    ? {
        ...publishedRecord,
        snapshot: normaliseCmsContent(publishedRecord.snapshot),
      }
    : null;
  const snapshot = published?.snapshot;
  const changes = [
    { key: "services", label: "Treatments and prices", changed: contentChanged(draft.services, snapshot?.services) },
    { key: "business", label: "Business details and SEO", changed: contentChanged(draft.site, snapshot?.site) },
    { key: "booking", label: "Booking rules", changed: contentChanged(draft.bookingSettings, snapshot?.bookingSettings) },
    { key: "team", label: "Team profiles", changed: contentChanged(draft.team, snapshot?.team) },
    { key: "promotions", label: "Promotions", changed: contentChanged(draft.promotions, snapshot?.promotions) },
    { key: "vouchers", label: "Gift vouchers", changed: contentChanged(draft.vouchers, snapshot?.vouchers ?? []) },
    { key: "gallery", label: "Gallery", changed: contentChanged(draft.gallery, snapshot?.gallery) },
    { key: "pages", label: "Page headings and SEO", changed: contentChanged(draft.pages, snapshot?.pages) },
  ];

  return {
    draft,
    published,
    history,
    changes,
    readiness: inspectCmsPublishReadiness(draft),
  };
}

export async function restoreCmsPublicationToDraft(
  publicationId: string,
  expectedRevision: number,
  context: MutationContext,
) {
  const repository = getCmsRepository();
  return repository.transaction(async (transaction) => {
    const [storedCurrent, publication] = await Promise.all([
      transaction.getContent(),
      transaction.getPublication(publicationId),
    ]);
    const current = normaliseCmsContent(storedCurrent);
    if (!publication) throw new Error("Publication not found.");
    if (current.revision !== expectedRevision) throw new CmsConflictError();

    const publishedSnapshot = normaliseCmsContent(publication.snapshot);
    const restored: CmsContentState = {
      ...structuredClone(publishedSnapshot),
      id: current.id,
      schemaVersion: CMS_CONTENT_SCHEMA_VERSION,
      revision: current.revision + 1,
      site: {
        ...structuredClone(publishedSnapshot.site),
        phoneDisplay: current.site.phoneDisplay,
        phoneE164: current.site.phoneE164,
        phoneConfirmed: current.site.phoneConfirmed,
        weeklyHours: current.site.weeklyHours,
        openingHoursConfirmed: current.site.openingHoursConfirmed,
      },
      bookingSettings: current.bookingSettings,
      updatedAt: new Date().toISOString(),
      updatedBy: context.actor.id,
    };

    assertCmsContentMediaReferencesApproved(restored);
    await transaction.saveContent(restored, storedCurrent.revision);
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "content.restored-to-draft",
      entityType: "publication",
      entityId: publication.id,
      summary: `Restored website publication revision ${publication.revision} as new draft revision ${restored.revision}.`,
      requestId: context.requestId,
    });
    return restored;
  });
}

export async function createCmsService(
  input: unknown,
  context: MutationContext,
): Promise<CmsServiceRecord> {
  let created: CmsServiceRecord | null = null;
  const serviceId = randomUUID();

  await mutateContent(
    context,
    "service.created",
    "service",
    serviceId,
    "Created a new treatment draft.",
    (current) => {
      created = parseServiceCreate(input, serviceId);
      const slug = created.slug.toLowerCase();

      if (current.services.some((service) => service.slug.toLowerCase() === slug)) {
        throw new CmsValidationError("A treatment already uses this URL slug.", {
          slug: "Choose a unique URL slug.",
        });
      }

      return {
        ...current,
        revision: current.revision + 1,
        services: [...current.services, created],
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return created!;
}

export async function updateCmsPage(
  pageId: CmsPageId,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsPageRecord> {
  let updated: CmsPageRecord | null = null;

  await mutateContent(
    context,
    "page.updated",
    "website-page",
    pageId,
    `Updated ${pageId} page heading and search metadata.`,
    (current) => {
      const pages = current.pages?.length
        ? current.pages
        : createDefaultContentState().pages ?? [];
      const existing = pages.find((page) => page.id === pageId);
      if (!existing) throw new Error("Website page not found.");
      if (existing.version !== expectedVersion) throw new CmsConflictError();
      updated = parsePageUpdate(input, existing);
      return {
        ...current,
        revision: current.revision + 1,
        pages: pages.map((page) => page.id === pageId ? updated! : page),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );
  return updated!;
}

export async function updateCmsService(
  serviceId: string,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsServiceRecord> {
  let updated: CmsServiceRecord | null = null;

  await mutateContent(
    context,
    "service.updated",
    "service",
    serviceId,
    "Updated treatment content, pricing or publication status.",
    (current) => {
      const existing = current.services.find((service) => service.id === serviceId);

      if (!existing) throw new Error("Service not found.");
      if (existing.version !== expectedVersion) {
        throw new Error("This service was changed by another request.");
      }

      updated = parseServiceUpdate(input, existing);
      return {
        ...current,
        revision: current.revision + 1,
        services: current.services.map((service) =>
          service.id === serviceId ? updated! : service,
        ),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return updated!;
}

export async function updateCmsSiteSettings(
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsSiteSettings> {
  let updated: CmsSiteSettings | null = null;

  await mutateContent(
    context,
    "site-settings.updated",
    "site-settings",
    "siriranee-site",
    "Updated business information, contact details or opening hours.",
    (current) => {
      if (current.site.version !== expectedVersion) {
        throw new Error("Site settings were changed by another request.");
      }

      updated = parseSiteSettingsUpdate(input, current.site);
      return {
        ...current,
        revision: current.revision + 1,
        site: updated,
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return updated!;
}

export async function updateCmsBookingSettings(
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsBookingSettings> {
  let updated: CmsBookingSettings | null = null;

  await mutateContent(
    context,
    "booking-settings.updated",
    "booking-settings",
    "howth-primary",
    "Updated booking availability rules.",
    (current) => {
      if (current.bookingSettings.version !== expectedVersion) {
        throw new Error("Booking settings were changed by another request.");
      }

      updated = parseBookingSettingsUpdate(
        input,
        current.bookingSettings,
        current.site.openingHoursConfirmed,
      );
      return {
        ...current,
        revision: current.revision + 1,
        bookingSettings: updated,
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return updated!;
}

export async function updateCmsTeamMember(
  memberId: string,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsTeamRecord> {
  let updated: CmsTeamRecord | null = null;

  await mutateContent(
    context,
    "team.updated",
    "team-member",
    memberId,
    "Updated a public team profile.",
    (current) => {
      const existing = current.team.find((member) => member.id === memberId);

      if (!existing) throw new Error("Team member not found.");
      if (existing.version !== expectedVersion) {
        throw new Error("This team profile was changed by another request.");
      }

      updated = parseTeamUpdate(input, existing);
      return {
        ...current,
        revision: current.revision + 1,
        team: current.team.map((member) =>
          member.id === memberId ? updated! : member,
        ),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return updated!;
}

export async function createCmsTeamMember(
  input: unknown,
  context: MutationContext,
): Promise<CmsTeamRecord> {
  let created: CmsTeamRecord | null = null;
  const memberId = randomUUID();

  await mutateContent(
    context,
    "team.created",
    "team-member",
    memberId,
    "Created a new team profile draft.",
    (current) => {
      created = parseTeamCreate(input, memberId);
      return {
        ...current,
        revision: current.revision + 1,
        team: [...current.team, created],
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return created!;
}

export async function createCmsGalleryItem(
  input: unknown,
  context: MutationContext,
): Promise<CmsGalleryRecord> {
  let created: CmsGalleryRecord | null = null;
  const itemId = randomUUID();

  await mutateContent(
    context,
    "gallery.created",
    "gallery-item",
    itemId,
    "Created a gallery image record.",
    (current) => {
      created = parseGalleryCreate(input, itemId);
      return {
        ...current,
        revision: current.revision + 1,
        gallery: [...current.gallery, created],
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return created!;
}

export async function updateCmsGalleryItem(
  itemId: string,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsGalleryRecord> {
  let updated: CmsGalleryRecord | null = null;

  await mutateContent(
    context,
    "gallery.updated",
    "gallery-item",
    itemId,
    "Updated a gallery image record.",
    (current) => {
      const existing = current.gallery.find((item) => item.id === itemId);
      if (!existing) throw new Error("Gallery item not found.");
      if (existing.version !== expectedVersion) {
        throw new CmsConflictError();
      }
      updated = parseGalleryUpdate(input, existing);
      return {
        ...current,
        revision: current.revision + 1,
        gallery: current.gallery.map((item) => item.id === itemId ? updated! : item),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );

  return updated!;
}

export async function createCmsPromotion(
  input: unknown,
  context: MutationContext,
): Promise<CmsPromotionRecord> {
  let created: CmsPromotionRecord | null = null;
  const promotionId = randomUUID();

  await mutateContent(
    context,
    "promotion.created",
    "promotion",
    promotionId,
    "Created a promotion draft.",
    (current) => {
      created = parsePromotionCreate(input, promotionId);
      return {
        ...current,
        revision: current.revision + 1,
        promotions: [...current.promotions, created],
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );
  return created!;
}

export async function updateCmsPromotion(
  promotionId: string,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsPromotionRecord> {
  let updated: CmsPromotionRecord | null = null;

  await mutateContent(
    context,
    "promotion.updated",
    "promotion",
    promotionId,
    "Updated a promotion draft.",
    (current) => {
      const existing = current.promotions.find((item) => item.id === promotionId);
      if (!existing) throw new Error("Promotion not found.");
      if (existing.version !== expectedVersion) throw new CmsConflictError();
      updated = parsePromotionUpdate(input, existing);
      return {
        ...current,
        revision: current.revision + 1,
        promotions: current.promotions.map((item) => item.id === promotionId ? updated! : item),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );
  return updated!;
}

export async function createCmsVoucher(
  input: unknown,
  context: MutationContext,
): Promise<CmsVoucherRecord> {
  let created: CmsVoucherRecord | null = null;
  const voucherId = randomUUID();

  await mutateContent(
    context,
    "voucher.created",
    "voucher",
    voucherId,
    "Created a gift voucher draft.",
    (current) => {
      created = parseVoucherCreate(input, voucherId);
      return {
        ...current,
        revision: current.revision + 1,
        vouchers: [...(current.vouchers ?? []), created],
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );
  return created!;
}

export async function updateCmsVoucher(
  voucherId: string,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsVoucherRecord> {
  let updated: CmsVoucherRecord | null = null;

  await mutateContent(
    context,
    "voucher.updated",
    "voucher",
    voucherId,
    "Updated a gift voucher draft.",
    (current) => {
      const vouchers = current.vouchers ?? [];
      const existing = vouchers.find((item) => item.id === voucherId);
      if (!existing) throw new Error("Voucher not found.");
      if (existing.version !== expectedVersion) throw new CmsConflictError();
      updated = parseVoucherUpdate(input, existing);
      return {
        ...current,
        revision: current.revision + 1,
        vouchers: vouchers.map((item) => item.id === voucherId ? updated! : item),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
  );
  return updated!;
}

export async function publishCmsContent(context: MutationContext) {
  const repository = getCmsRepository();

  return repository.transaction(async (transaction) => {
    const current = normaliseCmsContent(await transaction.getContent());

    assertCmsContentMediaReferencesApproved(current);

    const readiness = inspectCmsPublishReadiness(current);
    if (readiness.errors.length) throw new CmsValidationError(readiness.errors[0]);

    const publication: CmsPublication = {
      id: randomUUID(),
      revision: current.revision,
      publishedAt: new Date().toISOString(),
      publishedBy: context.actor.id,
      snapshot: structuredClone(current),
    };

    await transaction.savePublication(publication);
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "content.published",
      entityType: "publication",
      entityId: publication.id,
      summary: `Published website content revision ${current.revision}.`,
      requestId: context.requestId,
    });

    return publication;
  });
}
