import { createHash } from "node:crypto";

import { getAvailabilitySlots } from "../src/domain/booking/availability";
import type { CmsBooking, CmsContentState } from "../src/domain/cms/types";
import type { CmsRepository } from "../src/server/cms/repositories/repository";

// Deliberately excludes customer data, notes, email records and private contacts.
export type AssignmentCandidate = Pick<CmsBooking,
  "id" | "reference" | "status" | "serviceId" | "durationMinutes" |
  "localDate" | "localTime" | "startsAt" | "endsAt" | "version"
> & { readonly assignedStaffId?: string | null; readonly capacityExpiresAt?: string | null };

export type AssignmentRepository = Pick<CmsRepository,
  "lockTherapist" | "lockBookingDate" | "listBookingOccupancy" | "listActiveHolds" | "listClosures"
> & {
  readContent(): Promise<CmsContentState>;
  listCandidates(now: string): Promise<readonly AssignmentCandidate[]>;
  assign(candidate: AssignmentCandidate, therapist: { id: string; name: string }, now: string): Promise<boolean>;
  audit(candidate: AssignmentCandidate, therapistId: string): Promise<void>;
};

export function isAssignmentCandidate(booking: AssignmentCandidate, now: string) {
  return !booking.assignedStaffId && booking.endsAt > now &&
    (booking.status === "confirmed" || booking.status === "pending");
}

export function assignmentPlanHash(therapistId: string, candidates: readonly AssignmentCandidate[]) {
  return createHash("sha256").update(JSON.stringify({ therapistId, candidates })).digest("hex");
}

/** Must run inside one transaction. Dry runs perform no locking or other writes. */
export async function assignUnassignedTherapist(
  repository: AssignmentRepository,
  options: { therapistId: string; apply?: boolean; expectedPlan?: string; now?: string },
) {
  const now = options.now ?? new Date().toISOString();
  if (!options.therapistId.trim()) throw new Error("An exact therapist ID is required.");
  if (options.apply && !/^[a-f0-9]{64}$/.test(options.expectedPlan ?? "")) {
    throw new Error("Apply requires the --expected-plan hash from a reviewed dry run.");
  }
  // Lock therapist before date locks, matching normal booking/content mutation order.
  if (options.apply) await repository.lockTherapist(options.therapistId);
  const content = await repository.readContent();
  const therapist = content.team.find((member) => member.id === options.therapistId);
  if (!therapist || !therapist.operationalActive || therapist.archived) {
    throw new Error("The selected therapist is not active.");
  }
  const candidates = (await repository.listCandidates(now))
    .filter((booking) => isAssignmentCandidate(booking, now))
    .sort((first, second) => first.id.localeCompare(second.id));
  if (candidates.length > 100) throw new Error("More than 100 candidates; stop for a separately reviewed migration.");
  const planHash = assignmentPlanHash(therapist.id, candidates);
  if (options.apply && options.expectedPlan !== planHash) {
    throw new Error("The assignment plan changed. No bookings were changed; review a fresh dry run.");
  }
  const dates = [...new Set(candidates.map((booking) => booking.localDate))].sort();
  if (options.apply) for (const date of dates) await repository.lockBookingDate(date);
  const candidateIds = new Set(candidates.map((booking) => booking.id));
  for (const date of dates) {
    // Do not parallelize operations sharing a MongoDB transaction session.
    const occupancy = (await repository.listBookingOccupancy(date, date)).map((booking) =>
      candidateIds.has(booking.id) ? { ...booking, assignedStaffId: therapist.id } : booking);
    const holds = await repository.listActiveHolds(now);
    const closures = await repository.listClosures(date, date);
    for (const booking of candidates.filter((candidate) => candidate.localDate === date)) {
      if (!Number.isInteger(booking.version) || booking.version < 1 || !therapist.serviceIds.includes(booking.serviceId)) {
        throw new Error(`Cannot assign ${booking.reference}: invalid version or therapist not qualified.`);
      }
      const slots = getAvailabilitySlots({
        localDate: date,
        durationMinutes: booking.durationMinutes,
        therapistId: therapist.id,
        settings: { ...content.bookingSettings, minimumNoticeMinutes: 0 },
        weeklyHours: content.site.weeklyHours,
        bookings: occupancy.filter((candidate) => candidate.id !== booking.id),
        holds, closures, now,
      });
      const slot = slots.find((candidate) => candidate.localTime === booking.localTime);
      if (!slot || Date.parse(slot.startsAt) !== Date.parse(booking.startsAt) || Date.parse(slot.endsAt) !== Date.parse(booking.endsAt)) {
        throw new Error(`Cannot assign ${booking.reference}: appointment conflicts or is outside current availability. No bookings were changed.`);
      }
    }
  }
  // All candidates are validated before the first booking write. Caller rolls
  // back this entire transaction if any compare-and-set or audit insert fails.
  if (options.apply) for (const booking of candidates) {
    if (!await repository.assign(booking, therapist, now)) {
      throw new Error(`Booking ${booking.reference} changed concurrently. No bookings were changed.`);
    }
    await repository.audit(booking, therapist.id);
  }
  return {
    mode: options.apply ? "applied" : "dry-run",
    therapistId: therapist.id,
    planHash,
    count: candidates.length,
    bookings: candidates.map(({ reference, localDate, localTime, status, version }) => ({
      reference, localDate, localTime, status, version,
      ...(options.apply ? { updatedVersion: version + 1 } : {}),
    })),
    emailsSent: 0,
    emailRecordsChanged: 0,
  };
}
