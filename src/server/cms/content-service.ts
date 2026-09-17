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
  type CmsTeamEditorRecord,
  type CmsTeamRecord,
  type CmsTherapistContact,
  type CmsTherapistDeletionImpact,
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
  parseTherapistContactPhone,
  parseTherapistNotificationEmail,
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
        | "promotions";
      readonly entityId: string;
    }
  | {
      readonly section: "team";
      readonly entityId: string;
      readonly deletedTeam?: true;
    }
  | {
      readonly section: "vouchers";
      readonly entityId: string;
      readonly deletedVoucher?: true;
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
      if (target.deletedTeam) {
        return {
          ...snapshotBase,
          team: snapshotBase.team.filter(
            (item) => item.id !== target.entityId,
          ),
        };
      }
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
      if (target.deletedVoucher) {
        return {
          ...snapshotBase,
          vouchers: (snapshotBase.vouchers ?? []).filter(
            (item) => item.id !== target.entityId,
          ),
        };
      }
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

function normaliseStoredStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const parsed = item.trim();
    const key = parsed.toLocaleLowerCase("en-IE");
    if (!parsed || seen.has(key)) continue;
    seen.add(key);
    values.push(parsed);
  }
  return values;
}

function normaliseTeamSlug(value: unknown, fallback: string) {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    candidate.length >= 2 &&
    candidate.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate)
  ) {
    return candidate;
  }

  const safeFallback = fallback
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
  return safeFallback.length >= 2 ? safeFallback : "therapist";
}

function normaliseTeamRecords(
  records: readonly CmsTeamRecord[] | undefined,
  validServiceIds: readonly string[],
) {
  const allowedServices = new Set(validServiceIds);
  const usedSlugs = new Set<string>();

  return (records ?? []).map((member, index): CmsTeamRecord => {
    const stored = member as CmsTeamRecord & {
      readonly slug?: unknown;
      readonly shortBio?: unknown;
      readonly imageUrl?: unknown;
      readonly imageAlt?: unknown;
      readonly serviceIds?: unknown;
    };
    const id = typeof stored.id === "string" ? stored.id : `therapist-${index + 1}`;
    const name = typeof stored.name === "string" ? stored.name : "Therapist";
    const baseSlug = normaliseTeamSlug(stored.slug, id || name);
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug.slice(0, 95)}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);

    const serviceIds = normaliseStoredStringList(stored.serviceIds).filter(
      (serviceId) => allowedServices.has(serviceId),
    );
    const archived = stored.archived === true;

    return {
      id,
      slug,
      name,
      fullName:
        typeof stored.fullName === "string" && stored.fullName.trim()
          ? stored.fullName.trim()
          : name,
      publicRole:
        typeof stored.publicRole === "string" && stored.publicRole.trim()
          ? stored.publicRole.trim()
          : "Massage therapist",
      shortBio:
        typeof stored.shortBio === "string" ? stored.shortBio.trim() : "",
      imageUrl:
        typeof stored.imageUrl === "string" ? stored.imageUrl.trim() : "",
      imageAlt:
        typeof stored.imageAlt === "string" ? stored.imageAlt.trim() : "",
      serviceIds,
      publicProfile: !archived && stored.publicProfile === true,
      operationalActive:
        !archived && stored.operationalActive === true && serviceIds.length > 0,
      archived,
      version:
        Number.isInteger(stored.version) && stored.version >= 1
          ? stored.version
          : 1,
      updatedAt:
        typeof stored.updatedAt === "string" ? stored.updatedAt : "",
    };
  });
}

