import "server-only";

import {
  bookingEmailAttentionStatuses,
  bookingEmailAttentionDeliveryStatuses,
  type CmsBookingEmailAttention,
} from "@/domain/cms/notification-presentation";

import {
  MongoServerError,
  type ClientSession,
  type Db,
  type Document,
  type Filter,
} from "mongodb";

import type {
  CmsAuditEvent,
  CmsBooking,
  CmsFutureTherapistBooking,
  CmsBookingHold,
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
  CmsUser,
} from "@/domain/cms/types";
import {
  isInternalBookingStatus,
  type PublicBookingIdentifier,
} from "@/domain/booking/public-status";
import { getCmsAuditExpiryDate } from "@/server/cms/audit-retention";
import {
  CMS_PUBLICATION_RETENTION_COUNT,
  getCmsBookingExpiryDate,
  getCmsDayLockExpiryDate,
  getCmsNotificationExpiryDate,
} from "@/server/cms/data-retention";
import { createDefaultContentState } from "@/server/cms/default-content";
import { decryptCmsPii, encryptCmsPii } from "@/server/cms/pii";
import {
  getMongoClient,
  getMongoDatabase,
} from "@/server/cms/repositories/mongo-client";
import {
  CmsConflictError,
  type CmsRepository,
} from "@/server/cms/repositories/repository";
import { cmsContentReferencesMediaAsset } from "@/server/media/references";
import { applyEmailDeliveryEvent } from "@/domain/booking/email-delivery";

const collections = {
  content: "cmsContent",
  publications: "cmsPublications",
  therapistContacts: "cmsTherapistContacts",
  mediaAssets: "cmsMediaAssets",
  meta: "cmsMeta",
  users: "cmsUsers",
  sessions: "cmsSessions",
  loginAttempts: "cmsLoginAttempts",
  audit: "cmsAuditEvents",
  bookings: "cmsBookings",
  closures: "cmsClosures",
  holds: "cmsBookingHolds",
  notifications: "cmsBookingNotifications",
  emailDeliveryEvents: "cmsBookingEmailDeliveryEvents",
  dayLocks: "cmsBookingDayLocks",
  therapistLocks: "cmsTherapistLocks",
} as const;

type Identified = { readonly id: string };
type CmsMongoDocument = Document & { _id: string };

function encode<T extends Identified>(value: T) {
  const { id, ...rest } = value;
  return { _id: id, ...rest };
}

function decode<T extends Identified>(value: Document | null): T | null {
  if (!value) return null;
  const { _id, ...rest } = value;
  return { id: String(_id), ...rest } as T;
}

function decodeAudit(value: Document | null): CmsAuditEvent | null {
  if (!value) return null;
  const { _id, ...stored } = value;
  delete stored.expiresAtDate;
  return { id: String(_id), ...stored } as CmsAuditEvent;
}

function rethrowCmsUserWriteError(error: unknown): never {
  if (error instanceof MongoServerError && error.code === 11000) {
    throw new CmsConflictError("That username is already in use.");
  }

  throw error;
}

function encodeBooking(value: CmsBooking): CmsMongoDocument {
  const { id, customer, ...rest } = value;
  return {
    _id: id,
    ...rest,
    customerEncrypted: encryptCmsPii(JSON.stringify(customer)),
  };
}

function decodeBooking(value: Document | null): CmsBooking | null {
  if (!value) return null;
  const { _id, customerEncrypted, ...rest } = value;
  delete rest.retentionExpiresAtDate;

  if (typeof customerEncrypted !== "string") {
    throw new Error("Booking customer data is not encrypted.");
  }

  const customer = JSON.parse(decryptCmsPii(customerEncrypted)) as CmsBooking["customer"];
  return {
    id: String(_id),
    ...rest,
    assignedStaffId:
      typeof rest.assignedStaffId === "string" ? rest.assignedStaffId : "",
    assignedStaffName:
      typeof rest.assignedStaffName === "string" ? rest.assignedStaffName : "",
    customer,
  } as CmsBooking;
}

function encodeTherapistContact(
  value: CmsTherapistContact,
): CmsMongoDocument {
  const { id, notificationEmail, contactPhone, ...rest } = value;
  return {
    _id: id,
    ...rest,
    contactEncrypted: encryptCmsPii(
      JSON.stringify({ notificationEmail, contactPhone }),
    ),
  };
}

