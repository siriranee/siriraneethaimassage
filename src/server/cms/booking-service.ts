import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  dublinInstant,
  getAvailabilitySlots,
} from "@/domain/booking/availability";
import {
  canTransitionBookingStatus,
  isTerminalBookingStatus,
} from "@/domain/booking/status";
import { readTransactionalAvailability } from "@/server/booking/transactional-availability";
import {
  bookingSources,
  bookingChangeReasons,
  bookingStatuses,
  type BookingChangeReason,
  type BookingSource,
  type BookingStatus,
  type CmsBooking,
  type CmsClosure,
  type CmsUser,
} from "@/domain/cms/types";
import { appendCmsAudit } from "@/server/cms/audit";
import { CmsValidationError } from "@/server/cms/content-validation";
import { getCmsPiiEncryptionKey } from "@/server/cms/pii";
import {
  bookingNotificationKind,
  recordBookingNotificationPlan,
  recordTherapistBookingEmailPlans,
} from "@/server/cms/notification-service";
import {
  CmsConflictError,
  getCmsRepository,
  type CmsRepository,
} from "@/server/cms/repositories";

type MutationContext = {
  readonly actor: Pick<CmsUser, "id" | "displayName">;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
};

type BookingInput = {
  readonly customerName: string;
  readonly phone: string;
  readonly email: string;
  readonly customerNotes: string;
  readonly serviceId: string;
  readonly therapistId: string;
  readonly durationMinutes: number;
  readonly localDate: string;
  readonly localTime: string;
  readonly status: BookingStatus;
  readonly source: BookingSource;
  readonly internalNotes: string;
};

const staffAssignmentFields = [
  "assignedStaffId",
  "staffId",
  "therapist",
] as const;

function assertNoStaffAssignment(source: Record<string, unknown>) {
  if (staffAssignmentFields.some((field) => field in source)) {
    throw new CmsValidationError(
      "Use therapistId to assign a therapist; stored staff fields are server-managed.",
    );
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

function requiredText(value: unknown, field: string, minimum: number, maximum: number) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length < minimum || parsed.length > maximum) {
    throw new CmsValidationError("Please check the booking details.", {
      [field]: `Use between ${minimum} and ${maximum} characters.`,
    });
  }
  return parsed;
}

function optionalText(value: unknown, maximum: number, field?: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length > maximum) {
    throw new CmsValidationError(
      field ? "Please check the booking details." : `Text cannot exceed ${maximum} characters.`,
      field ? { [field]: `Use no more than ${maximum} characters.` } : {},
    );
  }
  return parsed;
}

function parseBookingInput(value: unknown): BookingInput {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  assertNoStaffAssignment(source);
  const status = String(source.status);
  const bookingSource = String(source.source);
  const durationMinutes = Number(source.durationMinutes);
  const localDate = String(source.localDate ?? "").trim();
  const localTime = String(source.localTime ?? "").trim();
  const phone = requiredText(source.phone, "phone", 7, 30);

  if (!bookingStatuses.some((item) => item === status)) {
    throw new CmsValidationError("Choose a valid booking status.", {
      status: "Choose a valid booking status.",
    });
  }
  if (status !== "pending" && status !== "confirmed") {
    throw new CmsValidationError(
      "New bookings must start as pending or confirmed.",
      { status: "Choose Pending or Confirmed for a new booking." },
    );
  }
  if (!bookingSources.some((item) => item === bookingSource) || bookingSource === "website" || bookingSource === "provider") {
    throw new CmsValidationError("Choose phone, WhatsApp, walk-in or administrator as the source.", {
      source: "Choose Phone, WhatsApp, Walk-in or Administrator.",
    });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
    throw new CmsValidationError("Choose a valid treatment duration.", {
      durationMinutes: "Choose a current treatment duration.",
    });
  }
  if (!datePattern.test(localDate) || !timePattern.test(localTime)) {
    throw new CmsValidationError("Choose a valid date and time.", {
      ...(!datePattern.test(localDate) ? { localDate: "Choose a valid date." } : {}),
      ...(!timePattern.test(localTime) ? { localTime: "Choose an available time." } : {}),
    });
  }
  if (
    !/^\+?[\d\s().-]{7,30}$/.test(phone) ||
    phone.replace(/\D/g, "").length < 7
  ) {
    throw new CmsValidationError("Enter a valid phone number.", {
      phone: "Use 7–30 characters and include at least seven digits.",
    });
  }

  const email = optionalText(source.email, 254, "email").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CmsValidationError("Enter a valid email address.", {
      email: "Enter a valid email address.",
    });
  }

  return {
    customerName: requiredText(source.customerName, "customerName", 2, 100),
    phone,
    email,
    customerNotes: optionalText(source.customerNotes, 1000, "customerNotes"),
    serviceId: requiredText(source.serviceId, "serviceId", 2, 120),
    therapistId: optionalText(source.therapistId, 120, "therapistId"),
    durationMinutes,
    localDate,
    localTime,
    status: status as BookingStatus,
    source: bookingSource as BookingSource,
    internalNotes: optionalText(source.internalNotes, 1000, "internalNotes"),
  };
}

