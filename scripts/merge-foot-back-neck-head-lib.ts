import { createHash } from "node:crypto";

import type {
  BookingStatus,
  CmsContentState,
  CmsPublication,
  CmsServiceRecord,
} from "../src/domain/cms/types";

export const SERVICE_MERGE_VERSION = 1 as const;
export const MERGED_SERVICE_ID = "neck-shoulder-upper-back-massage";
export const MERGED_SERVICE_SLUG = "foot-massage-back-neck-head";
export const MERGED_SERVICE_NAME = "Foot Massage Including Back, Neck & Head";
export const HEAD_SPA_ID = "head-spa";
export const FOOT_REFLEXOLOGY_SPA_ID = "foot-reflexology-spa";
export const REMOVED_SERVICE_IDS = [
  HEAD_SPA_ID,
  FOOT_REFLEXOLOGY_SPA_ID,
] as const;
export const SOURCE_SERVICE_IDS = [
  MERGED_SERVICE_ID,
  ...REMOVED_SERVICE_IDS,
] as const;

const migrationTargetSchemaVersion = 9;
const systemActorId = "system:merge-foot-back-neck-head";

export type ServiceMergeBooking = {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly status: BookingStatus;
  readonly version: number;
  readonly localDate: string;
  readonly startsAt: string;
  readonly endsAt: string;
};

type BookingSummary = {
  readonly serviceId: string;
  readonly status: BookingStatus;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly count: number;
};

export type ServiceMergePlan = {
  readonly version: typeof SERVICE_MERGE_VERSION;
  readonly migrationNeeded: boolean;
  readonly database: string;
  readonly baseline: {
    readonly contentRevision: number;
    readonly publicationId: string;
    readonly publicationRevision: number;
    readonly sourceFingerprint: string;
    readonly bookingGuardHash: string;
  };
  readonly actions: {
    readonly keepServiceId: typeof MERGED_SERVICE_ID;
    readonly destinationSlug: typeof MERGED_SERVICE_SLUG;
    readonly destinationName: typeof MERGED_SERVICE_NAME;
    readonly removeServiceIds: typeof REMOVED_SERVICE_IDS;
    readonly affectedTherapistIds: readonly string[];
    readonly servicesBefore: number;
    readonly servicesAfter: number;
    readonly bookingsPreserved: number;
    readonly activeRemovedServiceBookings: number;
    readonly bookingSummary: readonly BookingSummary[];
    readonly emailsSent: 0;
  };
};

export type ServiceMergeBuildContext = {
  readonly now: string;
  readonly actorId?: string;
};

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sourceService(content: CmsContentState, id: string) {
  return content.services.find((service) => service.id === id);
}

function hasExactPrice(
  service: CmsServiceRecord,
  durationMinutes: number,
  priceCents: number,
) {
  return (
    service.prices.length === 1 &&
    service.prices[0]?.durationMinutes === durationMinutes &&
    service.prices[0]?.priceCents === priceCents &&
    service.prices[0]?.active === true
  );
}

function mergeState(content: CmsContentState) {
  if (content.schemaVersion !== migrationTargetSchemaVersion) {
    throw new Error("The treatment merge requires CMS schema version 9.");
  }

  const canonical = sourceService(content, MERGED_SERVICE_ID);
  const headSpa = sourceService(content, HEAD_SPA_ID);
  const footSpa = sourceService(content, FOOT_REFLEXOLOGY_SPA_ID);
  if (!canonical) {
    throw new Error("The existing back-and-neck service was not found.");
  }

  const alreadyMerged =
    canonical.slug === MERGED_SERVICE_SLUG &&
    canonical.name === MERGED_SERVICE_NAME &&
    !headSpa &&
    !footSpa;
  if (alreadyMerged) {
    return { state: "merged" as const, canonical };
  }

  if (
    canonical.slug !== MERGED_SERVICE_ID ||
    canonical.name !== "Back & Neck Massage" ||
    !headSpa ||
    headSpa.slug !== HEAD_SPA_ID ||
    headSpa.name !== "Head Spa" ||
    !footSpa ||
    footSpa.slug !== FOOT_REFLEXOLOGY_SPA_ID ||
    footSpa.name !== "Foot & Reflexology Spa"
  ) {
    throw new Error(
      "The three source treatments no longer match the reviewed merge baseline.",
    );
  }
  if (
    !hasExactPrice(canonical, 30, 4_000) ||
    !hasExactPrice(headSpa, 60, 6_500) ||
    !hasExactPrice(footSpa, 60, 6_500)
  ) {
    throw new Error(
      "A source treatment duration or price changed; review the merge again.",
    );
  }
  if (
    content.services.some(
      (service) =>
        service.id !== canonical.id && service.slug === MERGED_SERVICE_SLUG,
    )
  ) {
    throw new Error("Another treatment already uses the merged service URL.");
  }

  return { state: "pending" as const, canonical, headSpa, footSpa };
}

