import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getAvailabilitySlots } from "@/domain/booking/availability";
import type { CmsBooking } from "@/domain/cms/types";
import { bookingPrivacyNotice } from "@/domain/privacy";
import { assertLivePublicBookingReady } from "@/server/booking/readiness";
import { readTransactionalAvailability } from "@/server/booking/transactional-availability";
import { appendCmsAudit } from "@/server/cms/audit";
import { CmsValidationError } from "@/server/cms/content-validation";
import { getCmsRepository } from "@/server/cms/repositories";
import { CmsConflictError } from "@/server/cms/repositories/repository";
import {
  deliverOwnerBookingRequestEmail,
  ensureOwnerBookingRequestEmail,
  recordBookingNotificationPlan,
  recordOwnerBookingRequestEmail,
  shouldRetryOwnerBookingEmail,
} from "@/server/cms/notification-service";
import type { OwnerBookingEmailSender } from "@/server/booking/resend-booking-email";

export class PublicBookingRateLimitError extends Error {
  constructor() {
    super("Too many booking attempts. Please wait and try again.");
    this.name = "PublicBookingRateLimitError";
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function text(value: unknown, field: string, minimum: number, maximum: number) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length < minimum || parsed.length > maximum) {
    throw new CmsValidationError("Please check your booking details.", {
      [field]: `Use between ${minimum} and ${maximum} characters.`,
    });
  }
  return parsed;
}

function optionalText(value: unknown, maximum: number) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length > maximum) {
    throw new CmsValidationError(`Text cannot exceed ${maximum} characters.`);
  }
  return parsed;
}