function assertPersistenceReady(repository: CmsRepository) {
  if (repository.mode === "mongodb") {
    getCmsPiiEncryptionKey();
  }
}

async function findSlot(
  repository: CmsRepository,
  input: Pick<BookingInput, "serviceId" | "therapistId" | "durationMinutes" | "localDate" | "localTime">,
  options: {
    readonly excludedBookingId?: string;
    readonly existingAppointment?: boolean;
    readonly ignoreBookingOccupancy?: boolean;
  } = {},
) {
  const content = await repository.getContent();
  const service = content.services.find(
    (item) => item.id === input.serviceId,
  );
  const price = service?.prices.find(
    (item) => item.durationMinutes === input.durationMinutes && item.active,
  );

  if (!service || !price) {
    throw new CmsValidationError("Choose a treatment and active duration.");
  }
  const therapist = input.therapistId
    ? content.team.find(
        (member) =>
          member.id === input.therapistId &&
          member.operationalActive &&
          !member.archived &&
          member.serviceIds.includes(input.serviceId),
      )
    : undefined;
  if (input.therapistId && !therapist) {
    throw new CmsValidationError(
      "Choose an active massage therapist qualified for this treatment.",
      { therapistId: "Choose an active massage therapist." },
    );
  }
  if (
    repository.mode === "mongodb" &&
    (!content.bookingSettings.rulesConfirmed || !content.site.openingHoursConfirmed)
  ) {
    throw new CmsValidationError(
      "Confirm opening hours and booking rules before saving production appointments.",
    );
  }

  const now = new Date().toISOString();
  const { bookings, closures } =
    await readTransactionalAvailability(
      repository,
      input.localDate,
    );
  const slots = getAvailabilitySlots({
    localDate: input.localDate,
    durationMinutes: input.durationMinutes,
    therapistId: therapist?.id,
    // Existing requests can be handled near their start time. Opening hours,
    // closures, therapist eligibility and the prohibition on past slots still
    // apply; a pure confirmation can separately bypass booking occupancy below.
    settings: options.existingAppointment
      ? { ...content.bookingSettings, minimumNoticeMinutes: 0 }
      : content.bookingSettings,
    now,
    weeklyHours: content.site.weeklyHours,
    closures,
    bookings: options.ignoreBookingOccupancy
      ? []
      : bookings.filter(
          (booking) => booking.id !== options.excludedBookingId,
        ),
  });
  const slot = slots.find((item) => item.localTime === input.localTime);

  if (!slot) {
    throw new CmsConflictError(
      "This time is outside opening hours, blocked or fully booked.",
    );
  }

  return { content, price, service, slot, therapist };
}