export function normaliseCmsContent(content: CmsContentState): CmsContentState {
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
  const team = normaliseTeamRecords(
    content.team,
    services.map((service) => service.id),
  );

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
    team,
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
      const activeServiceIds = new Set(
        current.services
          .filter((service) => service.prices.some((price) => price.active))
          .map((service) => service.id),
      );
      if (
        updated.publicBookingEnabled &&
        !current.team.some(
          (member) =>
            member.publicProfile &&
            member.operationalActive &&
            !member.archived &&
            member.serviceIds.some((serviceId) => activeServiceIds.has(serviceId)),
        )
      ) {
        throw new CmsValidationError(
          "Add and enable at least one public therapist before enabling online booking.",
        );
      }
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

function teamEditorRecord(
  member: CmsTeamRecord,
  contact: CmsTherapistContact | null,
): CmsTeamEditorRecord {
  return {
    ...member,
    notificationEmail: contact?.notificationEmail ?? "",
    contactPhone: contact?.contactPhone ?? "",
    contactVersion: contact?.version ?? 0,
  };
}

function teamInput(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function assertUniqueTeamSlug(
  team: readonly CmsTeamRecord[],
  member: CmsTeamRecord,
) {
  if (
    team.some(
      (candidate) =>
        candidate.id !== member.id &&
        candidate.slug.toLocaleLowerCase("en-IE") ===
          member.slug.toLocaleLowerCase("en-IE"),
    )
  ) {
    throw new CmsValidationError(
      "Another therapist already uses this profile URL.",
      { slug: "Choose a unique therapist URL slug." },
    );
  }
}

export async function listCmsTeamEditorRecords(): Promise<
  readonly CmsTeamEditorRecord[]
> {
  const repository = getCmsRepository();
  const content = normaliseCmsContent(await repository.getContent());
  const contacts = await Promise.all(
    content.team.map((member) => repository.getTherapistContact(member.id)),
  );
  return content.team.map((member, index) =>
    teamEditorRecord(member, contacts[index] ?? null),
  );
}

export async function getCmsTeamEditorRecord(
  memberId: string,
): Promise<CmsTeamEditorRecord | null> {
  const repository = getCmsRepository();
  const content = normaliseCmsContent(await repository.getContent());
  const member = content.team.find((candidate) => candidate.id === memberId);
  if (!member) return null;
  return teamEditorRecord(
    member,
    await repository.getTherapistContact(member.id),
  );
}

export async function getCmsTeamDeletionImpact(
  memberId: string,
): Promise<CmsTherapistDeletionImpact> {
  return getCmsRepository().getTherapistDeletionImpact(memberId);
}

export async function updateCmsTeamMember(
  memberId: string,
  input: unknown,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsTeamEditorRecord> {
  const repository = getCmsRepository();
  const source = teamInput(input);

  return repository.transaction(async (transaction) => {
    await transaction.lockTherapist(memberId);
    const storedCurrent = await transaction.getContent();
    const current = normaliseCmsContent(storedCurrent);
    const existing = current.team.find((member) => member.id === memberId);
    if (!existing) throw new Error("Team member not found.");
    if (existing.version !== expectedVersion) throw new CmsConflictError();

    const currentContact = await transaction.getTherapistContact(memberId);
    const suppliedContactVersion = Number(source.expectedContactVersion);
    if (
      source.expectedContactVersion !== undefined &&
      (!Number.isInteger(suppliedContactVersion) ||
        suppliedContactVersion !== (currentContact?.version ?? 0))
    ) {
      throw new CmsConflictError("This therapist contact was changed by another request.");
    }

    const notificationEmail = parseTherapistNotificationEmail(
      source.notificationEmail,
      currentContact?.notificationEmail ?? "",
    );
    const contactPhone = parseTherapistContactPhone(
      source.contactPhone,
      currentContact?.contactPhone ?? "",
    );
    const updated = parseTeamUpdate(input, existing, {
      notificationEmail,
      validServiceIds: current.services.map((service) => service.id),
    });
    assertUniqueTeamSlug(current.team, updated);
    const now = new Date().toISOString();
    const futureAssignedBookings =
      await transaction.listFutureActiveTherapistBookings(
        memberId,
        now,
      );
    const invalidatedBooking = futureAssignedBookings.find(
      (booking) =>
        updated.archived ||
        !updated.operationalActive ||
        !updated.serviceIds.includes(booking.serviceId),
    );
    if (invalidatedBooking) {
      throw new CmsConflictError(
        `Reassign future booking ${invalidatedBooking.reference} before deactivating, archiving or removing this therapist's treatment eligibility.`,
      );
    }

    const next: CmsContentState = {
      ...current,
      revision: current.revision + 1,
      team: current.team.map((member) =>
        member.id === memberId ? updated : member,
      ),
      updatedAt: now,
      updatedBy: context.actor.id,
    };
    const contactChanged =
      (source.notificationEmail !== undefined &&
        notificationEmail !== (currentContact?.notificationEmail ?? "")) ||
      (source.contactPhone !== undefined &&
        contactPhone !== (currentContact?.contactPhone ?? ""));
    const nextContact: CmsTherapistContact | null = contactChanged
      ? {
          id: memberId,
          notificationEmail,
          contactPhone,
          version: (currentContact?.version ?? 0) + 1,
          updatedAt: now,
          updatedBy: context.actor.id,
        }
      : currentContact;

    await commitCmsMediaForContentMutation(transaction, {
      current,
      next,
      submission: context.mediaSubmission,
      actor: context.actor,
      requestId: context.requestId,
    });
    await transaction.saveContent(next, storedCurrent.revision);
    if (contactChanged && nextContact) {
      await transaction.saveTherapistContact(
        nextContact,
        currentContact?.version,
      );
    }
    await publishContentImmediately(
      transaction,
      next,
      { section: "team", entityId: memberId },
      context,
    );
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "team.updated",
      entityType: "team-member",
      entityId: memberId,
      summary: "Updated a therapist record and booking settings.",
      requestId: context.requestId,
    });

    return teamEditorRecord(updated, nextContact);
  });
}

export async function deleteCmsTeamMember(
  memberId: string,
  expectedVersion: number,
  context: MutationContext,
) {
  const repository = getCmsRepository();

  return repository.transaction(async (transaction) => {
    await transaction.lockTherapist(memberId);
    const storedCurrent = await transaction.getContent();
    const current = normaliseCmsContent(storedCurrent);
    const existing = current.team.find((member) => member.id === memberId);
    if (!existing) throw new Error("Team member not found.");
    if (existing.version !== expectedVersion) throw new CmsConflictError();

    const now = new Date().toISOString();
    const next: CmsContentState = {
      ...current,
      revision: current.revision + 1,
      team: current.team.filter((member) => member.id !== memberId),
      updatedAt: now,
      updatedBy: context.actor.id,
    };

    await commitCmsMediaForContentMutation(transaction, {
      current,
      next,
      submission: null,
      actor: context.actor,
      requestId: context.requestId,
    });
    await transaction.saveContent(next, storedCurrent.revision);
    const impact = await transaction.deleteTherapistCascade(memberId);
    await publishContentImmediately(
      transaction,
      next,
      { section: "team", entityId: memberId, deletedTeam: true },
      context,
    );
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "team.deleted",
      entityType: "team-member",
      entityId: memberId,
      summary: `Permanently deleted therapist ${existing.name} and ${impact.bookingCount} related booking${impact.bookingCount === 1 ? "" : "s"}.`,
      requestId: context.requestId,
    });

    return {
      memberId: existing.id,
      name: existing.name,
      ...impact,
    } as const;
  });
}