function decodeTherapistContact(
  value: Document | null,
): CmsTherapistContact | null {
  if (!value) return null;
  const { _id, contactEncrypted, ...rest } = value;
  if (typeof contactEncrypted !== "string") {
    throw new Error("Therapist contact data is not encrypted.");
  }

  const contact = JSON.parse(decryptCmsPii(contactEncrypted)) as {
    readonly notificationEmail?: unknown;
    readonly contactPhone?: unknown;
  };
  if (typeof contact.notificationEmail !== "string") {
    throw new Error("Therapist contact data is invalid.");
  }

  return {
    id: String(_id),
    ...rest,
    notificationEmail: contact.notificationEmail,
    contactPhone:
      typeof contact.contactPhone === "string" ? contact.contactPhone : "",
  } as CmsTherapistContact;
}

function encodeNotification(value: CmsBookingNotification): CmsMongoDocument {
  return {
    ...encode(value),
    expiresAtDate: getCmsNotificationExpiryDate(value.createdAt),
  };
}

function decodeNotification(value: Document | null): CmsBookingNotification | null {
  if (!value) return null;
  const { _id, ...rest } = value;
  delete rest.expiresAtDate;
  return { id: String(_id), ...rest } as CmsBookingNotification;
}

function bookingIncludesSearch(booking: CmsBooking, search: string) {
  return [
    booking.reference,
    booking.customer.name,
    booking.customer.phone,
    booking.customer.email,
    booking.serviceName,
    booking.assignedStaffName,
  ]
    .join(" ")
    .toLowerCase()
    .includes(search.toLowerCase());
}


export class MongoCmsRepository implements CmsRepository {
  readonly mode = "mongodb" as const;

  constructor(private readonly session?: ClientSession) {}

  private options() {
    return this.session ? { session: this.session } : {};
  }

  private async db(): Promise<Db> {
    return getMongoDatabase();
  }

  async transaction<T>(
    work: (repository: CmsRepository) => Promise<T>,
  ): Promise<T> {
    if (this.session) {
      return work(this);
    }

    const client = await getMongoClient();
    const session = client.startSession();

    try {
      return await session.withTransaction(() =>
        work(new MongoCmsRepository(session)),
      );
    } finally {
      await session.endSession();
    }
  }

  async getContent() {
    const db = await this.db();
    const collection = db.collection<CmsMongoDocument>(collections.content);
    const existing = decode<CmsContentState>(
      await collection.findOne(
        { _id: "siriranee-content" },
        this.options(),
      ),
    );

    if (existing) return existing;

    const seeded = createDefaultContentState();
    await collection.updateOne(
      { _id: seeded.id },
      { $setOnInsert: encode(seeded) },
      { ...this.options(), upsert: true },
    );

    return (
      decode<CmsContentState>(
        await collection.findOne({ _id: seeded.id }, this.options()),
      ) ?? seeded
    );
  }

  async saveContent(content: CmsContentState, expectedRevision: number) {
    const db = await this.db();
    const result = await db.collection<CmsMongoDocument>(collections.content).replaceOne(
      { _id: content.id, revision: expectedRevision },
      encode(content),
      this.options(),
    );

    if (result.matchedCount !== 1) throw new CmsConflictError();
    return content;
  }

  async getPublishedContent() {
    const db = await this.db();
    const pointer = await db
      .collection<CmsMongoDocument>(collections.meta)
      .findOne({ _id: "current-publication" }, this.options());
    const publicationId = pointer?.publicationId;

    if (typeof publicationId !== "string") return null;

    return decode<CmsPublication>(
      await db
        .collection<CmsMongoDocument>(collections.publications)
        .findOne({ _id: publicationId }, this.options()),
    );
  }

  async getPublication(id: string) {
    const db = await this.db();
    return decode<CmsPublication>(
      await db.collection<CmsMongoDocument>(collections.publications).findOne(
        { _id: id },
        this.options(),
      ),
    );
  }

