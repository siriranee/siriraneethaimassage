import "server-only";

import type {
  CmsAuditEvent,
  CmsBooking,
  CmsFutureTherapistBooking,
  CmsBookingNotification,
  CmsEmailDeliveryEvent,
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
import type { PublicBookingIdentifier } from "@/domain/booking/public-status";
import { applyEmailDeliveryEvent } from "@/domain/booking/email-delivery";
import { bookingEmailNeedsAttention, type CmsBookingEmailAttention } from "@/domain/cms/notification-presentation";
import {
  createDefaultContentState,
  createMockAdministrator,
  createMockBookings,
} from "@/server/cms/default-content";
import {
  CmsConflictError,
  type CmsRepository,
} from "@/server/cms/repositories/repository";
import { CMS_PUBLICATION_RETENTION_COUNT } from "@/server/cms/data-retention";
import { cmsContentReferencesMediaAsset } from "@/server/media/references";

type MockState = {
  content: CmsContentState;
  publication: CmsPublication;
  publications: CmsPublication[];
  mediaAssets: CmsMediaAsset[];
  therapistContacts: CmsTherapistContact[];
  users: CmsUser[];
  sessions: CmsSession[];
  loginAttempts: CmsLoginAttempt[];
  audit: CmsAuditEvent[];
  bookings: CmsBooking[];
  closures: CmsClosure[];
  notifications: CmsBookingNotification[];
  emailDeliveryEvents: CmsEmailDeliveryEvent[];
};

type MockGlobal = typeof globalThis & {
  __siriraneeCmsMockState?: MockState;
  __siriraneeCmsMockQueue?: Promise<void>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normaliseBooking(booking: CmsBooking): CmsBooking {
  return {
    ...booking,
    assignedStaffId:
      typeof booking.assignedStaffId === "string" ? booking.assignedStaffId : "",
    assignedStaffName:
      typeof booking.assignedStaffName === "string"
        ? booking.assignedStaffName
        : "",
  };
}

function therapistDeletionImpact(
  bookings: readonly CmsBooking[],
): CmsTherapistDeletionImpact {
  return {
    bookingCount: bookings.length,
    bookingReferences: bookings
      .slice(0, 5)
      .map((booking) => booking.reference),
  };
}

function createState(): MockState {
  const content = createDefaultContentState();
  const publication: CmsPublication = {
    id: "mock-publication-1",
    revision: content.revision,
    publishedAt: content.updatedAt,
    publishedBy: "system-seed",
    snapshot: clone(content),
  };

  return {
    content,
    publication,
    publications: [publication],
    mediaAssets: [],
    therapistContacts: [],
    users: [createMockAdministrator()],
    sessions: [],
    loginAttempts: [],
    audit: [],
    bookings: [...createMockBookings()],
    closures: [],
    notifications: [],
    emailDeliveryEvents: [],
  };
}

function getGlobalState() {
  const cmsGlobal = globalThis as MockGlobal;
  cmsGlobal.__siriraneeCmsMockState ??= createState();
  cmsGlobal.__siriraneeCmsMockState.mediaAssets ??= [];
  cmsGlobal.__siriraneeCmsMockState.therapistContacts ??= [];
  cmsGlobal.__siriraneeCmsMockState.emailDeliveryEvents ??= [];
  cmsGlobal.__siriraneeCmsMockQueue ??= Promise.resolve();

  return cmsGlobal;
}

function includesSearch(booking: CmsBooking, search: string) {
  const haystack = [
    booking.reference,
    booking.customer.name,
    booking.customer.phone,
    booking.customer.email,
    booking.serviceName,
    booking.assignedStaffName,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

export class MockCmsRepository implements CmsRepository {
  readonly mode = "mock" as const;

  constructor(private readonly transactionState?: MockState) {}

  private get state() {
    return (
      this.transactionState ??
      getGlobalState().__siriraneeCmsMockState!
    );
  }

  async transaction<T>(work: (repository: CmsRepository) => Promise<T>) {
    const cmsGlobal = getGlobalState();
    const previous = cmsGlobal.__siriraneeCmsMockQueue!;
    let release: () => void = () => {};
    cmsGlobal.__siriraneeCmsMockQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    const workingState = clone(cmsGlobal.__siriraneeCmsMockState!);

    try {
      const result = await work(new MockCmsRepository(workingState));
      cmsGlobal.__siriraneeCmsMockState = workingState;
      return result;
    } finally {
      release();
    }
  }

  async getContent() {
    return clone(this.state.content);
  }

  async saveContent(content: CmsContentState, expectedRevision: number) {
    if (this.state.content.revision !== expectedRevision) {
      throw new CmsConflictError();
    }

    this.state.content = clone(content);
    return clone(content);
  }

  async getPublishedContent() {
    return clone(this.state.publication);
  }

  async getPublication(id: string) {
    return clone(this.state.publications.find((item) => item.id === id) ?? null);
  }

  async listPublications(limit = 25) {
    return clone(
      [...this.state.publications]
        .sort((first, second) => second.publishedAt.localeCompare(first.publishedAt))
        .slice(0, Math.max(1, Math.min(limit, 100))),
    );
  }

  async savePublication(publication: CmsPublication) {
    this.state.publication = clone(publication);
    this.state.publications = this.state.publications.filter((item) => item.id !== publication.id);
    this.state.publications.unshift(clone(publication));
    this.state.publications = this.state.publications
      .sort((first, second) => second.publishedAt.localeCompare(first.publishedAt))
      .slice(0, CMS_PUBLICATION_RETENTION_COUNT);
  }

  async getTherapistContact(id: string) {
    return clone(
      this.state.therapistContacts.find((contact) => contact.id === id) ?? null,
    );
  }

  async saveTherapistContact(
    contact: CmsTherapistContact,
    expectedVersion?: number,
  ) {
    const index = this.state.therapistContacts.findIndex(
      (item) => item.id === contact.id,
    );

    if (expectedVersion === undefined) {
      if (index >= 0) throw new CmsConflictError();
      this.state.therapistContacts.push(clone(contact));
      return clone(contact);
    }

    if (
      index < 0 ||
      this.state.therapistContacts[index].version !== expectedVersion
    ) {
      throw new CmsConflictError();
    }

    this.state.therapistContacts[index] = clone(contact);
    return clone(contact);
  }

  async getTherapistDeletionImpact(therapistId: string) {
    const bookings = this.state.bookings
      .filter((booking) => booking.assignedStaffId === therapistId)
      .sort((first, second) =>
        first.startsAt.localeCompare(second.startsAt) ||
        first.id.localeCompare(second.id),
      );
    return clone(therapistDeletionImpact(bookings));
  }

  async deleteTherapistCascade(therapistId: string) {
    if (!this.transactionState) {
      throw new Error("Therapist deletion requires a transaction.");
    }

    const bookings = this.state.bookings
      .filter((booking) => booking.assignedStaffId === therapistId)
      .sort((first, second) =>
        first.startsAt.localeCompare(second.startsAt) ||
        first.id.localeCompare(second.id),
      );
    const bookingCountBefore = this.state.bookings.length;
    const bookingIds = new Set(bookings.map((booking) => booking.id));
    this.state.notifications = this.state.notifications.filter(
      (notification) => !bookingIds.has(notification.bookingId),
    );
    this.state.bookings = this.state.bookings.filter(
      (booking) => booking.assignedStaffId !== therapistId,
    );
    if (bookingCountBefore - this.state.bookings.length !== bookings.length) {
      throw new CmsConflictError(
        "The therapist's bookings changed while deletion was in progress.",
      );
    }
    return clone(therapistDeletionImpact(bookings));
  }

  async getMediaAsset(publicId: string) {
    return clone(
      this.state.mediaAssets.find((asset) => asset.publicId === publicId) ?? null,
    );
  }

  async saveMediaAsset(asset: CmsMediaAsset, expectedVersion?: number) {
    const index = this.state.mediaAssets.findIndex(
      (item) => item.publicId === asset.publicId,
    );

    if (expectedVersion === undefined) {
      if (index >= 0) throw new CmsConflictError("This image already exists.");
      this.state.mediaAssets.push(clone(asset));
      return clone(asset);
    }

    if (index < 0 || this.state.mediaAssets[index].version !== expectedVersion) {
      throw new CmsConflictError();
    }

    this.state.mediaAssets[index] = clone(asset);
    return clone(asset);
  }

  async isMediaAssetReferenced(publicId: string, secureUrl: string) {
    const asset = { publicId, secureUrl };
    return (
      cmsContentReferencesMediaAsset(this.state.content, asset) ||
      this.state.publications.some((publication) =>
        cmsContentReferencesMediaAsset(publication.snapshot, asset),
      )
    );
  }

  async findUserByUsername(username: string) {
    return clone(
      this.state.users.find((user) => user.username === username.toLowerCase()) ??
        null,
    );
  }

  async findUserById(id: string) {
    return clone(this.state.users.find((user) => user.id === id) ?? null);
  }

  async listUsers() {
    return clone(
      [...this.state.users].sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      ),
    );
  }

  async insertUser(user: CmsUser) {
    if (
      this.state.users.some(
        (item) => item.id === user.id || item.username === user.username,
      )
    ) {
      throw new CmsConflictError("That username is already in use.");
    }

    this.state.users.push(clone(user));
  }

  async updateUser(user: CmsUser, expectedVersion: number) {
    const index = this.state.users.findIndex((item) => item.id === user.id);
    const current = this.state.users[index];
    const currentVersion =
      current && Number.isInteger(current.version) ? current.version : 0;

    if (!current || currentVersion !== expectedVersion) {
      throw new CmsConflictError();
    }
    if (
      this.state.users.some(
        (item) => item.id !== user.id && item.username === user.username,
      )
    ) {
      throw new CmsConflictError("That username is already in use.");
    }

    this.state.users[index] = clone({
      ...user,
      lastLoginAt:
        current.lastLoginAt > user.lastLoginAt
          ? current.lastLoginAt
          : user.lastLoginAt,
      updatedAt:
        current.updatedAt > user.updatedAt ? current.updatedAt : user.updatedAt,
    });
  }

  async recordUserLogin(
    userId: string,
    expectedAuthVersion: number,
    timestamp: string,
  ) {
    const index = this.state.users.findIndex(
      (user) =>
        user.id === userId &&
        user.active &&
        user.authVersion === expectedAuthVersion,
    );
    if (index < 0) return null;

    const updated = {
      ...this.state.users[index],
      lastLoginAt: timestamp,
      updatedAt: timestamp,
    };
    this.state.users[index] = updated;
    return clone(updated);
  }

  async lockUserDirectory() {
    // Mock transactions already serialize all CMS mutations through one queue.
  }

  async findSessionByTokenHash(tokenHash: string) {
    return clone(
      this.state.sessions.find((session) => session.tokenHash === tokenHash) ??
        null,
    );
  }

  async saveSession(session: CmsSession) {
    this.state.sessions = this.state.sessions.filter(
      (item) => item.tokenHash !== session.tokenHash,
    );
    this.state.sessions.push(clone(session));
  }

  async deleteSession(tokenHash: string) {
    this.state.sessions = this.state.sessions.filter(
      (session) => session.tokenHash !== tokenHash,
    );
  }

  async deleteSessionsForUser(userId: string) {
    this.state.sessions = this.state.sessions.filter(
      (session) => session.userId !== userId,
    );
  }

  async getLoginAttempt(key: string) {
    return clone(
      this.state.loginAttempts.find((attempt) => attempt.key === key) ?? null,
    );
  }

  async incrementLoginAttempt(key: string, expiresAt: string) {
    const current = this.state.loginAttempts.find((attempt) => attempt.key === key);
    const next: CmsLoginAttempt = current
      ? { ...current, count: current.count + 1 }
      : { key, count: 1, lockedUntil: "", expiresAt };
    this.state.loginAttempts = this.state.loginAttempts.filter(
      (attempt) => attempt.key !== key,
    );
    this.state.loginAttempts.push(next);
    return clone(next);
  }

  async saveLoginAttempt(attempt: CmsLoginAttempt) {
    this.state.loginAttempts = this.state.loginAttempts.filter(
      (item) => item.key !== attempt.key,
    );
    this.state.loginAttempts.push(clone(attempt));
  }

  async deleteLoginAttempt(key: string) {
    this.state.loginAttempts = this.state.loginAttempts.filter(
      (attempt) => attempt.key !== key,
    );
  }

  async appendAudit(event: CmsAuditEvent) {
    this.state.audit.unshift(clone(event));
  }

  async listAudit(limit = 100) {
    return clone(this.state.audit.slice(0, Math.max(1, Math.min(limit, 500))));
  }

  async listAuditForEntity(entityType: string, entityId: string, limit = 100) {
    return clone(
      this.state.audit
        .filter((event) => event.entityType === entityType && event.entityId === entityId)
        .slice(0, Math.max(1, Math.min(limit, 500))),
    );
  }

  async listBookings(query: CmsBookingQuery = {}) {
    const nowIso = new Date().toISOString();
    const sortDirection = query.order === "startsAt-desc" ? -1 : 1;
    const filtered = this.state.bookings.filter((booking) => {
      if (query.from && booking.localDate < query.from) return false;
      if (query.to && booking.localDate > query.to) return false;
      if (query.status && booking.status !== query.status) return false;
      if (query.source && booking.source !== query.source) return false;
      if (query.serviceId && booking.serviceId !== query.serviceId) return false;
      if (
        query.therapistId &&
        booking.assignedStaffId !== query.therapistId
      ) return false;
      if (
        query.attention === "unassigned" &&
        !(
          !booking.assignedStaffId?.trim() &&
          booking.endsAt > nowIso &&
          (booking.status === "confirmed" || booking.status === "pending")
        )
      ) return false;
      if (query.search && !includesSearch(booking, query.search)) return false;
      return true;
    });

    return clone(
      filtered
        .sort((first, second) => {
          const startsAtOrder = first.startsAt.localeCompare(second.startsAt);
          if (startsAtOrder !== 0) return startsAtOrder * sortDirection;
          return first.id.localeCompare(second.id) * sortDirection;
        })
        .map(normaliseBooking),
    );
  }

  async listBookingOccupancy(from: string, to: string) {
    return clone(
      this.state.bookings
        .filter(
          (booking) =>
            booking.localDate >= from && booking.localDate <= to,
        )
        .map((booking) => ({
          id: booking.id,
          localDate: booking.localDate,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          status: booking.status,
          assignedStaffId:
            typeof booking.assignedStaffId === "string"
              ? booking.assignedStaffId
              : "",
        })),
    );
  }

  async listConfirmedBookingOccupancy(from: string, to: string) {
    return clone(
      this.state.bookings
        .filter(
          (booking) =>
            booking.status === "confirmed" &&
            booking.localDate >= from &&
            booking.localDate <= to,
        )
        .map((booking) => ({
          id: booking.id,
          localDate: booking.localDate,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          status: booking.status,
          assignedStaffId:
            typeof booking.assignedStaffId === "string"
              ? booking.assignedStaffId
              : "",
        })),
    );
  }

  async listFutureActiveTherapistBookings(
    therapistId: string,
    afterIso: string,
  ): Promise<readonly CmsFutureTherapistBooking[]> {
    return clone(
      this.state.bookings
        .filter(
          (booking) =>
            booking.assignedStaffId === therapistId &&
            booking.endsAt > afterIso &&
            (booking.status === "confirmed" || booking.status === "pending"),
        )
        .sort((first, second) => first.startsAt.localeCompare(second.startsAt))
        .map(({ reference, serviceId }) => ({ reference, serviceId })),
    );
  }

  async getBooking(id: string) {
    const booking = this.state.bookings.find((item) => item.id === id);
    return clone(booking ? normaliseBooking(booking) : null);
  }

  async findBookingPublicStatus(identifier: PublicBookingIdentifier) {
    const booking = this.state.bookings.find((item) =>
      identifier.kind === "id"
        ? item.id.toLowerCase() === identifier.value
        : item.reference.toUpperCase() === identifier.value,
    );

    return booking
      ? { status: booking.status }
      : null;
  }

  async findBookingByIdempotencyHash(hash: string) {
    const booking = this.state.bookings.find(
      (item) => item.idempotencyKeyHash === hash,
    );
    return clone(booking ? normaliseBooking(booking) : null);
  }

  async saveBooking(booking: CmsBooking, expectedVersion?: number) {
    const index = this.state.bookings.findIndex((item) => item.id === booking.id);

    if (
      index >= 0 &&
      expectedVersion !== undefined &&
      this.state.bookings[index].version !== expectedVersion
    ) {
      throw new CmsConflictError();
    }

    if (index >= 0) this.state.bookings[index] = clone(booking);
    else this.state.bookings.push(clone(booking));

    return clone(booking);
  }

  async deleteBooking(id: string, expectedVersion: number) {
    const index = this.state.bookings.findIndex((booking) => booking.id === id);
    if (index < 0) return false;
    if (this.state.bookings[index].version !== expectedVersion) {
      throw new CmsConflictError();
    }

    this.state.bookings.splice(index, 1);
    this.state.notifications = this.state.notifications.filter(
      (notification) => notification.bookingId !== id,
    );
    return true;
  }

  async listClosures(from?: string, to?: string) {
    return clone(
      this.state.closures
        .filter((closure) => {
          if (from && closure.localDate < from) return false;
          if (to && closure.localDate > to) return false;
          return true;
        })
        .sort((first, second) => first.localDate.localeCompare(second.localDate)),
    );
  }

  async saveClosure(closure: CmsClosure, expectedVersion?: number) {
    const index = this.state.closures.findIndex((item) => item.id === closure.id);

    if (
      index >= 0 &&
      expectedVersion !== undefined &&
      this.state.closures[index].version !== expectedVersion
    ) {
      throw new CmsConflictError();
    }

    if (index >= 0) this.state.closures[index] = clone(closure);
    else this.state.closures.push(clone(closure));

    return clone(closure);
  }

  async listNotifications(bookingId?: string, limit = 200) {
    return clone(
      this.state.notifications
        .filter((item) => !bookingId || item.bookingId === bookingId)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .slice(0, Math.max(1, Math.min(limit, 500))),
    );
  }

  async listDashboardNotifications(limit = 8) {
    return clone(
      this.state.notifications
        .filter((item) => item.channel === "dashboard")
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .slice(0, Math.max(1, Math.min(limit, 20))),
    );
  }

  async listBookingEmailAttention(bookingIds?: readonly string[], limit = 8) {
    const ids = bookingIds ? new Set(bookingIds.slice(0, 500)) : null;
    const groups = new Map<string, CmsBookingEmailAttention>();
    for (const notification of this.state.notifications) {
      if (ids && !ids.has(notification.bookingId)) continue;
      const booking = this.state.bookings.find((item) => item.id === notification.bookingId) ?? null;
      if (!bookingEmailNeedsAttention(notification, booking)) continue;
      const current = groups.get(notification.bookingId);
      groups.set(notification.bookingId, {
        bookingId: notification.bookingId,
        bookingReference: notification.bookingReference,
        count: (current?.count ?? 0) + 1,
        audiences: [...new Set([...current?.audiences ?? [], notification.audience ?? "customer"])],
        updatedAt: current && current.updatedAt > notification.updatedAt ? current.updatedAt : notification.updatedAt,
      });
    }
    return clone([...groups.values()]
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || first.bookingId.localeCompare(second.bookingId))
      .slice(0, Math.max(1, Math.min(limit, 500))));
  }

  async getNotification(id: string) {
    return clone(this.state.notifications.find((item) => item.id === id) ?? null);
  }

  async recordEmailDeliveryEvent(event: CmsEmailDeliveryEvent) {
    if (!this.state.emailDeliveryEvents.some((item) => item.id === event.id)) {
      this.state.emailDeliveryEvents.push(clone(event));
    }
    await this.reconcileEmailDeliveryEvents(event.providerMessageId);
  }

  async reconcileEmailDeliveryEvents(providerMessageId: string) {
    const events = this.state.emailDeliveryEvents.filter((event) =>
      event.providerMessageId === providerMessageId);
    this.state.notifications = this.state.notifications.map((notification) =>
      events.reduce(applyEmailDeliveryEvent, notification));
  }

  async saveNotification(notification: CmsBookingNotification) {
    const index = this.state.notifications.findIndex((item) => item.id === notification.id);
    if (index >= 0) this.state.notifications[index] = clone(notification);
    else this.state.notifications.push(clone(notification));
  }

  async saveNotificationIfAbsent(notification: CmsBookingNotification) {
    const existing = this.state.notifications.find(
      (item) => item.id === notification.id,
    );
    if (existing) return clone(existing);
    this.state.notifications.push(clone(notification));
    return clone(notification);
  }

  async claimNotificationDelivery(
    id: string,
    expectedStatus: CmsBookingNotification["status"],
    expectedAttemptCount: number,
    expectedClaimId: string | undefined,
    claimId: string,
    attemptedAt: string,
    firstAttemptedAt: string,
  ) {
    const index = this.state.notifications.findIndex((item) => item.id === id);
    const current = this.state.notifications[index];
    if (
      !current ||
      current.status !== expectedStatus ||
      current.attemptCount !== expectedAttemptCount ||
      current.deliveryClaimId !== expectedClaimId
    ) {
      return null;
    }

    const claimed: CmsBookingNotification = {
      ...current,
      status: "sending",
      attemptCount: current.attemptCount + 1,
      firstAttemptedAt,
      attemptedAt,
      deliveryClaimId: claimId,
      deliveryClaimedAt: attemptedAt,
      updatedAt: attemptedAt,
    };
    this.state.notifications[index] = clone(claimed);
    return clone(claimed);
  }

  async completeNotificationDelivery(
    notification: CmsBookingNotification,
    claimId: string,
  ) {
    const index = this.state.notifications.findIndex(
      (item) =>
        item.id === notification.id &&
        item.status === "sending" &&
        item.deliveryClaimId === claimId,
    );
    if (index < 0) return false;
    this.state.notifications[index] = clone(notification);
    if (notification.providerMessageId) {
      await this.reconcileEmailDeliveryEvents(notification.providerMessageId);
    }
    return true;
  }

  async lockBookingDate(localDate: string) {
    void localDate;
  }

  async lockTherapist(therapistId: string) {
    // Mock transactions already serialize all mutations through one queue.
    void therapistId;
  }
}