function sourceFingerprint(content: CmsContentState) {
  const state = mergeState(content);
  return sha256({
    services: SOURCE_SERVICE_IDS.map((id) => sourceService(content, id) ?? null),
    team: [...content.team]
      .map((member) => ({
        id: member.id,
        serviceIds: member.serviceIds,
        version: member.version,
      }))
      .sort((first, second) => first.id.localeCompare(second.id)),
    state: state.state,
  });
}

function bookingGuardHash(bookings: readonly ServiceMergeBooking[]) {
  return sha256(
    [...bookings]
      .map((booking) => ({
        id: booking.id,
        serviceId: booking.serviceId,
        serviceName: booking.serviceName,
        durationMinutes: booking.durationMinutes,
        priceCents: booking.priceCents,
        status: booking.status,
        version: booking.version,
        localDate: booking.localDate,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      }))
      .sort((first, second) => first.id.localeCompare(second.id)),
  );
}

function summariseBookings(
  bookings: readonly ServiceMergeBooking[],
): readonly BookingSummary[] {
  const summaries = new Map<string, BookingSummary>();
  for (const booking of bookings) {
    const key = [
      booking.serviceId,
      booking.status,
      booking.durationMinutes,
      booking.priceCents,
    ].join(":");
    const existing = summaries.get(key);
    summaries.set(key, {
      serviceId: booking.serviceId,
      status: booking.status,
      durationMinutes: booking.durationMinutes,
      priceCents: booking.priceCents,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...summaries.values()].sort((first, second) =>
    `${first.serviceId}:${first.status}:${first.durationMinutes}:${first.priceCents}`
      .localeCompare(
        `${second.serviceId}:${second.status}:${second.durationMinutes}:${second.priceCents}`,
      ),
  );
}

function activeRemovedServiceBookings(bookings: readonly ServiceMergeBooking[]) {
  return bookings.filter(
    (booking) =>
      REMOVED_SERVICE_IDS.includes(
        booking.serviceId as (typeof REMOVED_SERVICE_IDS)[number],
      ) &&
      (booking.status === "pending" || booking.status === "confirmed"),
  );
}

function mergeServiceIds(serviceIds: readonly string[]) {
  const firstSourceIndex = serviceIds.findIndex((id) =>
    SOURCE_SERVICE_IDS.includes(id as (typeof SOURCE_SERVICE_IDS)[number]),
  );
  if (firstSourceIndex < 0) return [...serviceIds];

  const beforeFirst = serviceIds
    .slice(0, firstSourceIndex)
    .filter(
      (id) =>
        !SOURCE_SERVICE_IDS.includes(id as (typeof SOURCE_SERVICE_IDS)[number]),
    ).length;
  const remaining = serviceIds.filter(
    (id) =>
      !SOURCE_SERVICE_IDS.includes(id as (typeof SOURCE_SERVICE_IDS)[number]),
  );
  remaining.splice(beforeFirst, 0, MERGED_SERVICE_ID);
  return remaining;
}

function affectedTherapistIds(content: CmsContentState) {
  return content.team
    .filter((member) =>
      member.serviceIds.some((id) =>
        SOURCE_SERVICE_IDS.includes(id as (typeof SOURCE_SERVICE_IDS)[number]),
      ),
    )
    .map((member) => member.id)
    .sort((first, second) => first.localeCompare(second));
}

export function createServiceMergePlan(
  database: string,
  content: CmsContentState,
  publication: CmsPublication,
  bookings: readonly ServiceMergeBooking[],
): ServiceMergePlan {
  const contentState = mergeState(content);
  const publicationState = mergeState(publication.snapshot);
  if (
    publication.revision !== publication.snapshot.revision ||
    publication.revision !== content.revision
  ) {
    throw new Error(
      "The current content and publication revisions do not match; no merge was planned.",
    );
  }
  const contentFingerprint = sourceFingerprint(content);
  const publicationFingerprint = sourceFingerprint(publication.snapshot);
  if (contentFingerprint !== publicationFingerprint) {
    throw new Error(
      "The current content and public treatment data differ; no merge was planned.",
    );
  }
  if (contentState.state !== publicationState.state) {
    throw new Error("The current publication has a different treatment merge state.");
  }

  const blockedBookings = activeRemovedServiceBookings(bookings);
  if (blockedBookings.length > 0) {
    throw new Error(
      "A pending or confirmed booking uses Head Spa or Foot & Reflexology Spa. Review those appointments before merging.",
    );
  }

  return {
    version: SERVICE_MERGE_VERSION,
    migrationNeeded: contentState.state === "pending",
    database,
    baseline: {
      contentRevision: content.revision,
      publicationId: publication.id,
      publicationRevision: publication.revision,
      sourceFingerprint: contentFingerprint,
      bookingGuardHash: bookingGuardHash(bookings),
    },
    actions: {
      keepServiceId: MERGED_SERVICE_ID,
      destinationSlug: MERGED_SERVICE_SLUG,
      destinationName: MERGED_SERVICE_NAME,
      removeServiceIds: REMOVED_SERVICE_IDS,
      affectedTherapistIds: affectedTherapistIds(content),
      servicesBefore: content.services.length,
      servicesAfter:
        content.services.length - (contentState.state === "pending" ? 2 : 0),
      bookingsPreserved: bookings.length,
      activeRemovedServiceBookings: blockedBookings.length,
      bookingSummary: summariseBookings(bookings),
      emailsSent: 0,
    },
  };
}

export function serviceMergePlanHash(plan: ServiceMergePlan) {
  return sha256(plan);
}

export function buildMergedTreatmentContent(
  content: CmsContentState,
  context: ServiceMergeBuildContext,
): CmsContentState {
  const state = mergeState(content);
  if (state.state === "merged") return structuredClone(content);

  const mergedService: CmsServiceRecord = {
    ...state.canonical,
    slug: MERGED_SERVICE_SLUG,
    name: MERGED_SERVICE_NAME,
    shortDescription:
      "A soothing 60-minute treatment combining foot massage with focused massage for the back, neck and head.",
    longDescription:
      "Enjoy a balanced treatment that brings several favourite areas together in one appointment. The session includes soothing foot massage, followed by focused work across the back, neck and head. Your therapist will adapt the pressure and pacing to your comfort, giving each area attention within a calm 60-minute treatment.",
    imageUrl: state.footSpa.imageUrl,
    imageAlt: state.footSpa.imageAlt,
    hero: {
      imageUrl: state.headSpa.imageUrl,
      altText: state.headSpa.imageAlt,
    },
    galleryImages: state.canonical.galleryImages.map((image, index) => ({
      ...image,
      caption: [
        "Focused massage for the back, neck and shoulders.",
        "Controlled pressure tailored to your comfort.",
        "A calm setting prepared for your combined treatment.",
      ][index] ?? image.caption,
    })),
    prices: [
      {
        id: "foot-massage-back-neck-head-60",
        durationMinutes: 60,
        priceCents: 6_500,
        active: true,
      },
    ],
    idealFor: [
      "Guests who want foot and upper-body massage in one session",
      "A balanced treatment for the feet, back, neck and head",
      "Anyone who prefers pressure adjusted throughout the appointment",
    ],
    highlights: [
      "Soothing foot massage",
      "Focused back and neck massage",
      "Relaxing head massage",
    ],
    priceNote: "",
    seoTitle: "Foot, Back, Neck & Head Massage in Howth | Siriranee",
    seoDescription:
      "Book a 60-minute foot massage including back, neck and head massage at Siriranee Thai Massage in Howth for €65.",
    version: state.canonical.version + 1,
    updatedAt: context.now,
  };

  const services = content.services.flatMap((service) => {
    if (REMOVED_SERVICE_IDS.includes(service.id as (typeof REMOVED_SERVICE_IDS)[number])) {
      return [];
    }
    return service.id === MERGED_SERVICE_ID ? [mergedService] : [service];
  });
  const team = content.team.map((member) => {
    const serviceIds = mergeServiceIds(member.serviceIds);
    if (JSON.stringify(serviceIds) === JSON.stringify(member.serviceIds)) return member;
    return {
      ...member,
      serviceIds,
      version: member.version + 1,
      updatedAt: context.now,
    };
  });

  return {
    ...content,
    revision: content.revision + 1,
    services,
    team,
    updatedAt: context.now,
    updatedBy: context.actorId ?? systemActorId,
  };
}

export function assertMergedTreatmentContent(
  content: CmsContentState,
  expectedTherapistIds: readonly string[],
) {
  const state = mergeState(content);
  if (state.state !== "merged") {
    throw new Error("The combined treatment was not stored correctly.");
  }
  const service = state.canonical;
  if (
    service.prices.length !== 1 ||
    service.prices[0]?.durationMinutes !== 60 ||
    service.prices[0]?.priceCents !== 6_500 ||
    service.prices[0]?.active !== true ||
    service.shortDescription !==
      "A soothing 60-minute treatment combining foot massage with focused massage for the back, neck and head." ||
    service.highlights.length !== 3
  ) {
    throw new Error("The combined treatment details failed verification.");
  }
  if (
    content.team.some((member) =>
      member.serviceIds.some((id) =>
        REMOVED_SERVICE_IDS.includes(id as (typeof REMOVED_SERVICE_IDS)[number]),
      ),
    )
  ) {
    throw new Error("A therapist still references a removed treatment.");
  }
  for (const therapistId of expectedTherapistIds) {
    const therapist = content.team.find((member) => member.id === therapistId);
    if (!therapist?.serviceIds.includes(MERGED_SERVICE_ID)) {
      throw new Error(`Therapist ${therapistId} is missing the combined treatment.`);
    }
  }
}