function bookingReference(localDate: string) {
  return `SRN-${localDate.replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function getAdminAvailability(input: {
  readonly serviceId: string;
  readonly durationMinutes: number;
  readonly localDate: string;
  readonly therapistId?: string;
}) {
  if (!datePattern.test(input.localDate)) {
    throw new CmsValidationError("Choose a valid date.");
  }
  if (!Number.isInteger(input.durationMinutes)) {
    throw new CmsValidationError("Choose a valid duration.");
  }

  const repository = getCmsRepository();
  const content = await repository.getContent();
  const service = content.services.find(
    (item) => item.id === input.serviceId,
  );
  const price = service?.prices.find(
    (item) => item.durationMinutes === input.durationMinutes && item.active,
  );
  if (!service || !price) {
    throw new CmsValidationError("Choose a treatment and active duration.");
  }
  const therapist = input.therapistId
    ? content.team.find(
        (member) =>
          member.id === input.therapistId &&
          member.operationalActive &&
          !member.archived &&
          member.serviceIds.includes(input.serviceId),
      )
    : undefined;
  if (input.therapistId && !therapist) {
    throw new CmsValidationError(
      "Choose an active massage therapist qualified for this treatment.",
    );
  }

  const [bookings, closures] = await Promise.all([
    repository.listConfirmedBookingOccupancy(input.localDate, input.localDate),
    repository.listClosures(input.localDate, input.localDate),
  ]);

  return getAvailabilitySlots({
    localDate: input.localDate,
    durationMinutes: input.durationMinutes,
    therapistId: therapist?.id,
    settings: content.bookingSettings,
    weeklyHours: content.site.weeklyHours,
    closures,
    bookings,
  });
}

export async function createAdminBooking(
  value: unknown,
  context: MutationContext,
) {
  const input = parseBookingInput(value);
  const repository = getCmsRepository();
  assertPersistenceReady(repository);

  const suppliedIdempotencyKey = context.idempotencyKey?.trim();
  if (
    context.idempotencyKey !== undefined &&
    (!suppliedIdempotencyKey ||
      suppliedIdempotencyKey.length < 16 ||
      suppliedIdempotencyKey.length > 200)
  ) {
    throw new CmsValidationError("The booking request identifier is invalid.");
  }
  const idempotencyKeyHash = hash(
    `cms-admin-booking|${context.actor.id}|${suppliedIdempotencyKey ?? randomUUID()}`,
  );
  const requestFingerprintHash = hash(JSON.stringify(input));

  if (repository.mode === "mock" && !/^demo\b/i.test(input.customerName)) {
    throw new CmsValidationError(
      'Local mock bookings must use a fictional name beginning with "Demo".',
    );
  }

  const create = () => repository.transaction(async (transaction) => {
    const existing = await transaction.findBookingByIdempotencyHash(
      idempotencyKeyHash,
    );
    if (existing) {
      if (existing.requestFingerprintHash !== requestFingerprintHash) {
        throw new CmsConflictError(
          "This booking request identifier was already used for different details.",
        );
      }
      return existing;
    }

    if (input.therapistId) await transaction.lockTherapist(input.therapistId);
    await transaction.lockBookingDate(input.localDate);
    const { price, service, slot, therapist } = await findSlot(transaction, input);
    if (input.status === "confirmed" && !therapist) {
      throw new CmsValidationError(
        "Assign an active massage therapist before confirming this booking.",
        { therapistId: "Choose a massage therapist." },
      );
    }
    const now = new Date().toISOString();
    const booking: CmsBooking = {
      id: randomUUID(),
      reference: bookingReference(input.localDate),
      customer: {
        name: input.customerName,
        phone: input.phone,
        email: input.email,
        notes: input.customerNotes,
      },
      serviceId: service.id,
      serviceSlug: service.slug,
      serviceName: service.name,
      durationMinutes: price.durationMinutes,
      priceCents: price.priceCents,
      currency: "EUR",
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      localDate: slot.localDate,
      localTime: slot.localTime,
      timezone: "Europe/Dublin",
      status: input.status,
      source: input.source,
      assignedStaffId: therapist?.id ?? "",
      assignedStaffName: therapist?.name ?? "",
      internalNotes: input.internalNotes,
      privacyAcceptedAt: "",
      privacyNoticeVersion: "admin-captured",
      idempotencyKeyHash,
      requestFingerprintHash,
      demo: repository.mode === "mock",
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: context.actor.id,
    };

    await transaction.saveBooking(booking);
    const notificationKind = bookingNotificationKind(null, booking);
    if (notificationKind) {
      await recordBookingNotificationPlan(transaction, booking, notificationKind);
    }
    await recordTherapistBookingEmailPlans(transaction, null, booking);
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "booking.created",
      entityType: "booking",
      entityId: booking.id,
      summary: `Created booking ${booking.reference} for ${booking.serviceName}.`,
      requestId: context.requestId,
    });
    return booking;
  });

  try {
    return await create();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const existing = await repository.findBookingByIdempotencyHash(
      idempotencyKeyHash,
    );
    if (
      existing &&
      existing.requestFingerprintHash === requestFingerprintHash
    ) {
      return existing;
    }

    throw error;
  }
}

export async function updateAdminBooking(
  bookingId: string,
  value: unknown,
  expectedVersion: number,
  context: MutationContext,
) {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const repository = getCmsRepository();
  assertPersistenceReady(repository);

  assertNoStaffAssignment(source);

  return repository.transaction(async (transaction) => {
    const current = await transaction.getBooking(bookingId);
    if (!current) throw new Error("Booking not found.");
    if (current.version !== expectedVersion) {
      throw new CmsConflictError();
    }

    const nextDate = typeof source.localDate === "string" ? source.localDate : current.localDate;
    const nextTime = typeof source.localTime === "string" ? source.localTime : current.localTime;
    const nextTherapistId =
      typeof source.therapistId === "string"
        ? optionalText(source.therapistId, 120, "therapistId")
        : current.assignedStaffId;
    const statusValue = typeof source.status === "string" ? source.status : current.status;
    if (!bookingStatuses.some((item) => item === statusValue)) {
      throw new CmsValidationError("Choose a valid booking status.", {
        status: "Choose a valid booking status.",
      });
    }
    const status = statusValue as BookingStatus;
    if (!canTransitionBookingStatus(current.status, status)) {
      throw new CmsValidationError(
        `A ${current.status.replaceAll("-", " ")} booking cannot change to ${status.replaceAll("-", " ")}.`,
      );
    }
    const internalNotes = source.internalNotes === undefined
      ? current.internalNotes
      : optionalText(source.internalNotes, 1000, "internalNotes");
    const reasonValue = typeof source.changeReason === "string" ? source.changeReason : "";
    const changeReason = bookingChangeReasons.some((reason) => reason === reasonValue)
      ? (reasonValue as BookingChangeReason)
      : undefined;
    const timeChanged =
      nextDate !== current.localDate || nextTime !== current.localTime;
    const assignmentChanged = nextTherapistId !== current.assignedStaffId;
    if (
      timeChanged &&
      (isTerminalBookingStatus(current.status) || isTerminalBookingStatus(status))
    ) {
      throw new CmsValidationError(
        "Complete the reschedule before moving a booking to a final status.",
        {
          status:
            "Save the new appointment time before moving this booking to a final status.",
        },
      );
    }
    if (
      assignmentChanged &&
      (isTerminalBookingStatus(current.status) || isTerminalBookingStatus(status))
    ) {
      throw new CmsValidationError(
        "Reassign the therapist before moving a booking to a final status.",
        {
          therapistId:
            "Save the therapist reassignment before moving this booking to a final status.",
        },
      );
    }
    const appointmentChanged =
      status !== current.status ||
      timeChanged ||
      assignmentChanged;
    if (appointmentChanged && status === "confirmed" && !nextTherapistId) {
      throw new CmsValidationError(
        "Assign an active massage therapist before confirming this booking.",
        { therapistId: "Choose a massage therapist." },
      );
    }
    if (appointmentChanged && !changeReason) {
      throw new CmsValidationError(
        "Choose an operational reason when changing appointment status, date, time or therapist.",
        { changeReason: "Choose a reason for changing the appointment." },
      );
    }
    if (appointmentChanged) {
      const therapistIds = [...new Set([current.assignedStaffId, nextTherapistId])]
        .filter(Boolean)
        .sort();
      for (const therapistId of therapistIds) await transaction.lockTherapist(therapistId);
      const lockDates = [...new Set([current.localDate, nextDate])].sort();
      for (const date of lockDates) await transaction.lockBookingDate(date);
    }

    let startsAt = current.startsAt;
    let endsAt = current.endsAt;
    let assignedStaffName = current.assignedStaffName;

    if (
      appointmentChanged && (status === "pending" || status === "confirmed")
    ) {
      const confirmingExistingRequest =
        current.status === "pending" &&
        status === "confirmed" &&
        !timeChanged &&
        !assignmentChanged;
      const result = await findSlot(
        transaction,
        {
          serviceId: current.serviceId,
          therapistId: nextTherapistId,
          durationMinutes: current.durationMinutes,
          localDate: nextDate,
          localTime: nextTime,
        },
        {
          excludedBookingId: current.id,
          existingAppointment: !timeChanged,
          // Pending requests do not reserve capacity. Staff can therefore
          // approve multiple already-received requests for the same time.
          // Hours, closures, therapist eligibility and past dates still apply.
          ignoreBookingOccupancy: confirmingExistingRequest,
        },
      );
      startsAt = result.slot.startsAt;
      endsAt = result.slot.endsAt;
      assignedStaffName = result.therapist?.name ?? "";
    }

    const updated: CmsBooking = {
      ...current,
      startsAt,
      endsAt,
      localDate: nextDate,
      localTime: nextTime,
      status,
      assignedStaffId: nextTherapistId,
      assignedStaffName,
      internalNotes,
      lastChangeReason: appointmentChanged ? changeReason : current.lastChangeReason,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: context.actor.id,
    };

    await transaction.saveBooking(updated, current.version);
    const notificationKind = bookingNotificationKind(current, updated);
    if (notificationKind) {
      await recordBookingNotificationPlan(transaction, updated, notificationKind);
    }
    await recordTherapistBookingEmailPlans(transaction, current, updated);
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "booking.updated",
      entityType: "booking",
      entityId: current.id,
      summary: appointmentChanged
        ? `Updated booking ${current.reference} (${changeReason!.replaceAll("-", " ")}).`
        : `Updated internal handling for booking ${current.reference}.`,
      requestId: context.requestId,
    });
    return updated;
  });
}

export async function deleteAdminBooking(
  bookingId: string,
  expectedVersion: number,
  context: MutationContext,
) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new CmsValidationError("The booking version is invalid.");
  }

  const repository = getCmsRepository();
  assertPersistenceReady(repository);

  return repository.transaction(async (transaction) => {
    const current = await transaction.getBooking(bookingId);
    if (!current) throw new Error("Booking not found.");
    if (current.version !== expectedVersion) throw new CmsConflictError();

    await transaction.lockBookingDate(current.localDate);
    const deleted = await transaction.deleteBooking(current.id, current.version);
    if (!deleted) throw new Error("Booking not found.");

    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: "booking.deleted",
      entityType: "booking",
      entityId: current.id,
      summary: `Deleted booking ${current.reference}.`,
      requestId: context.requestId,
    });

    return { id: current.id, reference: current.reference } as const;
  });
}

type ClosureInput = {
  readonly localDate: string;
  readonly closedAllDay: boolean;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly reason: string;
  readonly publicLabel: string;
  readonly active: boolean;
  readonly repeatWeeklyCount: number;
};

function parseClosureInput(value: unknown, allowRepeat: boolean): ClosureInput {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const localDate = String(source.localDate ?? "").trim();
  const closedAllDay = source.closedAllDay === true;
  const startsAtLocal = String(source.startsAtLocal ?? "").trim();
  const endsAtLocal = String(source.endsAtLocal ?? "").trim();

  if (!datePattern.test(localDate)) {
    throw new CmsValidationError("Choose a valid closure date.", {
      localDate: "Choose a valid closure date.",
    });
  }
  if (
    !closedAllDay &&
    (!timePattern.test(startsAtLocal) ||
      !timePattern.test(endsAtLocal) ||
      startsAtLocal >= endsAtLocal)
  ) {
    throw new CmsValidationError("Choose a valid closure start and end time.", {
      startsAtLocal: "Choose a valid start time.",
      endsAtLocal: "End time must be later than start time.",
    });
  }

  const repeatWeeklyCount = allowRepeat
    ? Number(source.repeatWeeklyCount ?? 1)
    : 1;
  if (!Number.isInteger(repeatWeeklyCount) || repeatWeeklyCount < 1 || repeatWeeklyCount > 12) {
    throw new CmsValidationError("Repeat a closure between one and twelve weeks.", {
      repeatWeeklyCount: "Use a whole number from 1 to 12.",
    });
  }

  return {
    localDate,
    closedAllDay,
    startsAtLocal: closedAllDay ? "" : startsAtLocal,
    endsAtLocal: closedAllDay ? "" : endsAtLocal,
    reason: requiredText(source.reason, "reason", 2, 200),
    publicLabel: optionalText(source.publicLabel, 120, "publicLabel"),
    active: source.active !== false,
    repeatWeeklyCount,
  };
}

function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function assertClosureHasNoBookingConflict(
  repository: CmsRepository,
  input: ClosureInput,
) {
  if (!input.active) return;
  const bookings = await repository.listBookingOccupancy(
    input.localDate,
    input.localDate,
  );
  const active = bookings.filter(
    (booking) =>
      booking.status === "pending" || booking.status === "confirmed",
  );
  if (!active.length) return;

  const closureStart = input.closedAllDay
    ? Number.NEGATIVE_INFINITY
    : dublinInstant(input.localDate, input.startsAtLocal).epochMilliseconds;
  const closureEnd = input.closedAllDay
    ? Number.POSITIVE_INFINITY
    : dublinInstant(input.localDate, input.endsAtLocal).epochMilliseconds;
  const conflicts = active.some((booking) => {
    const starts = new Date(booking.startsAt).getTime();
    const ends = new Date(booking.endsAt).getTime();
    return starts < closureEnd && closureStart < ends;
  });
  if (conflicts) {
    throw new CmsConflictError(
      "This closure conflicts with an active booking. Reschedule or cancel it first.",
    );
  }
}

export async function createCmsClosure(
  value: unknown,
  context: MutationContext,
) {
  const input = parseClosureInput(value, true);
  const dates = Array.from(
    { length: input.repeatWeeklyCount },
    (_, index) => addDays(input.localDate, index * 7),
  );

  const repository = getCmsRepository();
  return repository.transaction(async (transaction) => {
    for (const localDate of dates) {
      await transaction.lockBookingDate(localDate);
      await assertClosureHasNoBookingConflict(transaction, { ...input, localDate });
    }

    const now = new Date().toISOString();
    const closures: CmsClosure[] = [];
    for (const localDate of dates) {
      const closure: CmsClosure = {
        id: randomUUID(),
        localDate,
        closedAllDay: input.closedAllDay,
        startsAtLocal: input.startsAtLocal,
        endsAtLocal: input.endsAtLocal,
        reason: input.reason,
        publicLabel: input.publicLabel,
        active: input.active,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: context.actor.id,
      };
      await transaction.saveClosure(closure);
      await appendCmsAudit(transaction, {
        actor: context.actor,
        action: "calendar.closure-created",
        entityType: "closure",
        entityId: closure.id,
        summary: `Added a calendar closure for ${localDate}.`,
        requestId: context.requestId,
      });
      closures.push(closure);
    }
    return { ...closures[0], repeatedCount: closures.length };
  });
}

export async function updateCmsClosure(
  closureId: string,
  value: unknown,
  expectedVersion: number,
  context: MutationContext,
) {
  const input = parseClosureInput(value, false);
  const repository = getCmsRepository();
  return repository.transaction(async (transaction) => {
    const current = (await transaction.listClosures()).find((item) => item.id === closureId);
    if (!current) throw new Error("Closure not found.");
    if (current.version !== expectedVersion) throw new CmsConflictError();
    for (const date of [...new Set([current.localDate, input.localDate])].sort()) {
      await transaction.lockBookingDate(date);
    }
    await assertClosureHasNoBookingConflict(transaction, input);
    const updated: CmsClosure = {
      ...current,
      localDate: input.localDate,
      closedAllDay: input.closedAllDay,
      startsAtLocal: input.startsAtLocal,
      endsAtLocal: input.endsAtLocal,
      reason: input.reason,
      publicLabel: input.publicLabel,
      active: input.active,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: context.actor.id,
    };
    await transaction.saveClosure(updated, current.version);
    await appendCmsAudit(transaction, {
      actor: context.actor,
      action: updated.active ? "calendar.closure-updated" : "calendar.closure-deactivated",
      entityType: "closure",
      entityId: updated.id,
      summary: `${updated.active ? "Updated" : "Deactivated"} calendar closure for ${updated.localDate}.`,
      requestId: context.requestId,
    });
    return updated;
  });
}