  async listPublications(limit = 25) {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.publications)
      .find({}, this.options())
      .sort({ publishedAt: -1 })
      .limit(Math.max(1, Math.min(limit, 100)))
      .toArray();
    return rows.map((row) => decode<CmsPublication>(row)!);
  }

  async savePublication(publication: CmsPublication) {
    const db = await this.db();
    const publications = db.collection<CmsMongoDocument>(collections.publications);
    await publications.insertOne(encode(publication), this.options());
    await db.collection<CmsMongoDocument>(collections.meta).updateOne(
      { _id: "current-publication" },
      {
        $set: {
          publicationId: publication.id,
          revision: publication.revision,
          updatedAt: publication.publishedAt,
        },
      },
      { ...this.options(), upsert: true },
    );

    const retained = await publications
      .find({}, this.options())
      .sort({ publishedAt: -1, _id: -1 })
      .limit(CMS_PUBLICATION_RETENTION_COUNT)
      .project({ _id: 1 })
      .toArray();
    await publications.deleteMany(
      { _id: { $nin: retained.map((item) => String(item._id)) } },
      this.options(),
    );
  }

  async getTherapistContact(id: string) {
    const db = await this.db();
    return decodeTherapistContact(
      await db
        .collection<CmsMongoDocument>(collections.therapistContacts)
        .findOne({ _id: id }, this.options()),
    );
  }

  async saveTherapistContact(
    contact: CmsTherapistContact,
    expectedVersion?: number,
  ) {
    const db = await this.db();
    const collection = db.collection<CmsMongoDocument>(
      collections.therapistContacts,
    );

    if (expectedVersion === undefined) {
      try {
        await collection.insertOne(
          encodeTherapistContact(contact),
          this.options(),
        );
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11_000) {
          throw new CmsConflictError();
        }
        throw error;
      }
      return contact;
    }

    const result = await collection.replaceOne(
      { _id: contact.id, version: expectedVersion },
      encodeTherapistContact(contact),
      this.options(),
    );
    if (result.matchedCount !== 1) throw new CmsConflictError();
    return contact;
  }

  async getMediaAsset(publicId: string) {
    const db = await this.db();
    return decode<CmsMediaAsset>(
      await db
        .collection<CmsMongoDocument>(collections.mediaAssets)
        .findOne({ _id: publicId }, this.options()),
    );
  }

  async saveMediaAsset(asset: CmsMediaAsset, expectedVersion?: number) {
    const db = await this.db();
    const collection = db.collection<CmsMongoDocument>(collections.mediaAssets);

    if (expectedVersion === undefined) {
      try {
        await collection.insertOne(encode(asset), this.options());
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 11_000
        ) {
          throw new CmsConflictError("This image already exists.");
        }
        throw error;
      }
      return asset;
    }

    const result = await collection.replaceOne(
      { _id: asset.id, version: expectedVersion },
      encode(asset),
      this.options(),
    );
    if (result.matchedCount !== 1) throw new CmsConflictError();
    return asset;
  }

  async isMediaAssetReferenced(publicId: string, secureUrl: string) {
    const db = await this.db();
    const asset = { publicId, secureUrl };
    const current = decode<CmsContentState>(
      await db
        .collection<CmsMongoDocument>(collections.content)
        .findOne({ _id: "siriranee-content" }, this.options()),
    );
    if (current && cmsContentReferencesMediaAsset(current, asset)) return true;

    const cursor = db
      .collection<CmsMongoDocument>(collections.publications)
      .find({}, this.options())
      .project({ snapshot: 1 });

    for await (const row of cursor) {
      const snapshot = row.snapshot as CmsContentState | undefined;
      if (snapshot && cmsContentReferencesMediaAsset(snapshot, asset)) {
        return true;
      }
    }

    return false;
  }

  async findUserByUsername(username: string) {
    const db = await this.db();
    return decode<CmsUser>(
      await db
        .collection<CmsMongoDocument>(collections.users)
        .findOne({ username: username.toLowerCase() }, this.options()),
    );
  }

  async findUserById(id: string) {
    const db = await this.db();
    return decode<CmsUser>(
      await db.collection<CmsMongoDocument>(collections.users).findOne({ _id: id }, this.options()),
    );
  }

  async listUsers() {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.users)
      .find({}, this.options())
      .sort({ displayName: 1 })
      .toArray();
    return rows.map((row) => decode<CmsUser>(row)!);
  }

  async insertUser(user: CmsUser) {
    const db = await this.db();
    try {
      await db
        .collection<CmsMongoDocument>(collections.users)
        .insertOne(encode(user), this.options());
    } catch (error) {
      rethrowCmsUserWriteError(error);
    }
  }

  async updateUser(user: CmsUser, expectedVersion: number) {
    const db = await this.db();
    const versionFilter: Filter<CmsMongoDocument> =
      expectedVersion === 0
        ? {
            _id: user.id,
            $or: [{ version: 0 }, { version: { $exists: false } }],
          }
        : { _id: user.id, version: expectedVersion };

    try {
      const fields = {
        username: user.username,
        ...(user.email ? { email: user.email } : {}),
        displayName: user.displayName,
        passwordHash: user.passwordHash,
        role: user.role,
        active: user.active,
        authVersion: user.authVersion,
        version: user.version,
        passwordChangedAt: user.passwordChangedAt,
        createdAt: user.createdAt,
      };
      const result = await db
        .collection<CmsMongoDocument>(collections.users)
        .updateOne(
          versionFilter,
          {
            $set: fields,
            $max: { updatedAt: user.updatedAt },
          },
          this.options(),
        );
      if (!result.matchedCount) throw new CmsConflictError();
    } catch (error) {
      rethrowCmsUserWriteError(error);
    }
  }

  async recordUserLogin(
    userId: string,
    expectedAuthVersion: number,
    timestamp: string,
  ) {
    const db = await this.db();
    return decode<CmsUser>(
      await db.collection<CmsMongoDocument>(collections.users).findOneAndUpdate(
        { _id: userId, active: true, authVersion: expectedAuthVersion },
        { $set: { lastLoginAt: timestamp, updatedAt: timestamp } },
        { ...this.options(), returnDocument: "after" },
      ),
    );
  }

  async lockUserDirectory() {
    const db = await this.db();
    const timestamp = new Date().toISOString();
    await db.collection<CmsMongoDocument>(collections.meta).updateOne(
      { _id: "cms-user-directory-lock" },
      {
        $inc: { sequence: 1 },
        $set: { updatedAt: timestamp },
        $setOnInsert: { createdAt: timestamp },
      },
      { ...this.options(), upsert: true },
    );
  }

  async findSessionByTokenHash(tokenHash: string) {
    const db = await this.db();
    return decode<CmsSession>(
      await db
        .collection<CmsMongoDocument>(collections.sessions)
        .findOne({ tokenHash }, this.options()),
    );
  }

  async saveSession(session: CmsSession) {
    const db = await this.db();
    await db.collection<CmsMongoDocument>(collections.sessions).replaceOne(
      { _id: session.id },
      {
        ...encode(session),
        expiresAtDate: new Date(session.expiresAt),
      },
      { ...this.options(), upsert: true },
    );
  }

  async deleteSession(tokenHash: string) {
    const db = await this.db();
    await db
      .collection<CmsMongoDocument>(collections.sessions)
      .deleteOne({ tokenHash }, this.options());
  }

  async deleteSessionsForUser(userId: string) {
    const db = await this.db();
    await db
      .collection<CmsMongoDocument>(collections.sessions)
      .deleteMany({ userId }, this.options());
  }

  async getLoginAttempt(key: string) {
    const db = await this.db();
    const value = await db
      .collection<CmsMongoDocument>(collections.loginAttempts)
      .findOne({ _id: key }, this.options());

    if (!value) return null;

    return {
      key,
      count: Number(value.count ?? 0),
      lockedUntil: String(value.lockedUntil ?? ""),
      expiresAt: String(value.expiresAt ?? ""),
    };
  }

  async incrementLoginAttempt(key: string, expiresAt: string) {
    const db = await this.db();
    const collection = db.collection<CmsMongoDocument>(
      collections.loginAttempts,
    );
    await collection.updateOne(
      { _id: key },
      {
        $inc: { count: 1 },
        $setOnInsert: {
          lockedUntil: "",
          expiresAt,
          expiresAtDate: new Date(expiresAt),
        },
      },
      { ...this.options(), upsert: true },
    );
    const value = await collection.findOne({ _id: key }, this.options());
    if (!value) throw new Error("The login throttle could not be recorded.");

    return {
      key,
      count: Number(value.count ?? 0),
      lockedUntil: String(value.lockedUntil ?? ""),
      expiresAt: String(value.expiresAt ?? expiresAt),
    };
  }

  async saveLoginAttempt(attempt: CmsLoginAttempt) {
    const db = await this.db();
    await db.collection<CmsMongoDocument>(collections.loginAttempts).replaceOne(
      { _id: attempt.key },
      {
        _id: attempt.key,
        count: attempt.count,
        lockedUntil: attempt.lockedUntil,
        expiresAt: attempt.expiresAt,
        expiresAtDate: new Date(attempt.expiresAt),
      },
      { ...this.options(), upsert: true },
    );
  }

  async deleteLoginAttempt(key: string) {
    const db = await this.db();
    await db
      .collection<CmsMongoDocument>(collections.loginAttempts)
      .deleteOne({ _id: key }, this.options());
  }

  async appendAudit(event: CmsAuditEvent) {
    const db = await this.db();
    await db
      .collection<CmsMongoDocument>(collections.audit)
      .insertOne(
        {
          ...encode(event),
          expiresAtDate: getCmsAuditExpiryDate(event.createdAt),
        },
        this.options(),
      );
  }

  async listAudit(limit = 100) {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.audit)
      .find({}, this.options())
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 500)))
      .toArray();
    return rows.map((row) => decodeAudit(row)!);
  }

  async listAuditForEntity(entityType: string, entityId: string, limit = 100) {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.audit)
      .find({ entityType, entityId }, this.options())
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 500)))
      .toArray();
    return rows.map((row) => decodeAudit(row)!);
  }

  async listBookingOccupancy(
    from: string,
    to: string,
  ): Promise<readonly CmsBookingOccupancy[]> {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.bookings)
      .find(
        { localDate: { $gte: from, $lte: to } },
        {
          ...this.options(),
          projection: {
            _id: 1,
            localDate: 1,
            startsAt: 1,
            endsAt: 1,
            status: 1,
            capacityExpiresAt: 1,
            assignedStaffId: 1,
          },
        },
      )
      .sort({ startsAt: 1 })
      .toArray();

    return rows.map((row) => ({
      id: String(row._id),
      localDate: String(row.localDate ?? ""),
      startsAt: String(row.startsAt ?? ""),
      endsAt: String(row.endsAt ?? ""),
      status: String(row.status) as CmsBookingOccupancy["status"],
      expiresAt:
        typeof row.capacityExpiresAt === "string"
          ? row.capacityExpiresAt
          : "",
      assignedStaffId:
        typeof row.assignedStaffId === "string" ? row.assignedStaffId : "",
    }));
  }

  async listBookings(query: CmsBookingQuery = {}) {
    const db = await this.db();
    const filter: Filter<CmsMongoDocument> = {};
    const nowIso = new Date().toISOString();

    if (query.from || query.to) {
      filter.localDate = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.status) filter.status = query.status;
    if (query.source) filter.source = query.source;
    if (query.serviceId) filter.serviceId = query.serviceId;
    if (query.therapistId) filter.assignedStaffId = query.therapistId;
    if (query.attention === "unassigned") {
      filter.$and = [
        {
          $or: [
            { assignedStaffId: "" },
            { assignedStaffId: null },
            { assignedStaffId: { $exists: false } },
          ],
        },
        { endsAt: { $gt: nowIso } },
        {
          $or: [
            { status: "confirmed" },
            {
              status: "pending",
              $or: [
                { capacityExpiresAt: "" },
                { capacityExpiresAt: null },
                { capacityExpiresAt: { $exists: false } },
                { capacityExpiresAt: { $gt: nowIso } },
              ],
            },
          ],
        },
      ];
    }
    const rows = await db
      .collection<CmsMongoDocument>(collections.bookings)
      .find(filter, this.options())
      .sort({ startsAt: 1 })
      .limit(1000)
      .toArray();

    const bookings = rows.map((row) => decodeBooking(row)!);
    return bookings.filter((booking) => {
      if (query.search && !bookingIncludesSearch(booking, query.search.slice(0, 100))) return false;
      if (
        query.attention === "expired" &&
        !(
          booking.status === "pending" &&
          booking.capacityExpiresAt &&
          booking.capacityExpiresAt <= nowIso
        )
      ) return false;
      return true;
    });
  }

  async listFutureActiveTherapistBookings(
    therapistId: string,
    afterIso: string,
  ): Promise<readonly CmsFutureTherapistBooking[]> {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.bookings)
      .find(
        {
          assignedStaffId: therapistId,
          endsAt: { $gt: afterIso },
          $or: [
            { status: "confirmed" },
            {
              status: "pending",
              $or: [
                { capacityExpiresAt: "" },
                { capacityExpiresAt: null },
                { capacityExpiresAt: { $exists: false } },
                { capacityExpiresAt: { $gt: afterIso } },
              ],
            },
          ],
        },
        {
          ...this.options(),
          projection: { _id: 0, reference: 1, serviceId: 1 },
        },
      )
      .sort({ startsAt: 1 })
      .toArray();

    return rows.flatMap((row) =>
      typeof row.reference === "string" && typeof row.serviceId === "string"
        ? [{ reference: row.reference, serviceId: row.serviceId }]
        : [],
    );
  }

  async getBooking(id: string) {
    const db = await this.db();
    return decodeBooking(
      await db
        .collection<CmsMongoDocument>(collections.bookings)
        .findOne({ _id: id }, this.options()),
    );
  }

  async findBookingPublicStatus(identifier: PublicBookingIdentifier) {
    const db = await this.db();
    const row = await db
      .collection<CmsMongoDocument>(collections.bookings)
      .findOne(
        identifier.kind === "id"
          ? { _id: identifier.value }
          : { reference: identifier.value },
        {
          ...this.options(),
          projection: { _id: 0, status: 1, capacityExpiresAt: 1 },
        },
      );

    if (!row || !isInternalBookingStatus(row.status)) return null;

    return {
      status: row.status,
      capacityExpiresAt:
        typeof row.capacityExpiresAt === "string"
          ? row.capacityExpiresAt
          : "",
    };
  }

  async findBookingByIdempotencyHash(hash: string) {
    const db = await this.db();
    return decodeBooking(
      await db
        .collection<CmsMongoDocument>(collections.bookings)
        .findOne({ idempotencyKeyHash: hash }, this.options()),
    );
  }

  async saveBooking(booking: CmsBooking, expectedVersion?: number) {
    const db = await this.db();
    const filter: Filter<CmsMongoDocument> = { _id: booking.id };
    if (expectedVersion !== undefined) filter.version = expectedVersion;

    const result = await db.collection<CmsMongoDocument>(collections.bookings).replaceOne(
      filter,
      {
        ...encodeBooking(booking),
        retentionExpiresAtDate: getCmsBookingExpiryDate(booking.startsAt),
      },
      { ...this.options(), upsert: expectedVersion === undefined },
    );

    if (expectedVersion !== undefined && result.matchedCount !== 1) {
      throw new CmsConflictError();
    }

    return booking;
  }

  async deleteBooking(id: string, expectedVersion: number) {
    const db = await this.db();
    const result = await db
      .collection<CmsMongoDocument>(collections.bookings)
      .deleteOne({ _id: id, version: expectedVersion }, this.options());

    if (result.deletedCount !== 1) {
      if (await this.getBooking(id)) throw new CmsConflictError();
      return false;
    }

    await db
      .collection<CmsMongoDocument>(collections.notifications)
      .deleteMany({ bookingId: id }, this.options());
    return true;
  }

  async listClosures(from?: string, to?: string) {
    const db = await this.db();
    const filter: Filter<CmsMongoDocument> = {};

    if (from || to) {
      filter.localDate = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const rows = await db
      .collection<CmsMongoDocument>(collections.closures)
      .find(filter, this.options())
      .sort({ localDate: 1 })
      .toArray();
    return rows.map((row) => decode<CmsClosure>(row)!);
  }

  async saveClosure(closure: CmsClosure, expectedVersion?: number) {
    const db = await this.db();
    const filter: Filter<CmsMongoDocument> = { _id: closure.id };
    if (expectedVersion !== undefined) filter.version = expectedVersion;

    const result = await db.collection<CmsMongoDocument>(collections.closures).replaceOne(
      filter,
      encode(closure),
      { ...this.options(), upsert: expectedVersion === undefined },
    );

    if (expectedVersion !== undefined && result.matchedCount !== 1) {
      throw new CmsConflictError();
    }

    return closure;
  }

  async listNotifications(bookingId?: string, limit = 200) {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.notifications)
      .find(bookingId ? { bookingId } : {}, this.options())
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 500)))
      .toArray();
    return rows.map((row) => decodeNotification(row)!);
  }

  async listDashboardNotifications(limit = 8) {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.notifications)
      .find({ channel: "dashboard" }, this.options())
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 20)))
      .toArray();
    return rows.map((row) => decodeNotification(row)!);
  }

  async listBookingEmailAttention(bookingIds?: readonly string[], limit = 8) {
    if (bookingIds && !bookingIds.length) return [];
    const db = await this.db();
    return db.collection<CmsMongoDocument>(collections.notifications)
      .aggregate<CmsBookingEmailAttention>([
        { $match: {
          channel: "email", provider: "resend",
          ...(bookingIds ? { bookingId: { $in: [...new Set(bookingIds)].slice(0, 500) } } : {}),
          $or: [
            { status: { $in: [...bookingEmailAttentionStatuses] } },
            { deliveryStatus: { $in: [...bookingEmailAttentionDeliveryStatuses] } },
          ],
        } },
        // Inspect operational state only; never fetch/decrypt customer details.
        { $lookup: {
          from: collections.bookings, localField: "bookingId", foreignField: "_id", as: "bookingState",
          pipeline: [{ $project: { _id: 0, status: 1, demo: 1 } }],
        } },
        { $unwind: "$bookingState" },
        { $match: {
          "bookingState.demo": { $ne: true },
          $nor: [{ audience: "owner", kind: "booking-requested", "bookingState.status": { $ne: "pending" } }],
        } },
        { $group: {
          _id: "$bookingId", bookingReference: { $first: "$bookingReference" },
          count: { $sum: 1 }, audiences: { $addToSet: { $ifNull: ["$audience", "customer"] } },
          updatedAt: { $max: "$updatedAt" },
        } },
        { $sort: { updatedAt: -1, _id: 1 } },
        { $limit: Math.max(1, Math.min(limit, 500)) },
        { $project: { _id: 0, bookingId: "$_id", bookingReference: 1, count: 1, audiences: 1, updatedAt: 1 } },
      ], this.options()).toArray();
  }

  async getNotification(id: string) {
    const db = await this.db();
    return decodeNotification(
      await db
        .collection<CmsMongoDocument>(collections.notifications)
        .findOne({ _id: id }, this.options()),
    );
  }

  async saveNotification(notification: CmsBookingNotification) {
    const db = await this.db();
    await db.collection<CmsMongoDocument>(collections.notifications).replaceOne(
      { _id: notification.id },
      encodeNotification(notification),
      { ...this.options(), upsert: true },
    );
  }

  async recordEmailDeliveryEvent(event: CmsEmailDeliveryEvent) {
    const db = await this.db();
    await db.collection<CmsMongoDocument>(collections.emailDeliveryEvents).updateOne(
      { _id: event.id },
      { $setOnInsert: {
        ...encode(event),
        expiresAtDate: new Date(Date.parse(event.receivedAt) + 30 * 86400_000),
      } },
      { ...this.options(), upsert: true },
    );
    await this.reconcileEmailDeliveryEvents(event.providerMessageId);
  }

  async reconcileEmailDeliveryEvents(providerMessageId: string) {
    const db = await this.db();
    const rows = await db.collection<CmsMongoDocument>(collections.emailDeliveryEvents)
      .find({ providerMessageId }, this.options()).toArray();
    const events = rows.map((row) => decode<CmsEmailDeliveryEvent>(row)!);
    if (!events.length) return;
    const notifications = db.collection<CmsMongoDocument>(collections.notifications);
    // Metadata-only compare-and-swap never replaces a concurrent send result.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = decodeNotification(await notifications.findOne({ providerMessageId }, this.options()));
      if (!current) return; // The provider can deliver before its send response is saved.
      const updated = events.reduce(applyEmailDeliveryEvent, current);
      if (updated === current) return;
      const result = await notifications.updateOne({
        _id: current.id, providerMessageId,
        providerEventId: current.providerEventId ?? { $exists: false },
      }, { $set: {
        deliveryStatus: updated.deliveryStatus,
        providerEventAt: updated.providerEventAt,
        providerEventId: updated.providerEventId,
      } }, this.options());
      if (result.matchedCount === 1) return;
    }
    throw new Error("Email delivery metadata changed concurrently. Retry the event.");
  }

  async saveNotificationIfAbsent(notification: CmsBookingNotification) {
    const db = await this.db();
    await db.collection<CmsMongoDocument>(collections.notifications).updateOne(
      { _id: notification.id },
      { $setOnInsert: encodeNotification(notification) },
      { ...this.options(), upsert: true },
    );
    const stored = await this.getNotification(notification.id);
    if (!stored) throw new Error("Notification outbox insert could not be read.");
    return stored;
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
    const db = await this.db();
    const row = await db
      .collection<CmsMongoDocument>(collections.notifications)
      .findOneAndUpdate(
        {
          _id: id,
          status: expectedStatus,
          attemptCount: expectedAttemptCount,
          deliveryClaimId: expectedClaimId ?? { $exists: false },
        },
        {
          $inc: { attemptCount: 1 },
          $set: {
            status: "sending",
            firstAttemptedAt,
            attemptedAt,
            deliveryClaimId: claimId,
            deliveryClaimedAt: attemptedAt,
            updatedAt: attemptedAt,
          },
        },
        { ...this.options(), returnDocument: "after" },
      );
    return decodeNotification(row);
  }

  async completeNotificationDelivery(
    notification: CmsBookingNotification,
    claimId: string,
  ) {
    const db = await this.db();
    const result = await db
      .collection<CmsMongoDocument>(collections.notifications)
      .replaceOne(
        {
          _id: notification.id,
          status: "sending",
          deliveryClaimId: claimId,
        },
        encodeNotification(notification),
        this.options(),
      );
    if (result.matchedCount === 1 && notification.providerMessageId) {
      await this.reconcileEmailDeliveryEvents(notification.providerMessageId);
    }
    return result.matchedCount === 1;
  }

  async listActiveHolds(nowIso: string) {
    const db = await this.db();
    const rows = await db
      .collection<CmsMongoDocument>(collections.holds)
      .find(
        { status: "active", expiresAt: { $gt: nowIso } },
        this.options(),
      )
      .toArray();
    return rows.map((row) => {
      const hold = decode<CmsBookingHold>(row)!;
      return {
        ...hold,
        assignedStaffId:
          typeof hold.assignedStaffId === "string" ? hold.assignedStaffId : "",
      };
    });
  }

  async findHoldByTokenHash(tokenHash: string) {
    const db = await this.db();
    const hold = decode<CmsBookingHold>(
      await db
        .collection<CmsMongoDocument>(collections.holds)
        .findOne({ tokenHash }, this.options()),
    );
    return hold
      ? {
          ...hold,
          assignedStaffId:
            typeof hold.assignedStaffId === "string"
              ? hold.assignedStaffId
              : "",
        }
      : null;
  }

  async saveHold(hold: CmsBookingHold) {
    const db = await this.db();
    await db.collection<CmsMongoDocument>(collections.holds).replaceOne(
      { _id: hold.id },
      {
        ...encode(hold),
        expiresAtDate: new Date(hold.expiresAt),
      },
      { ...this.options(), upsert: true },
    );
    return hold;
  }

  async lockBookingDate(localDate: string) {
    const db = await this.db();
    const now = new Date().toISOString();
    await db.collection<CmsMongoDocument>(collections.dayLocks).updateOne(
      { _id: localDate },
      {
        $inc: { version: 1 },
        $set: {
          updatedAt: now,
          expiresAtDate: getCmsDayLockExpiryDate(localDate),
        },
        $setOnInsert: { createdAt: now },
      },
      { ...this.options(), upsert: true },
    );
  }

  async lockTherapist(therapistId: string) {
    if (!this.session) throw new Error("Therapist locks require a transaction.");
    const db = await this.db();
    const now = new Date().toISOString();
    try {
      await db.collection<CmsMongoDocument>(collections.therapistLocks).updateOne(
        { _id: therapistId },
        {
          $inc: { version: 1 },
          $set: { updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { ...this.options(), upsert: true },
      );
    } catch (error) {
      // Two first-time assignments may both try to create this lock. Retry the
      // entire transaction so eligibility and occupancy use a fresh snapshot.
      if (error instanceof MongoServerError && error.code === 11000) {
        error.addErrorLabel("TransientTransactionError");
      }
      throw error;
    }
  }
}