function reference(localDate: string) {
  return `SRN-${localDate.replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function isDuplicateKeyError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    Number((error as { code?: unknown }).code) === 11000
  );
}

export async function checkPublicBookingRateLimit(address: string) {
  const repository = getCmsRepository();
  const key = hash(`public-booking|${address.slice(0, 200)}`);
  const now = Date.now();

  await repository.transaction(async (transaction) => {
    const current = await transaction.getLoginAttempt(key);
    const active = current && current.expiresAt > new Date(now).toISOString();
    const count = active ? current.count : 0;

    if (count >= 5) throw new PublicBookingRateLimitError();

    await transaction.saveLoginAttempt({
      key,
      count: count + 1,
      lockedUntil: "",
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
    });
  });
}

export async function createPublicBooking(
  value: unknown,
  input: {
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly sendOwnerBookingEmail?: OwnerBookingEmailSender;
  },
) {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const forbidden = [
    "assignedStaffId",
    "therapist",
    "therapistId",
    "staffId",
    "calendarId",
    "price",
    "priceCents",
  ];
  if (forbidden.some((field) => field in source)) {
    throw new CmsValidationError(
      "Booking fields and pricing are controlled by the spa.",
    );
  }
  if (String(source.website ?? "").trim()) {
    throw new CmsValidationError("The booking request could not be accepted.");
  }
  if (source.privacyAccepted !== true) {
    throw new CmsValidationError("Accept the privacy notice to request a booking.");
  }

  const customerName = text(source.customerName, "customerName", 2, 100);
  const phone = text(source.phone, "phone", 7, 30);
  if (!/^\+?[\d\s().-]{7,30}$/.test(phone)) {
    throw new CmsValidationError("Enter a valid phone number.", {
      phone: "Enter a valid phone number.",
    });
  }
  const email = optionalText(source.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CmsValidationError("Enter a valid email address.", {
      email: "Enter a valid email address.",
    });
  }

  const notes = optionalText(source.notes, 600);
  const serviceId = text(source.serviceId, "serviceId", 2, 120);
  const durationMinutes = Number(source.durationMinutes);
  const localDate = String(source.localDate ?? "").trim();
  const localTime = String(source.localTime ?? "").trim();
  if (
    !Number.isInteger(durationMinutes) ||
    !datePattern.test(localDate) ||
    !timePattern.test(localTime)
  ) {
    throw new CmsValidationError("Choose a valid treatment, date and time.");
  }
  if (
    input.idempotencyKey.length < 16 ||
    input.idempotencyKey.length > 200
  ) {
    throw new CmsValidationError("The booking request identifier is invalid.");
  }

  const repository = getCmsRepository();
  const idempotencyKeyHash = hash(input.idempotencyKey);
  const requestFingerprintHash = hash(
    JSON.stringify({
      customerName,
      phone,
      email,
      notes,
      serviceId,
      durationMinutes,
      localDate,
      localTime,
      privacyNoticeVersion: bookingPrivacyNotice.version,
    }),
  );

  const create = () =>
    repository.transaction(async (transaction) => {
      const existing = await transaction.findBookingByIdempotencyHash(
        idempotencyKeyHash,
      );
      if (existing) {
        if (existing.requestFingerprintHash !== requestFingerprintHash) {
          throw new CmsConflictError(
            "This booking request identifier was already used for different details.",
          );
        }
        await ensureOwnerBookingRequestEmail(transaction, existing);
        return { booking: existing, created: false as const };
      }

      const publication = await transaction.getPublishedContent();
      if (!publication) throw new Error("Public booking is disabled.");
      const content = publication.snapshot;
      assertLivePublicBookingReady(content);
      await transaction.lockBookingDate(localDate);

      const service = content.services.find(
        (item) => item.id === serviceId,
      );
      const price = service?.prices.find(
        (item) => item.durationMinutes === durationMinutes && item.active,
      );
      if (!service || !price) {
        throw new CmsValidationError("Choose an available treatment and duration.");
      }

      const { bookings, holds, closures } =
        await readTransactionalAvailability(
          transaction,
          localDate,
          new Date().toISOString(),
        );
      const slot = getAvailabilitySlots({
        localDate,
        durationMinutes,
        settings: content.bookingSettings,
        weeklyHours: content.site.weeklyHours,
        closures,
        bookings,
        holds,
      }).find((item) => item.localTime === localTime);

      if (!slot) {
        throw new CmsConflictError(
          "That time has just become unavailable. Please choose another.",
        );
      }

      const nowDate = new Date();
      const now = nowDate.toISOString();
      const capacityExpiresAt = new Date(
        nowDate.getTime() +
          Math.max(1, content.bookingSettings.holdMinutes) * 60_000,
      ).toISOString();
      const booking: CmsBooking = {
        id: randomUUID(),
        reference: reference(localDate),
        customer: {
          name: customerName,
          phone,
          email,
          notes,
        },
        serviceId: service.id,
        serviceSlug: service.slug,
        serviceName: service.name,
        durationMinutes: price.durationMinutes,
        priceCents: price.priceCents,
        currency: "EUR",
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        localDate,
        localTime,
        timezone: "Europe/Dublin",
        status: "pending",
        source: "website",
        capacityExpiresAt,
        assignedStaffId: "",
        internalNotes:
          "Website request awaiting internal confirmation. Temporary capacity expires automatically if it is not confirmed.",
        privacyAcceptedAt: now,
        privacyNoticeVersion: bookingPrivacyNotice.version,
        holdTokenHash: "",
        idempotencyKeyHash,
        requestFingerprintHash,
        demo: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: "public-booking",
      };

      await transaction.saveBooking(booking);
      await recordBookingNotificationPlan(
        transaction,
        booking,
        "booking-requested",
        { channels: ["dashboard"] },
      );
      await recordOwnerBookingRequestEmail(
        transaction,
        booking,
      );
      await appendCmsAudit(transaction, {
        actor: { id: "public-booking", displayName: "Public booking form" },
        action: "booking.requested",
        entityType: "booking",
        entityId: booking.id,
        summary: `Received website booking request ${booking.reference}.`,
        requestId: input.requestId,
      });
      return {
        booking,
        created: true as const,
      };
    });

  const attemptOwnerEmail = async (booking: CmsBooking) => {
    try {
      const first = await deliverOwnerBookingRequestEmail(
        repository,
        booking,
        input.sendOwnerBookingEmail,
      );
      if (shouldRetryOwnerBookingEmail(first)) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1_000);
        });
        await deliverOwnerBookingRequestEmail(
          repository,
          booking,
          input.sendOwnerBookingEmail,
        );
      }
    } catch {
      console.error(
        `Failed to update the owner booking email outbox for booking ${booking.id}.`,
      );
    }
  };

  try {
    const result = await create();
    await attemptOwnerEmail(result.booking);
    return result.booking;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const existing = await repository.findBookingByIdempotencyHash(
      idempotencyKeyHash,
    );
    if (
      existing &&
      existing.requestFingerprintHash === requestFingerprintHash
    ) {
      try {
        await ensureOwnerBookingRequestEmail(repository, existing);
      } catch {
        console.error(
          `Failed to repair the owner booking email outbox for booking ${existing.id}.`,
        );
      }
      await attemptOwnerEmail(existing);
      return existing;
    }

    throw new CmsConflictError(
      "This booking request identifier was already used. Start a new request.",
    );
  }
}
