import "server-only";

import type {
  CmsAuditEvent,
  CmsBooking,
  CmsBookingHold,
  CmsBookingNotification,
  CmsBookingQuery,
  CmsClosure,
  CmsContentState,
  CmsLoginAttempt,
  CmsMediaAsset,
  CmsPublication,
  CmsSession,
  CmsUser,
} from "@/domain/cms/types";
import type { PublicBookingIdentifier } from "@/domain/booking/public-status";
import {
  createDefaultContentState,
  createMockAdministrator,
  createMockBookings,
} from "@/server/cms/default-content";
import {
  CmsConflictError,
  type CmsRepository,
} from "@/server/cms/repositories/repository";
import { cmsContentReferencesMediaAsset } from "@/server/media/references";

type MockState = {
  content: CmsContentState;
  publication: CmsPublication;
  publications: CmsPublication[];
  mediaAssets: CmsMediaAsset[];
  users: CmsUser[];
  sessions: CmsSession[];
  loginAttempts: CmsLoginAttempt[];
  audit: CmsAuditEvent[];
  bookings: CmsBooking[];
  closures: CmsClosure[];
  holds: CmsBookingHold[];
  notifications: CmsBookingNotification[];
};

type MockGlobal = typeof globalThis & {
  __siriraneeCmsMockState?: MockState;
  __siriraneeCmsMockQueue?: Promise<void>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
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
    users: [createMockAdministrator()],
    sessions: [],
    loginAttempts: [],
    audit: [],
    bookings: [...createMockBookings()],
    closures: [],
    holds: [],
    notifications: [],
  };
}

function getGlobalState() {
  const cmsGlobal = globalThis as MockGlobal;
  cmsGlobal.__siriraneeCmsMockState ??= createState();
  cmsGlobal.__siriraneeCmsMockState.mediaAssets ??= [];
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
    const filtered = this.state.bookings.filter((booking) => {
      if (query.from && booking.localDate < query.from) return false;
      if (query.to && booking.localDate > query.to) return false;
      if (query.status && booking.status !== query.status) return false;
      if (query.source && booking.source !== query.source) return false;
      if (query.serviceId && booking.serviceId !== query.serviceId) return false;
      if (
        query.attention === "expired" &&
        !(
          booking.status === "pending" &&
          booking.capacityExpiresAt &&
          booking.capacityExpiresAt <= new Date().toISOString()
        )
      ) return false;
      if (query.search && !includesSearch(booking, query.search)) return false;
      return true;
    });

    return clone(
      filtered.sort((first, second) =>
        first.startsAt.localeCompare(second.startsAt),
      ),
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
          expiresAt: booking.capacityExpiresAt || "",
        })),
    );
  }

  async getBooking(id: string) {
    return clone(this.state.bookings.find((booking) => booking.id === id) ?? null);
  }

  async findBookingPublicStatus(identifier: PublicBookingIdentifier) {
    const booking = this.state.bookings.find((item) =>
      identifier.kind === "id"
        ? item.id.toLowerCase() === identifier.value
        : item.reference.toUpperCase() === identifier.value,
    );

    return booking
      ? {
          status: booking.status,
          capacityExpiresAt: booking.capacityExpiresAt,
        }
      : null;
  }

  async findBookingByIdempotencyHash(hash: string) {
    return clone(
      this.state.bookings.find(
        (booking) => booking.idempotencyKeyHash === hash,
      ) ?? null,
    );
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

  async getNotification(id: string) {
    return clone(this.state.notifications.find((item) => item.id === id) ?? null);
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
    return true;
  }

  async listActiveHolds(nowIso: string) {
    return clone(
      this.state.holds.filter(
        (hold) => hold.status === "active" && hold.expiresAt > nowIso,
      ),
    );
  }

  async findHoldByTokenHash(tokenHash: string) {
    return clone(
      this.state.holds.find((hold) => hold.tokenHash === tokenHash) ?? null,
    );
  }

  async saveHold(hold: CmsBookingHold) {
    const index = this.state.holds.findIndex((item) => item.id === hold.id);
    if (index >= 0) this.state.holds[index] = clone(hold);
    else this.state.holds.push(clone(hold));
    return clone(hold);
  }

  async lockBookingDate(localDate: string) {
    void localDate;
  }
}
