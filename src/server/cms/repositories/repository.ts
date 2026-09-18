import "server-only";

import type {
  CmsAuditEvent,
  CmsBooking,
  CmsFutureTherapistBooking,
  CmsBookingNotification,
  CmsEmailDeliveryEvent,
  CmsBookingOccupancy,
  CmsBookingQuery,
  CmsClosure,
  CmsContentState,
  CmsLoginAttempt,
  CmsMediaAsset,
  CmsPublication,
  CmsSession,
  CmsTherapistContact,
  CmsTherapistDeletionImpact,
  CmsUser,
} from "@/domain/cms/types";
import type {
  PublicBookingIdentifier,
  PublicBookingStatusSource,
} from "@/domain/booking/public-status";
import type { CmsMode } from "@/server/cms/config";
import type { CmsBookingEmailAttention } from "@/domain/cms/notification-presentation";

export class CmsConflictError extends Error {
  constructor(message = "This record was changed by another request.") {
    super(message);
    this.name = "CmsConflictError";
  }
}

export interface CmsRepository {
  readonly mode: Exclude<CmsMode, "disabled">;

  transaction<T>(work: (repository: CmsRepository) => Promise<T>): Promise<T>;

  getContent(): Promise<CmsContentState>;
  saveContent(
    content: CmsContentState,
    expectedRevision: number,
  ): Promise<CmsContentState>;
  getPublishedContent(): Promise<CmsPublication | null>;
  getPublication(id: string): Promise<CmsPublication | null>;
  listPublications(limit?: number): Promise<readonly CmsPublication[]>;
  savePublication(publication: CmsPublication): Promise<void>;

  getTherapistContact(id: string): Promise<CmsTherapistContact | null>;
  saveTherapistContact(
    contact: CmsTherapistContact,
    expectedVersion?: number,
  ): Promise<CmsTherapistContact>;
  getTherapistDeletionImpact(
    therapistId: string,
  ): Promise<CmsTherapistDeletionImpact>;
  deleteTherapistCascade(
    therapistId: string,
  ): Promise<CmsTherapistDeletionImpact>;

  getMediaAsset(publicId: string): Promise<CmsMediaAsset | null>;
  saveMediaAsset(
    asset: CmsMediaAsset,
    expectedVersion?: number,
  ): Promise<CmsMediaAsset>;
  isMediaAssetReferenced(
    publicId: string,
    secureUrl: string,
  ): Promise<boolean>;

  findUserByUsername(username: string): Promise<CmsUser | null>;
  findUserById(id: string): Promise<CmsUser | null>;
  listUsers(): Promise<readonly CmsUser[]>;
  insertUser(user: CmsUser): Promise<void>;
  updateUser(user: CmsUser, expectedVersion: number): Promise<void>;
  recordUserLogin(
    userId: string,
    expectedAuthVersion: number,
    timestamp: string,
  ): Promise<CmsUser | null>;
  lockUserDirectory(): Promise<void>;

  findSessionByTokenHash(tokenHash: string): Promise<CmsSession | null>;
  saveSession(session: CmsSession): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;

  getLoginAttempt(key: string): Promise<CmsLoginAttempt | null>;
  incrementLoginAttempt(
    key: string,
    expiresAt: string,
  ): Promise<CmsLoginAttempt>;
  saveLoginAttempt(attempt: CmsLoginAttempt): Promise<void>;
  deleteLoginAttempt(key: string): Promise<void>;

  appendAudit(event: CmsAuditEvent): Promise<void>;
  listAudit(limit?: number): Promise<readonly CmsAuditEvent[]>;
  listAuditForEntity(
    entityType: string,
    entityId: string,
    limit?: number,
  ): Promise<readonly CmsAuditEvent[]>;

  listBookings(query?: CmsBookingQuery): Promise<readonly CmsBooking[]>;
  listBookingOccupancy(
    from: string,
    to: string,
  ): Promise<readonly CmsBookingOccupancy[]>;
  listConfirmedBookingOccupancy(
    from: string,
    to: string,
  ): Promise<readonly CmsBookingOccupancy[]>;
  listFutureActiveTherapistBookings(
    therapistId: string,
    afterIso: string,
  ): Promise<readonly CmsFutureTherapistBooking[]>;
  getBooking(id: string): Promise<CmsBooking | null>;
  findBookingPublicStatus(
    identifier: PublicBookingIdentifier,
  ): Promise<PublicBookingStatusSource | null>;
  findBookingByIdempotencyHash(hash: string): Promise<CmsBooking | null>;
  saveBooking(
    booking: CmsBooking,
    expectedVersion?: number,
  ): Promise<CmsBooking>;
  deleteBooking(id: string, expectedVersion: number): Promise<boolean>;

  listClosures(from?: string, to?: string): Promise<readonly CmsClosure[]>;
  saveClosure(
    closure: CmsClosure,
    expectedVersion?: number,
  ): Promise<CmsClosure>;

  listNotifications(
    bookingId?: string,
    limit?: number,
  ): Promise<readonly CmsBookingNotification[]>;
  listDashboardNotifications(
    limit?: number,
  ): Promise<readonly CmsBookingNotification[]>;
  listBookingEmailAttention(
    bookingIds?: readonly string[],
    limit?: number,
  ): Promise<readonly CmsBookingEmailAttention[]>;
  getNotification(id: string): Promise<CmsBookingNotification | null>;
  recordEmailDeliveryEvent(event: CmsEmailDeliveryEvent): Promise<void>;
  reconcileEmailDeliveryEvents(providerMessageId: string): Promise<void>;
  saveNotification(notification: CmsBookingNotification): Promise<void>;
  saveNotificationIfAbsent(
    notification: CmsBookingNotification,
  ): Promise<CmsBookingNotification>;
  claimNotificationDelivery(
    id: string,
    expectedStatus: CmsBookingNotification["status"],
    expectedAttemptCount: number,
    expectedClaimId: string | undefined,
    claimId: string,
    attemptedAt: string,
    firstAttemptedAt: string,
  ): Promise<CmsBookingNotification | null>;
  completeNotificationDelivery(
    notification: CmsBookingNotification,
    claimId: string,
  ): Promise<boolean>;

  lockBookingDate(localDate: string): Promise<void>;
  /** Serialize therapist changes and assignments inside a transaction, before date locks. */
  lockTherapist(therapistId: string): Promise<void>;
}