export async function createCmsTeamMember(
  input: unknown,
  context: MutationContext,
): Promise<CmsTeamEditorRecord> {
  const memberId = randomUUID();
  const repository = getCmsRepository();
  const source = teamInput(input);

  return repository.transaction(async (transaction) => {
    const storedCurrent = await transaction.getContent();
    const current = normaliseCmsContent(storedCurrent);
    const notificationEmail = parseTherapistNotificationEmail(
      source.notificationEmail,
    );
    const contactPhone = parseTherapistContactPhone(source.contactPhone);
    const created = parseTeamCreate(input, memberId, {
      notificationEmail,
      validServiceIds: current.services.map((service) => service.id),
    });
    assertUniqueTeamSlug(current.team, created);

    const now = new Date().toISOString();
    const next: CmsContentState = {
      ...current,
      revision: current.revision + 1,
      team: [...current.team, created],
      updatedAt: now,
      updatedBy: context.actor.id,
    };
    const contact: CmsTherapistContact | null = notificationEmail || contactPhone
      ? {
          id: memberId,
          notificationEmail,
          contactPhone,
          version: 1,
          updatedAt: now,
          updatedBy: context.actor.id,
        }
      : null;

    await commitCmsMediaForContentMutation(transaction, {
      current,
      next,
      submission: context.mediaSubmission,
      actor: context.actor,
      requestId: context.requestId,
    });
    await transaction.saveContent(next, storedCurrent.revision);
    if (contact) await transaction.saveTherapistContact(contact);
    await publishContentImmediately(
      transaction,
      next,
      { section: "team", entityId: memberId },
      context,
    );
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "team.created",
      entityType: "team-member",
      entityId: memberId,
      summary: "Created and published a therapist record.",
      requestId: context.requestId,
    });

    return teamEditorRecord(created, contact);
  });
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

export async function deleteCmsVoucher(
  voucherId: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<CmsVoucherRecord> {
  let deleted: CmsVoucherRecord | null = null;

  await mutateContent(
    context,
    "voucher.deleted",
    "voucher",
    voucherId,
    "Deleted a gift voucher record.",
    (current) => {
      const vouchers = current.vouchers ?? [];
      const existing = vouchers.find((item) => item.id === voucherId);
      if (!existing) throw new Error("Voucher not found.");
      if (existing.version !== expectedVersion) throw new CmsConflictError();

      deleted = existing;
      return {
        ...current,
        revision: current.revision + 1,
        vouchers: vouchers.filter((item) => item.id !== voucherId),
        updatedAt: new Date().toISOString(),
        updatedBy: context.actor.id,
      };
    },
    { section: "vouchers", entityId: voucherId, deletedVoucher: true },
  );
  return deleted!;
}
