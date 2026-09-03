import "server-only";

import { randomUUID } from "node:crypto";

import {
  CMS_CONTENT_SCHEMA_VERSION,
  type CmsBookingSettings,
  type CmsContentState,
  type CmsPublication,
  type CmsPromotionRecord,
  type CmsServiceRecord,
  type CmsSiteSettings,
  type CmsTeamRecord,
  type CmsUser,
  type CmsVoucherRecord,
} from "@/domain/cms/types";
import { normaliseStoredServiceGalleryImages } from "@/domain/cms/service-gallery";
import {
  normaliseStoredServiceHero,
  type CmsServiceHero,
} from "@/domain/cms/service-hero";
import { appendCmsAudit } from "@/server/cms/audit";
import { getCmsMode } from "@/server/cms/config";
import {
  createDefaultContentState,
  createSafePublicContentState,
} from "@/server/cms/default-content";
import {
  CmsValidationError,
  parseBookingSettingsUpdate,
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
import type { CmsRepository } from "@/server/cms/repositories/repository";
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

type CmsPublicationTarget =
  | {
      readonly section:
        | "services"
        | "team"
        | "promotions"
        | "vouchers";
      readonly entityId: string;
    }
  | {
      readonly section:
        | "site"
        | "bookingSettings";
    };

function legacyServiceHero(
  service: CmsServiceRecord,
): CmsServiceHero {
  return {
    imageUrl: service.imageUrl,
    altText: service.imageAlt,
  };
}

function assertServiceReadyForPublication(service: CmsServiceRecord) {
  if (!service.prices.some((price) => price.active)) {
    throw new CmsValidationError(
      "Add at least one available appointment option before saving.",
      { prices: "Turn on at least one duration and price." },
    );
  }
}

function replacePublishedService(
  services: readonly CmsServiceRecord[],
  nextService: CmsServiceRecord,
) {
  let replaced = false;
  const nextServices = services.flatMap((service) => {
    if (service.id !== nextService.id && service.slug !== nextService.slug) {
      return [service];
    }
    if (replaced) return [];
    replaced = true;
    return [nextService];
  });

  return replaced ? nextServices : [...nextServices, nextService];
}

function replacePublishedRecord<T extends { readonly id: string }>(
  records: readonly T[],
  nextRecord: T,
) {
  return records.some((record) => record.id === nextRecord.id)
    ? records.map((record) =>
        record.id === nextRecord.id ? nextRecord : record,
      )
    : [...records, nextRecord];
}

function createImmediatePublicationSnapshot(
  publicBase: CmsContentState,
  content: CmsContentState,
  target: CmsPublicationTarget,
) {
  const clonedPublicBase = structuredClone(publicBase);
  const snapshotBase: CmsContentState = {
    id: clonedPublicBase.id,
    schemaVersion: CMS_CONTENT_SCHEMA_VERSION,
    revision: content.revision,
    services: clonedPublicBase.services,
    site: clonedPublicBase.site,
    bookingSettings: clonedPublicBase.bookingSettings,
    team: clonedPublicBase.team,
    promotions: clonedPublicBase.promotions,
    vouchers: clonedPublicBase.vouchers ?? [],
    updatedAt: content.updatedAt,
    updatedBy: content.updatedBy,
  };

  switch (target.section) {
    case "services": {
      const service = content.services.find(
        (item) => item.id === target.entityId,
      );
      if (!service) throw new Error("Service not found after saving.");
      assertServiceReadyForPublication(service);
      return {
        ...snapshotBase,
        services: replacePublishedService(publicBase.services, service),
      };
    }
    case "site":
      return { ...snapshotBase, site: structuredClone(content.site) };
    case "bookingSettings":
      return {
        ...snapshotBase,
        bookingSettings: structuredClone(content.bookingSettings),
      };
    case "team": {
      const member = content.team.find(
        (item) => item.id === target.entityId,
      );
      if (!member) throw new Error("Team member not found after saving.");
      return {
        ...snapshotBase,
        team: replacePublishedRecord(publicBase.team, member),
      };
    }
    case "promotions": {
      const promotion = content.promotions.find(
        (item) => item.id === target.entityId,
      );
      if (!promotion) throw new Error("Promotion not found after saving.");
      return {
        ...snapshotBase,
        promotions: replacePublishedRecord(
          publicBase.promotions,
          promotion,
        ),
      };
    }
    case "vouchers": {
      const voucher = content.vouchers?.find(
        (item) => item.id === target.entityId,
      );
      if (!voucher) throw new Error("Voucher not found after saving.");
      return {
        ...snapshotBase,
        vouchers: replacePublishedRecord(publicBase.vouchers ?? [], voucher),
      };
    }
  }
}

async function publishContentImmediately(
  repository: CmsRepository,
  content: CmsContentState,
  target: CmsPublicationTarget,
  context: MutationContext,
) {
  const currentPublication = await repository.getPublishedContent();
  const publicBase = currentPublication
    ? normalisePublishedCmsContent(currentPublication.snapshot)
    : createSafePublicContentState();
  const snapshot = createImmediatePublicationSnapshot(
    publicBase,
    content,
    target,
  );

  assertCmsContentMediaReferencesApproved(snapshot);
  const publication: CmsPublication = {
    id: randomUUID(),
    revision: content.revision,
    publishedAt: new Date().toISOString(),
    publishedBy: context.actor.id,
    snapshot,
  };
  await repository.savePublication(publication);
}

async function mutateContent(
  context: MutationContext,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  update: (current: CmsContentState) => CmsContentState,
  publicationTarget: CmsPublicationTarget,
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
    await publishContentImmediately(
      transaction,
      next,
      publicationTarget,
      context,
    );
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
  const services = content.services.map((service) => {
    const storedService = service as CmsServiceRecord & {
      readonly galleryImages?: unknown;
      readonly hero?: unknown;
      readonly priceNote?: unknown;
    };
    const fallbackHero = legacyServiceHero(service);
    const hero =
      storedSchemaVersion < 5
        ? fallbackHero
        : normaliseStoredServiceHero(storedService.hero, fallbackHero);

    return {
      id: service.id,
      slug: service.slug,
      name: service.name,
      shortDescription: service.shortDescription,
      longDescription: service.longDescription,
      imageUrl: service.imageUrl,
      imageAlt: service.imageAlt,
      hero,
      galleryImages: normaliseStoredServiceGalleryImages(
        storedService.galleryImages,
        [],
      ),
      prices: service.prices,
      idealFor: service.idealFor,
      highlights: service.highlights,
      priceNote:
        typeof storedService.priceNote === "string"
          ? storedService.priceNote
          : "",
      seoTitle: service.seoTitle,
      seoDescription: service.seoDescription,
      version: service.version,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  });
  const vouchers = (content.vouchers ?? []).map((voucher) => {
    const stored = voucher as CmsVoucherRecord & {
      readonly imageUrl?: unknown;
      readonly imageAlt?: unknown;
    };
    const imageUrl =
      typeof stored.imageUrl === "string" ? stored.imageUrl.trim() : "";
    const imageAlt =
      typeof stored.imageAlt === "string" && stored.imageAlt.trim()
        ? stored.imageAlt.trim()
        : `${stored.title} voucher`;

    return {
      id: stored.id,
      title: stored.title,
      imageUrl,
      imageAlt,
      status: stored.status,
      sortOrder: stored.sortOrder,
      version: stored.version,
      updatedAt: stored.updatedAt,
    };
  });

  return {
    id: "siriranee-content",
    schemaVersion: CMS_CONTENT_SCHEMA_VERSION,
    revision: content.revision,
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
    bookingSettings: content.bookingSettings,
    team: content.team,
    promotions: content.promotions,
    vouchers,
    updatedAt: content.updatedAt,
    updatedBy: content.updatedBy,
  };
}

function normalisePublishedCmsContent(content: CmsContentState) {
  const services =
    content.schemaVersion < 6
      ? content.services.filter(
          (service) =>
            (service as CmsServiceRecord & { readonly status?: unknown }).status ===
            "published",
        )
      : content.services;

  return normaliseCmsContent({ ...content, services });
}

export async function getPublishedCmsContent() {
  const mode = getCmsMode();
  if (mode === "disabled") return createSafePublicContentState();

  try {
    const publication = await getCmsRepository().getPublishedContent();
    if (publication) return normalisePublishedCmsContent(publication.snapshot);

    return mode === "mock"
      ? createDefaultContentState()
      : createSafePublicContentState();
  } catch {
    if (mode === "mock") return createDefaultContentState();
    return createSafePublicContentState();
  }
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
    "Created and published a new treatment.",
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
    { section: "services", entityId: serviceId },
  );

  return created!;
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
    "Updated and published treatment content and pricing.",
    (current) => {
      const existing = current.services.find((service) => service.id === serviceId);

      if (!existing) throw new Error("Service not found.");
      if (existing.version !== expectedVersion) {
        throw new CmsConflictError();
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
    { section: "services", entityId: serviceId },
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
    { section: "site" },
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
    { section: "bookingSettings" },
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
    { section: "team", entityId: memberId },
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
    "Created and published a new team profile.",
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
    { section: "team", entityId: memberId },
  );

  return created!;
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
    "Created and published a promotion record.",
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
    { section: "promotions", entityId: promotionId },
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
    "Updated and published a promotion record.",
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
    { section: "promotions", entityId: promotionId },
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
    "Created and published a gift voucher record.",
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
    { section: "vouchers", entityId: voucherId },
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
    "Updated and published a gift voucher record.",
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
    { section: "vouchers", entityId: voucherId },
  );
  return updated!;
}
